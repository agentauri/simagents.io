/**
 * Experiment Batch Runner
 *
 * Executes scientific experiments against the full tick engine and exports
 * reproducible research bundles with provenance, snapshots, and per-run metrics.
 */

import { getGitCommitHash } from '../utils/git';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import {
  parseYAML,
  parseJSON,
  schemaToSpawnConfig,
  schemaToGenesisSpawnConfig,
  validateSchema,
  autoInjectBaselines,
  getMissingBaselines,
  type ExperimentSchema,
  type ScenarioEvent,
} from './schema';
import {
  createExperiment,
  createVariant,
  updateExperimentStatus,
  updateVariantStatus,
  captureVariantSnapshot,
  getLatestVariantSnapshot,
  getVariantSnapshots,
  type VariantComparisonResult,
} from '../db/queries/experiments';
import { getAliveAgents } from '../db/queries/agents';
import { appendEvent, getEventsByTickRange } from '../db/queries/events';
import { clearCache } from '../cache/projections';
import { getLLMCacheConfig } from '../cache/llm-cache';
import { redis } from '../cache';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { events, ledger } from '../db/schema';
import { initWorldState, resetTickCounter, getCurrentTick } from '../db/queries/world';
import {
  clearWorld,
  resetWorldWithConfig,
  resetWorldWithGenesis,
} from '../agents/spawner';
import {
  initializeRNG,
  randomInt,
  resetRNG,
} from '../utils/random';
import { clearAllScents } from '../world/scent';
import { clearForageCooldowns } from '../actions/handlers/forage';
import { clearPublicWorkSessions } from '../actions/handlers/public-work';
import {
  clearBlackoutState,
  clearScheduledCompositeShocks,
  clearScheduledShocks,
  scheduleShock,
  type ShockConfig,
  type ShockType,
} from '../simulation/shocks';
import { tickEngine } from '../simulation/tick-engine';
import { startWorker, stopWorker } from '../queue';
import {
  analyzeEconomics,
  analyzeSurvival,
  enhancedStatisticalComparison,
  generateExperimentReport,
  reportToCSV,
  reportToJSON,
  type EconomicAnalysis,
  type ExperimentReport,
  type MetricComparison,
  type SurvivalAnalysis,
} from '../analysis/experiment-analysis';
import { holmBonferroniCorrection } from '../analysis/metric-validator';
import {
  applyScientificProfile,
  resolveScientificProfile,
  type BenchmarkWorldName,
  type ExperimentProfileName,
  type ResolvedScientificProfile,
} from './scientific-profile';
import { getRuntimeConfig, setRuntimeConfig } from '../config';
import { getActiveTransformations } from '../llm/prompt-builder';
import { resetQLearningState, clearBaselineAgentCache } from '../agents/baselines';

// =============================================================================
// Types
// =============================================================================

export interface RunnerOptions {
  configPath: string;
  runs?: number;
  outputDir?: string;
  verbose?: boolean;
  tickIntervalMs?: number;
  dryRun?: boolean;
  format?: 'json' | 'csv' | 'both';
  autoInjectBaselines?: boolean;
  baselineConfig?: {
    random?: number;
    rule?: number;
    sugarscape?: number;
    qlearning?: number;
  };
  skipBaselineValidation?: boolean;
}

export interface RunProvenance {
  profile: ExperimentProfileName;
  benchmarkWorld: BenchmarkWorldName;
  resolvedMode: NonNullable<ExperimentSchema['mode']>;
  seed: number;
  codeVersion: string | null;
  llmTypes: string[];
  llmCache: ReturnType<typeof getLLMCacheConfig>;
  activeTransformations: ReturnType<typeof getActiveTransformations>;
  runtimeConfig: ReturnType<typeof getRuntimeConfig>;
  scientificControls: ResolvedScientificProfile['scientificControls'];
  interventions: ResolvedIntervention[];
  notes: string[];
}

export interface RunArtifact {
  snapshotCount: number;
  eventCount: number;
  eventTraceHash: string;
  initialStateHash: string | null;
  finalStateHash: string | null;
}

export interface RunResult {
  experimentId: string;
  variantId: string;
  variantName: string;
  conditionName: string;
  runNumber: number;
  seed: number;
  profile: ExperimentProfileName;
  benchmarkWorld: BenchmarkWorldName;
  ticksCompleted: number;
  initialAgents: number;
  duration: {
    startTime: number;
    endTime: number;
    elapsedMs: number;
  };
  finalMetrics: {
    aliveAgents: number;
    survivalRate: number;
    avgWealth: number;
    avgHealth: number;
    avgHunger: number;
    avgEnergy: number;
    giniCoefficient: number;
    cooperationIndex: number;
    tradeCount: number;
    conflictCount: number;
  };
  provenance: RunProvenance;
  artifact: RunArtifact;
  survivalAnalysis: SurvivalAnalysis;
  economicAnalysis: EconomicAnalysis;
}

interface PlannedRun {
  conditionName: string;
  variantName: string;
  description?: string;
  runNumber: number;
  seed: number;
  schema: ExperimentSchema;
  profile: ResolvedScientificProfile;
  variantRecord: {
    id: string;
    name: string;
  };
}

interface ResolvedIntervention {
  id: string;
  sourceType: ScenarioEvent['type'];
  resolvedTick: number;
  kind: 'shock' | 'rule_change';
  params: Record<string, unknown>;
  description: string;
}

interface ActiveRuleChange {
  intervention: ResolvedIntervention;
  restoreUpdate: Parameters<typeof setRuntimeConfig>[0];
  expiresAtTick: number | null;
}

interface ResearchBundle {
  experiment: {
    id: string;
    name: string;
    hypothesis: string | null;
    configPath: string;
    timestamp: string;
    codeVersion: string | null;
    conditionCount: number;
    totalRuns: number;
  };
  report: ExperimentReport;
  conditions: VariantComparisonResult[];
  runs: RunResult[];
}

type SnapshotMetrics = {
  aliveAgents?: number;
  avgWealth?: number;
  avgHealth?: number;
  avgHunger?: number;
  avgEnergy?: number;
  giniCoefficient?: number;
  cooperationIndex?: number;
  tradeCount?: number;
  conflictCount?: number;
};

type SnapshotState = {
  llmType?: string;
  x?: number;
  y?: number;
  hunger?: number;
  energy?: number;
  balance: number;
  health: number;
  state: string;
};

// =============================================================================
// Configuration Loading
// =============================================================================

export async function loadConfig(configPath: string): Promise<ExperimentSchema> {
  const ext = extname(configPath).toLowerCase();
  const content = readFileSync(configPath, 'utf-8');

  if (ext === '.yaml' || ext === '.yml') {
    return parseYAML(content);
  }

  if (ext === '.json') {
    return parseJSON(content);
  }

  throw new Error(`Unsupported config format: ${ext}. Use .yaml, .yml, or .json`);
}

// =============================================================================
// Helpers
// =============================================================================

function mergeSchemas(base: ExperimentSchema, override: Partial<ExperimentSchema>): ExperimentSchema {
  return {
    ...base,
    ...override,
    world: override.world ? { ...base.world, ...override.world } : base.world,
    resources: override.resources ? { ...base.resources, ...override.resources } : base.resources,
    genesis: override.genesis ? { ...base.genesis, ...override.genesis } : base.genesis,
    agents: override.agents ?? base.agents,
    events: override.events ?? base.events,
    metrics: override.metrics ?? base.metrics,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'run';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NON_DETERMINISTIC_KEYS = new Set([
  'timestamp', 'processingTimeMs', 'updatedAt', 'createdAt', 'diedAt',
  'duration', 'elapsed', 'startTime', 'endTime',
]);

const INFRASTRUCTURE_EVENTS = new Set([
  'tick_start', 'tick_end',
  'experiment_provenance', 'experiment_started', 'experiment_ended',
]);

function stripNonDetFields(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return JSON.stringify(payload);
  const cleaned = Object.fromEntries(
    Object.entries(payload as Record<string, unknown>)
      .filter(([k]) => !NON_DETERMINISTIC_KEYS.has(k))
  );
  return JSON.stringify(cleaned);
}

export function buildDeterministicEventTraceHash(
  eventsToHash: Awaited<ReturnType<typeof getEventsByTickRange>>
): string {
  const idMap = new Map<string, string>();
  let nextId = 1;

  const normalize = (value: unknown, key?: string): unknown => {
    if (key && NON_DETERMINISTIC_KEYS.has(key)) {
      return undefined;
    }

    if (typeof value === 'string' && UUID_PATTERN.test(value)) {
      if (!idMap.has(value)) {
        idMap.set(value, `id_${nextId++}`);
      }
      return idMap.get(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => normalize(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([k]) => !NON_DETERMINISTIC_KEYS.has(k))
          .map(([k, item]) => [k, normalize(item, k)])
      );
    }

    return value;
  };

  // Pre-compute sort keys to avoid repeated JSON.stringify in comparator
  const filtered = eventsToHash
    .filter((event) => !INFRASTRUCTURE_EVENTS.has(event.eventType))
    .map((event) => ({
      event,
      sortKey: stripNonDetFields(event.payload),
    }));

  // Sort BEFORE normalization so UUID→id_N mapping is deterministic
  filtered.sort((a, b) =>
    a.event.tick - b.event.tick ||
    a.event.eventType.localeCompare(b.event.eventType) ||
    String(a.event.agentId ?? '').localeCompare(String(b.event.agentId ?? '')) ||
    a.sortKey.localeCompare(b.sortKey)
  );

  const normalizedEvents = filtered.map(({ event }) => {
    const norm = normalize({
      tick: event.tick,
      eventType: event.eventType,
      agentId: event.agentId,
      payload: event.payload,
    }) as { tick: number; eventType: string; agentId?: string | null; payload: unknown };
    return { ...norm, _payloadKey: JSON.stringify(norm.payload) };
  });

  return hashValue(normalizedEvents);
}

function getCodeVersion(): string | null {
  const envVersion =
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA;

  if (envVersion) {
    return envVersion;
  }

  const hash = getGitCommitHash();
  return hash === 'unknown' ? null : hash;
}

function getInitialAgentCount(metrics: SnapshotMetrics | null, states: SnapshotState[] | null): number {
  return metrics?.aliveAgents ?? states?.filter((state) => state.state !== 'dead').length ?? 0;
}

function normalizeStateHash(states: SnapshotState[] | null): unknown[] | null {
  if (!states) {
    return null;
  }

  return [...states]
    .map((state) => ({
      llmType: state.llmType ?? 'unknown',
      x: state.x ?? 0,
      y: state.y ?? 0,
      hunger: state.hunger ?? 0,
      energy: state.energy ?? 0,
      balance: state.balance,
      health: state.health,
      state: state.state,
    }))
    .sort((left, right) =>
      left.llmType.localeCompare(right.llmType)
      || left.state.localeCompare(right.state)
      || left.x - right.x
      || left.y - right.y
      || left.balance - right.balance
      || left.health - right.health
      || left.hunger - right.hunger
      || left.energy - right.energy
    );
}

function buildRunMetricsFromSnapshots(
  snapshots: Awaited<ReturnType<typeof getVariantSnapshots>>
): {
  initialAgents: number;
  finalMetrics: RunResult['finalMetrics'];
  survivalAnalysis: SurvivalAnalysis;
  economicAnalysis: EconomicAnalysis;
  initialStateHash: string | null;
  finalStateHash: string | null;
} {
  const firstSnapshot = snapshots[0];
  const lastSnapshot = snapshots[snapshots.length - 1];
  const firstMetrics = (firstSnapshot?.metricsSnapshot as SnapshotMetrics | null) ?? null;
  const lastMetrics = (lastSnapshot?.metricsSnapshot as SnapshotMetrics | null) ?? null;
  const firstStates = (firstSnapshot?.agentStates as SnapshotState[] | null) ?? null;
  const lastStates = (lastSnapshot?.agentStates as SnapshotState[] | null) ?? null;

  const initialAgents = getInitialAgentCount(firstMetrics, firstStates);
  const finalAlive =
    lastMetrics?.aliveAgents ??
    lastStates?.filter((state) => state.state !== 'dead').length ??
    0;

  const survivalAnalysis = analyzeSurvival(
    lastSnapshot?.variantId ?? 'unknown',
    'run',
    snapshots.map((snapshot) => ({
      tick: Number(snapshot.tick),
      metricsSnapshot: snapshot.metricsSnapshot as { aliveAgents?: number } | null,
      agentStates: snapshot.agentStates as Array<{ state: string }> | null,
    }))
  );

  const economicAnalysis = analyzeEconomics(
    lastSnapshot?.variantId ?? 'unknown',
    'run',
    snapshots.map((snapshot) => ({
      tick: Number(snapshot.tick),
      metricsSnapshot: snapshot.metricsSnapshot as { giniCoefficient?: number; avgWealth?: number } | null,
      agentStates: snapshot.agentStates as Array<{ balance: number }> | null,
    }))
  );

  const normalizedFirstStates = normalizeStateHash(firstStates);
  const normalizedLastStates = normalizeStateHash(lastStates);

  return {
    initialAgents,
    finalMetrics: {
      aliveAgents: finalAlive,
      survivalRate: initialAgents > 0 ? finalAlive / initialAgents : 0,
      avgWealth: lastMetrics?.avgWealth ?? 0,
      avgHealth: lastMetrics?.avgHealth ?? 0,
      avgHunger: lastMetrics?.avgHunger ?? 0,
      avgEnergy: lastMetrics?.avgEnergy ?? 0,
      giniCoefficient: lastMetrics?.giniCoefficient ?? 0,
      cooperationIndex: lastMetrics?.cooperationIndex ?? 0,
      tradeCount: lastMetrics?.tradeCount ?? 0,
      conflictCount: lastMetrics?.conflictCount ?? 0,
    },
    survivalAnalysis,
    economicAnalysis,
    initialStateHash: normalizedFirstStates ? hashValue(normalizedFirstStates) : null,
    finalStateHash: normalizedLastStates ? hashValue(normalizedLastStates) : null,
  };
}

export async function resetRunnerWorld(): Promise<void> {
  tickEngine.stop();
  tickEngine.clearExperimentContext();
  clearScheduledShocks();
  clearScheduledCompositeShocks();
  clearBlackoutState();
  resetQLearningState();
  clearBaselineAgentCache();
  clearForageCooldowns();
  clearPublicWorkSessions();
  await clearWorld();
  await clearAllScents();
  // Flush all LLM cache and blocklist keys for deterministic experiment runs
  const llmKeys = await redis.keys('llm-cache:*');
  if (llmKeys.length > 0) await redis.del(...llmKeys);
  await db.execute(sql`TRUNCATE TABLE events RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE ledger RESTART IDENTITY CASCADE`);
  await resetTickCounter();
  await initWorldState();
  await clearCache();
}

function resolveAbsoluteTick(relativeTick: number | 'random', duration: number): number {
  if (relativeTick === 'random') {
    return randomInt(1, Math.max(duration + 1, 2));
  }

  return Math.max(0, relativeTick);
}

function buildShockIntervention(event: ScenarioEvent, absoluteTick: number): ResolvedIntervention {
  const shockType = (() => {
    if (event.type === 'disaster') return 'plague';
    if (event.type === 'abundance') return 'resource_boom';
    return (event.params.type as ShockType | undefined) ?? 'resource_collapse';
  })();

  const intensity = Number(event.params.intensity ?? (event.type === 'abundance' ? 0.5 : 0.3));
  const duration = event.params.duration !== undefined ? Number(event.params.duration) : undefined;

  return {
    id: hashValue({ absoluteTick, event }),
    sourceType: event.type,
    resolvedTick: Math.max(1, absoluteTick),
    kind: 'shock',
    params: { type: shockType, intensity, duration },
    description: `${event.type} -> ${shockType} at tick ${Math.max(1, absoluteTick)}`,
  };
}

function buildRuleChangeIntervention(event: ScenarioEvent, absoluteTick: number): ResolvedIntervention {
  return {
    id: hashValue({ absoluteTick, event }),
    sourceType: event.type,
    resolvedTick: absoluteTick,
    kind: 'rule_change',
    params: event.params,
    description: `rule_change at tick ${absoluteTick}`,
  };
}

function resolveInterventions(schema: ExperimentSchema): ResolvedIntervention[] {
  return (schema.events ?? [])
    .map((event) => {
      const absoluteTick = resolveAbsoluteTick(event.tick, schema.duration);
      if (event.type === 'rule_change') {
        return buildRuleChangeIntervention(event, absoluteTick);
      }
      return buildShockIntervention(event, absoluteTick);
    })
    .sort((left, right) => left.resolvedTick - right.resolvedTick);
}

function getRuleChangeUpdate(
  rule: string,
  value: number
): {
  update: Parameters<typeof setRuntimeConfig>[0];
  restore: Parameters<typeof setRuntimeConfig>[0];
} {
  const runtime = getRuntimeConfig();

  switch (rule) {
    case 'hunger_decay':
      return {
        update: { needs: { hungerDecay: value } },
        restore: { needs: { hungerDecay: runtime.needs.hungerDecay } },
      };
    case 'energy_decay':
      return {
        update: { needs: { energyDecay: value } },
        restore: { needs: { energyDecay: runtime.needs.energyDecay } },
      };
    case 'harm_damage':
      return {
        update: {
          actions: {
            harm: {
              damage: {
                light: value,
                moderate: value,
                severe: value,
              },
            },
          },
        },
        restore: {
          actions: {
            harm: {
              damage: {
                light: runtime.actions.harm.damage.light,
                moderate: runtime.actions.harm.damage.moderate,
                severe: runtime.actions.harm.damage.severe,
              },
            },
          },
        },
      };
    default:
      throw new Error(`Unsupported rule_change "${rule}". Supported rules: hunger_decay, energy_decay, harm_damage.`);
  }
}

async function recordInterventionSchedule(interventions: ResolvedIntervention[]): Promise<void> {
  for (const intervention of interventions) {
    await appendEvent({
      eventType: 'experiment_intervention_scheduled',
      tick: 0,
      payload: intervention,
    });
  }
}

async function scheduleShockInterventions(interventions: ResolvedIntervention[]): Promise<void> {
  for (const intervention of interventions) {
    if (intervention.kind !== 'shock') continue;

    const shockConfig: ShockConfig = {
      type: intervention.params.type as ShockType,
      scheduledTick: intervention.resolvedTick,
      intensity: Number(intervention.params.intensity ?? 0.5),
      duration: intervention.params.duration !== undefined
        ? Number(intervention.params.duration)
        : undefined,
      description: intervention.description,
    };

    scheduleShock(shockConfig);
  }
}

async function applyScheduledRuleChanges(
  tick: number,
  pending: ResolvedIntervention[],
  active: ActiveRuleChange[]
): Promise<void> {
  for (let index = pending.length - 1; index >= 0; index--) {
    const intervention = pending[index];
    if (intervention.kind !== 'rule_change' || intervention.resolvedTick !== tick) {
      continue;
    }

    const rule = String(intervention.params.rule ?? '');
    const value = Number(intervention.params.value);
    const durationTicks = intervention.params.durationTicks !== undefined
      ? Number(intervention.params.durationTicks)
      : 0;
    const { update, restore } = getRuleChangeUpdate(rule, value);

    setRuntimeConfig(update);
    active.push({
      intervention,
      restoreUpdate: restore,
      expiresAtTick: durationTicks > 0 ? tick + durationTicks : null,
    });

    await appendEvent({
      eventType: 'experiment_intervention_applied',
      tick,
      payload: {
        ...intervention,
        rule,
        value,
        durationTicks,
        status: 'applied',
      },
    });

    pending.splice(index, 1);
  }
}

async function expireRuleChanges(
  nextTick: number,
  active: ActiveRuleChange[]
): Promise<void> {
  for (let index = active.length - 1; index >= 0; index--) {
    const change = active[index];
    if (change.expiresAtTick === null || change.expiresAtTick > nextTick) {
      continue;
    }

    setRuntimeConfig(change.restoreUpdate);
    await appendEvent({
      eventType: 'experiment_intervention_applied',
      tick: nextTick,
      payload: {
        ...change.intervention,
        status: 'reverted',
      },
    });
    active.splice(index, 1);
  }
}

async function executePlannedRun(
  experimentId: string,
  plan: PlannedRun,
  verbose: boolean,
  tickIntervalMs: number
): Promise<RunResult> {
  const startTime = Date.now();
  const scientificProfile = applyScientificProfile(plan.profile);

  try {
    await resetRunnerWorld();
    resetRNG();
    initializeRNG(String(plan.seed));

    if (plan.schema.genesis?.enabled) {
      await resetWorldWithGenesis(schemaToGenesisSpawnConfig({ ...plan.schema, mode: plan.profile.resolvedMode }));
    } else {
      await resetWorldWithConfig(schemaToSpawnConfig({ ...plan.schema, mode: plan.profile.resolvedMode }));
    }

    const startTick = await getCurrentTick();
    const interventions = resolveInterventions(plan.schema);
    const pendingRuleChanges = interventions.filter((item) => item.kind === 'rule_change');
    const activeRuleChanges: ActiveRuleChange[] = [];

    await recordInterventionSchedule(interventions);
    await scheduleShockInterventions(interventions);

    const provenance: RunProvenance = {
      profile: plan.profile.profile,
      benchmarkWorld: plan.profile.benchmarkWorld,
      resolvedMode: plan.profile.resolvedMode,
      seed: plan.seed,
      codeVersion: getCodeVersion(),
      llmTypes: Array.from(new Set(plan.schema.agents.map((agent) => agent.type))),
      llmCache: getLLMCacheConfig(),
      activeTransformations: getActiveTransformations(),
      runtimeConfig: getRuntimeConfig(),
      scientificControls: plan.profile.scientificControls,
      interventions,
      notes: plan.profile.notes,
    };

    await appendEvent({
      eventType: 'experiment_started',
      tick: startTick,
      payload: {
        experimentId,
        variantId: plan.variantRecord.id,
        variantName: plan.variantName,
        conditionName: plan.conditionName,
        runNumber: plan.runNumber,
      },
    });

    await appendEvent({
      eventType: 'experiment_provenance',
      tick: startTick,
      payload: provenance,
    });

    await updateVariantStatus(plan.variantRecord.id, 'running', { startTick });
    await applyScheduledRuleChanges(startTick, pendingRuleChanges, activeRuleChanges);
    await captureVariantSnapshot(plan.variantRecord.id, startTick);

    tickEngine.setExperimentContext({
      experimentId,
      variantId: plan.variantRecord.id,
      durationTicks: plan.schema.duration,
      startTick,
      variantConfig: {
        useRandomWalk: plan.profile.resolvedMode === 'random_walk',
        useOnlyFallback: plan.profile.resolvedMode === 'fallback',
      },
    });

    while (tickEngine.getExperimentContext()) {
      const nextTick = (await getCurrentTick()) + 1;
      await applyScheduledRuleChanges(nextTick, pendingRuleChanges, activeRuleChanges);

      const tickResult = await tickEngine.processTick();

      if (tickResult.agentCount === 0 && tickEngine.getExperimentContext()) {
        await updateVariantStatus(plan.variantRecord.id, 'completed', { endTick: tickResult.tick });
        tickEngine.clearExperimentContext();
      }

      await expireRuleChanges(tickResult.tick + 1, activeRuleChanges);

      if (verbose && tickResult.tick % 10 === 0) {
        const elapsedTicks = tickResult.tick - startTick;
        const progress = Math.min(100, (elapsedTicks / Math.max(plan.schema.duration, 1)) * 100);
        process.stdout.write(`\r  [Runner] ${plan.variantName}: ${progress.toFixed(0)}% (tick ${elapsedTicks}/${plan.schema.duration})`);
      }

      if (tickIntervalMs > 0) {
        await sleep(tickIntervalMs);
      }
    }

    if (verbose) {
      console.log('');
    }

    while (activeRuleChanges.length > 0) {
      const pending = activeRuleChanges.pop();
      if (!pending) continue;
      setRuntimeConfig(pending.restoreUpdate);
    }

    const endTick = await getCurrentTick();
    const latestSnapshot = await getLatestVariantSnapshot(plan.variantRecord.id);
    if (!latestSnapshot || Number(latestSnapshot.tick) !== endTick) {
      await captureVariantSnapshot(plan.variantRecord.id, endTick);
    }

    await updateVariantStatus(plan.variantRecord.id, 'completed', { endTick });

    const snapshots = await getVariantSnapshots(plan.variantRecord.id);
    const derived = buildRunMetricsFromSnapshots(snapshots);

    await appendEvent({
      eventType: 'experiment_run_summary',
      tick: endTick,
      payload: {
        experimentId,
        variantId: plan.variantRecord.id,
        conditionName: plan.conditionName,
        runNumber: plan.runNumber,
        initialAgents: derived.initialAgents,
        finalMetrics: derived.finalMetrics,
      },
    });

    await appendEvent({
      eventType: 'experiment_ended',
      tick: endTick,
      payload: {
        experimentId,
        variantId: plan.variantRecord.id,
        conditionName: plan.conditionName,
        runNumber: plan.runNumber,
        status: 'completed',
      },
    });

    const runEvents = await getEventsByTickRange(startTick, endTick);
    const endTime = Date.now();

    return {
      experimentId,
      variantId: plan.variantRecord.id,
      variantName: plan.variantName,
      conditionName: plan.conditionName,
      runNumber: plan.runNumber,
      seed: plan.seed,
      profile: plan.profile.profile,
      benchmarkWorld: plan.profile.benchmarkWorld,
      ticksCompleted: endTick - startTick,
      initialAgents: derived.initialAgents,
      duration: {
        startTime,
        endTime,
        elapsedMs: endTime - startTime,
      },
      finalMetrics: derived.finalMetrics,
      provenance,
      artifact: {
        snapshotCount: snapshots.length,
        eventCount: runEvents.length,
        eventTraceHash: buildDeterministicEventTraceHash(runEvents),
        initialStateHash: derived.initialStateHash,
        finalStateHash: derived.finalStateHash,
      },
      survivalAnalysis: {
        ...derived.survivalAnalysis,
        variantId: plan.variantRecord.id,
        variantName: plan.variantName,
      },
      economicAnalysis: {
        ...derived.economicAnalysis,
        variantId: plan.variantRecord.id,
        variantName: plan.variantName,
      },
    };
  } catch (error) {
    const endTick = await getCurrentTick();
    await updateVariantStatus(plan.variantRecord.id, 'failed', { endTick });
    await appendEvent({
      eventType: 'experiment_ended',
      tick: endTick,
      payload: {
        experimentId,
        variantId: plan.variantRecord.id,
        conditionName: plan.conditionName,
        runNumber: plan.runNumber,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    tickEngine.stop();
    tickEngine.clearExperimentContext();
    resetRNG();
    resetQLearningState();
    scientificProfile.restore();
  }
}

function buildConditionComparisons(results: RunResult[]): VariantComparisonResult[] {
  const grouped = new Map<string, RunResult[]>();
  for (const result of results) {
    const existing = grouped.get(result.conditionName) ?? [];
    existing.push(result);
    grouped.set(result.conditionName, existing);
  }

  return Array.from(grouped.entries()).map(([conditionName, runs]) => {
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    return {
      variantId: runs[0]?.variantId ?? conditionName,
      variantName: conditionName,
      ticksRun: Math.round(mean(runs.map((run) => run.ticksCompleted))),
      metrics: {
        avgGiniCoefficient: mean(runs.map((run) => run.finalMetrics.giniCoefficient)),
        avgCooperationIndex: mean(runs.map((run) => run.finalMetrics.cooperationIndex)),
        avgWealth: mean(runs.map((run) => run.finalMetrics.avgWealth)),
        avgHealth: mean(runs.map((run) => run.finalMetrics.avgHealth)),
        avgHunger: mean(runs.map((run) => run.finalMetrics.avgHunger)),
        avgEnergy: mean(runs.map((run) => run.finalMetrics.avgEnergy)),
        survivalRate: mean(runs.map((run) => run.finalMetrics.survivalRate)),
        totalEvents: mean(runs.map((run) => run.artifact.eventCount)),
        tradeCount: mean(runs.map((run) => run.finalMetrics.tradeCount)),
        conflictCount: mean(runs.map((run) => run.finalMetrics.conflictCount)),
      },
      finalState: {
        aliveAgents: Math.round(mean(runs.map((run) => run.finalMetrics.aliveAgents))),
        avgBalance: mean(runs.map((run) => run.finalMetrics.avgWealth)),
        avgHealth: mean(runs.map((run) => run.finalMetrics.avgHealth)),
      },
    };
  });
}

function buildStatisticalComparisons(results: RunResult[]): MetricComparison[] {
  const grouped = new Map<string, RunResult[]>();
  for (const result of results) {
    const existing = grouped.get(result.conditionName) ?? [];
    existing.push(result);
    grouped.set(result.conditionName, existing);
  }

  const conditionEntries = Array.from(grouped.entries());
  const [control] = conditionEntries;
  if (!control) {
    return [];
  }
  if (conditionEntries.length < 2 || conditionEntries.some(([, runs]) => runs.length < 2)) {
    return [];
  }

  const metricMap: Array<{ label: string; accessor: (result: RunResult) => number }> = [
    { label: 'Gini Coefficient', accessor: (result) => result.finalMetrics.giniCoefficient },
    { label: 'Cooperation Index', accessor: (result) => result.finalMetrics.cooperationIndex },
    { label: 'Average Wealth', accessor: (result) => result.finalMetrics.avgWealth },
    { label: 'Average Health', accessor: (result) => result.finalMetrics.avgHealth },
    { label: 'Average Hunger', accessor: (result) => result.finalMetrics.avgHunger },
    { label: 'Average Energy', accessor: (result) => result.finalMetrics.avgEnergy },
    { label: 'Survival Rate', accessor: (result) => result.finalMetrics.survivalRate },
    { label: 'Trade Count', accessor: (result) => result.finalMetrics.tradeCount },
    { label: 'Conflict Count', accessor: (result) => result.finalMetrics.conflictCount },
  ];

  const comparisons: MetricComparison[] = [];
  const controlValues = control[1];

  for (const [conditionName, runs] of conditionEntries.slice(1)) {
    for (const metric of metricMap) {
      const comparison = enhancedStatisticalComparison(
        controlValues.map(metric.accessor),
        runs.map(metric.accessor),
        metric.label
      );
      comparison.metric = `${metric.label} (${control[0]} vs ${conditionName})`;
      comparisons.push(comparison);
    }
  }

  const alpha = 0.05;
  const adjustedPValues = holmBonferroniCorrection(
    comparisons.map((comparison) => comparison.statisticalTest?.pValue ?? 1)
  );

  comparisons.forEach((comparison, index) => {
    comparison.adjustedPValue = adjustedPValues[index];
    comparison.significantAfterCorrection = adjustedPValues[index] < alpha;
    comparison.correctionMethod = 'holm-bonferroni';
  });

  return comparisons;
}

export function hasReplicatedConditions(results: RunResult[]): boolean {
  const grouped = new Map<string, number>();
  for (const result of results) {
    grouped.set(result.conditionName, (grouped.get(result.conditionName) ?? 0) + 1);
  }

  return grouped.size >= 2 && Array.from(grouped.values()).every((count) => count >= 2);
}

export function isValidatedRun(result: RunResult): boolean {
  const controls = result.provenance.scientificControls;

  return result.profile === 'deterministic_baseline'
    && result.benchmarkWorld === 'canonical_core'
    && controls.canonicalMinimalWorld
    && !controls.cooperationIncentivesEnabled
    && !controls.trustPricingEnabled
    && !controls.tradeBonusesEnabled
    && !controls.spoilageEnabled
    && !controls.puzzleEnabled
    && !controls.personalitiesEnabled
    && !controls.llmCacheEnabled
    && !controls.cacheSharingEnabled;
}

export function determineClaimClass(results: RunResult[]): ExperimentReport['claimClass'] {
  if (!hasReplicatedConditions(results)) {
    return 'descriptive_only';
  }

  return results.every((result) => isValidatedRun(result))
    ? 'validated'
    : 'exploratory';
}

const SUPPORTED_SCIENTIFIC_METRICS = new Set([
  'Gini Coefficient',
  'Average Wealth',
  'Average Health',
  'Average Hunger',
  'Average Energy',
  'Survival Rate',
  'Trade Count',
  'Conflict Count',
]);

export function supportsScientificFinding(metric: MetricComparison): boolean {
  const metricLabel = metric.metric.split(' (')[0];
  return SUPPORTED_SCIENTIFIC_METRICS.has(metricLabel);
}

function buildReport(
  experimentId: string,
  experimentName: string,
  hypothesis: string | null,
  results: RunResult[],
  schema?: ExperimentSchema
): ExperimentReport {
  const conditionComparisons = buildConditionComparisons(results);
  const grouped = new Map<string, RunResult[]>();
  for (const result of results) {
    const existing = grouped.get(result.conditionName) ?? [];
    existing.push(result);
    grouped.set(result.conditionName, existing);
  }

  const report = generateExperimentReport(
    experimentId,
    experimentName,
    hypothesis,
    Array.from(grouped.entries()).map(([conditionName, runs]) => ({
      id: runs[0]?.variantId ?? conditionName,
      name: conditionName,
      status: 'completed',
      startTick: 0,
      endTick: Math.round(runs.reduce((sum, run) => sum + run.ticksCompleted, 0) / Math.max(runs.length, 1)),
    })),
    conditionComparisons
  );

  const claimClass = determineClaimClass(results);
  const statisticalComparisons = buildStatisticalComparisons(results);
  if (statisticalComparisons.length > 0) {
    report.metricComparisons = statisticalComparisons;
  }
  // Enforcement: re-verify validated claims cannot be mis-labeled
  let enforcedClaimClass = claimClass;
  if (claimClass === 'validated') {
    const failedRuns = results.filter((r) => !isValidatedRun(r));
    if (failedRuns.length > 0) {
      enforcedClaimClass = 'exploratory';
      report.enforcementWarnings ??= [];
      report.enforcementWarnings.push(
        `Downgraded from validated to exploratory: ${failedRuns.length} run(s) failed validation controls.`
      );
    }
  }
  report.claimClass = enforcedClaimClass;
  report.claimClassEnforced = true;

  report.survivalAnalysis = results.map((result) => result.survivalAnalysis);
  report.economicAnalysis = results.map((result) => result.economicAnalysis);
  report.significantFindings = enforcedClaimClass === 'descriptive_only'
    ? []
    : report.metricComparisons
      .filter((metric) => metric.significantAfterCorrection && supportsScientificFinding(metric))
      .map((metric) =>
        `${metric.metric}: adjusted p=${metric.adjustedPValue?.toFixed(4) ?? 'n/a'} effect=${metric.statisticalTest?.effectInterpretation ?? 'n/a'} (${metric.correctionMethod ?? 'uncorrected'})`
      );

  if (enforcedClaimClass === 'descriptive_only') {
    report.conclusion = 'The current run set is descriptive only. Scientific claims require at least two conditions with at least two runs each.';
  } else if (report.significantFindings.length === 0) {
    report.conclusion = enforcedClaimClass === 'validated'
      ? 'Comparative runs completed under validated controls. No metric survived Holm correction.'
      : 'Comparative exploratory runs completed. No metric survived Holm correction.';
  } else {
    report.conclusion = enforcedClaimClass === 'validated'
      ? `Validated comparative runs completed with ${report.significantFindings.length} Holm-corrected finding(s).`
      : `Exploratory comparative runs completed with ${report.significantFindings.length} Holm-corrected finding(s). Treat them as hypothesis-generating.`;
  }

  // Pre-registration enforcement
  if (schema) {
    enforcePreRegistration(schema, report);
  }

  // Auto-generate threats to validity
  report.threatsToValidity = generateThreatsToValidity(results, enforcedClaimClass, report);

  return report;
}

// =============================================================================
// Threats to Validity
// =============================================================================

function generateThreatsToValidity(
  results: RunResult[],
  claimClass: ExperimentReport['claimClass'],
  report: ExperimentReport
): string[] {
  const threats: string[] = [];

  // Internal validity threats
  const runsPerCondition = new Map<string, number>();
  for (const r of results) {
    runsPerCondition.set(r.conditionName, (runsPerCondition.get(r.conditionName) ?? 0) + 1);
  }
  const minRuns = Math.min(...runsPerCondition.values());

  if (minRuns < 5) {
    threats.push(
      `Small sample size: minimum ${minRuns} run(s) per condition. ` +
      `Statistical power may be insufficient to detect small effects. ` +
      `Use requiredSampleSize() for a priori power analysis.`
    );
  }

  // Check for LLM non-determinism
  const llmRuns = results.filter((r) => r.provenance.resolvedMode === 'llm');
  if (llmRuns.length > 0) {
    threats.push(
      'LLM decision-making is inherently stochastic. Even with fixed seeds, LLM API responses ' +
      'may vary across runs due to model updates, temperature sampling, or provider-side changes. ' +
      'Results should be treated as exploratory unless deterministic_baseline profile is used.'
    );
  }

  // Check for cache effects
  const cachedRuns = results.filter((r) => r.provenance.scientificControls?.llmCacheEnabled);
  if (cachedRuns.length > 0) {
    threats.push(
      `${cachedRuns.length} run(s) had LLM cache enabled. Cached decisions may mask variability ` +
      'in agent behavior and reduce the effective independence of observations.'
    );
  }

  // Check for cooperation/trust incentives
  const incentivizedRuns = results.filter((r) =>
    r.provenance.scientificControls?.cooperationIncentivesEnabled ||
    r.provenance.scientificControls?.trustPricingEnabled ||
    r.provenance.scientificControls?.tradeBonusesEnabled
  );
  if (incentivizedRuns.length > 0) {
    threats.push(
      `${incentivizedRuns.length} run(s) had cooperation/trust incentives enabled. ` +
      'These designed affordances may confound emergent behavior claims. ' +
      'Use canonical_core benchmark world for unconfounded comparisons.'
    );
  }

  // External validity threats
  if (results.length > 0 && results[0].ticksCompleted < 100) {
    threats.push(
      `Short experiment duration (${results[0].ticksCompleted} ticks). ` +
      'Emergent social patterns may require longer runs to stabilize. ' +
      'Results may reflect transient dynamics rather than equilibrium behavior.'
    );
  }

  // Construct validity
  const lowPowerComparisons = report.metricComparisons.filter((mc) => {
    const enhanced = mc as { power?: number };
    return enhanced.power !== undefined && enhanced.power < 0.8;
  });
  if (lowPowerComparisons.length > 0) {
    threats.push(
      `${lowPowerComparisons.length} metric comparison(s) have statistical power below 0.80. ` +
      'Non-significant results may reflect insufficient power rather than true null effects.'
    );
  }

  // Hash consistency
  const seedHashes = new Map<number, Set<string>>();
  for (const r of results) {
    const hashes = seedHashes.get(r.seed) ?? new Set();
    hashes.add(r.artifact.eventTraceHash);
    seedHashes.set(r.seed, hashes);
  }
  const inconsistentSeeds = [...seedHashes.entries()].filter(([, hashes]) => hashes.size > 1);
  if (inconsistentSeeds.length > 0) {
    threats.push(
      `Reproducibility concern: ${inconsistentSeeds.length} seed(s) produced different event traces ` +
      'across runs. This may indicate non-deterministic execution paths.'
    );
  }

  // Descriptive-only warning
  if (claimClass === 'descriptive_only') {
    threats.push(
      'This experiment produced descriptive results only. No comparative statistical claims ' +
      'can be made. At least two conditions with two or more runs each are required.'
    );
  }

  return threats;
}

// =============================================================================
// Pre-Registration Enforcement
// =============================================================================

function enforcePreRegistration(
  schema: { preRegistration?: { hypothesis: string; primaryMetrics: string[]; registeredAt: string; configHash?: string }; hypothesis?: string },
  report: ExperimentReport
): void {
  if (!schema.preRegistration) {
    report.preRegistration = {
      registered: false,
      hypothesis: null,
      primaryMetrics: [],
      registeredAt: null,
      deviations: [],
    };
    return;
  }

  const pr = schema.preRegistration;
  const deviations: string[] = [];

  // Check hypothesis consistency
  if (pr.hypothesis && schema.hypothesis && pr.hypothesis !== schema.hypothesis) {
    deviations.push(
      `Hypothesis modified post-registration. ` +
      `Registered: "${pr.hypothesis.slice(0, 80)}..." ` +
      `Current: "${schema.hypothesis.slice(0, 80)}..."`
    );
  }

  // Check that all pre-registered primary metrics are in the report
  const reportedMetricLabels = new Set(
    report.metricComparisons.map((mc) => mc.metric.split(' (')[0])
  );
  for (const metric of pr.primaryMetrics) {
    if (!reportedMetricLabels.has(metric)) {
      deviations.push(`Pre-registered primary metric "${metric}" not found in report output.`);
    }
  }

  // Flag non-pre-registered significant findings
  const primarySet = new Set(pr.primaryMetrics);
  for (const finding of report.significantFindings) {
    const metricLabel = finding.split(':')[0]?.split(' (')[0]?.trim();
    if (metricLabel && !primarySet.has(metricLabel)) {
      deviations.push(
        `Significant finding on non-pre-registered metric "${metricLabel}". ` +
        'This should be reported as exploratory/post-hoc, not confirmatory.'
      );
    }
  }

  if (deviations.length > 0) {
    report.enforcementWarnings ??= [];
    report.enforcementWarnings.push(
      `Pre-registration deviations detected: ${deviations.length} issue(s). See preRegistration.deviations for details.`
    );
  }

  report.preRegistration = {
    registered: true,
    hypothesis: pr.hypothesis,
    primaryMetrics: pr.primaryMetrics,
    registeredAt: pr.registeredAt,
    deviations,
  };
}

function exportResearchBundle(
  outputDir: string,
  configPath: string,
  report: ExperimentReport,
  bundle: ResearchBundle
): void {
  // Enforce claim class consistency before writing to disk
  if (report.claimClass === 'validated') {
    const invalidRuns = bundle.runs.filter((run) => !isValidatedRun(run));
    if (invalidRuns.length > 0) {
      console.warn(`[Runner] Enforcement: downgrading claim from validated to exploratory — ${invalidRuns.length} run(s) fail validation controls.`);
      report.claimClass = 'exploratory';
      report.enforcementWarnings ??= [];
      report.enforcementWarnings.push(
        `Export-time downgrade: ${invalidRuns.length} run(s) failed validation controls.`,
      );
    }
  }

  // Check hash consistency for validated claims (separate check so it's not skipped by prior downgrade)
  if (report.claimClass === 'validated') {
    const seeds = new Map<number, string>();
    for (const run of bundle.runs) {
      const existingHash = seeds.get(run.seed);
      if (existingHash && existingHash !== run.artifact.eventTraceHash) {
        console.warn(`[Runner] Enforcement: downgrading claim — inconsistent hashes for seed ${run.seed}.`);
        report.claimClass = 'exploratory';
        report.enforcementWarnings ??= [];
        report.enforcementWarnings.push(`Hash inconsistency detected for seed ${run.seed}.`);
        break;
      }
      seeds.set(run.seed, run.artifact.eventTraceHash);
    }
  }

  const baseName = basename(configPath, extname(configPath));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bundleDir = join(outputDir, `${baseName}-${timestamp}`);
  const runsDir = join(bundleDir, 'runs');

  mkdirSync(bundleDir, { recursive: true });
  mkdirSync(runsDir, { recursive: true });

  writeFileSync(join(bundleDir, 'report.json'), reportToJSON(report));
  writeFileSync(join(bundleDir, 'report.csv'), reportToCSV(report));
  writeFileSync(join(bundleDir, 'research-bundle.json'), JSON.stringify(bundle, null, 2));
  writeFileSync(
    join(bundleDir, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: bundle.experiment.timestamp,
        experimentId: bundle.experiment.id,
        conditionCount: bundle.experiment.conditionCount,
        totalRuns: bundle.experiment.totalRuns,
        files: [
          'report.json',
          'report.csv',
          'research-bundle.json',
          ...bundle.runs.map((run) => `runs/${slugify(`${run.conditionName}-run-${run.runNumber}`)}.json`),
        ],
      },
      null,
      2
    )
  );

  for (const run of bundle.runs) {
    const fileName = `${slugify(`${run.conditionName}-run-${run.runNumber}`)}.json`;
    writeFileSync(join(runsDir, fileName), JSON.stringify(run, null, 2));
  }
}

// =============================================================================
// Runner Entry Point
// =============================================================================

export async function runExperiment(options: RunnerOptions): Promise<RunResult[]> {
  const {
    configPath,
    runs = 1,
    outputDir,
    verbose = false,
    dryRun = false,
    format = 'json',
    autoInjectBaselines: shouldAutoInject = true,
    baselineConfig,
    skipBaselineValidation = false,
    tickIntervalMs = 0,
  } = options;

  console.log(`[Runner] Loading config: ${configPath}`);
  let schema = await loadConfig(configPath);

  const missingBaselines = getMissingBaselines(schema.agents);
  if (missingBaselines.length > 0) {
    if (shouldAutoInject && schema.autoInjectBaselines !== false) {
      console.log('[Runner] Auto-injecting missing baseline agents:');
      missingBaselines.forEach((baseline) => {
        console.log(`  - ${baseline.type}: adding ${baseline.required - baseline.actual} agent(s)`);
      });
      schema = autoInjectBaselines(schema, baselineConfig);
    } else if (!skipBaselineValidation) {
      console.warn('[Runner] Warning: missing baseline agents for scientific comparison.');
    }
  }

  if (skipBaselineValidation) {
    schema = { ...schema, requireBaselines: false };
  }

  const validation = validateSchema(schema);
  if (!validation.valid) {
    validation.errors.forEach((error) => console.error(`  - ${error.path}: ${error.message}`));
    throw new Error('Invalid experiment configuration');
  }

  const variants = schema.variants?.length
    ? schema.variants
    : [{ name: 'Default', description: 'Default configuration', overrides: {} }];

  if (dryRun) {
    console.log('[Runner] Dry run - configuration is valid');
    for (const variant of variants) {
      const mergedSchema = mergeSchemas(schema, variant.overrides);
      const profile = resolveScientificProfile(mergedSchema);
      console.log(`  - ${variant.name}: profile=${profile.profile}, benchmarkWorld=${profile.benchmarkWorld}, mode=${profile.resolvedMode}`);
    }
    return [];
  }

  if (outputDir && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const experiment = await createExperiment({
    name: schema.name,
    description: schema.description,
    hypothesis: schema.hypothesis,
    metrics: schema.metrics,
  });
  await updateExperimentStatus(experiment.id, 'running');

  const plannedRuns: PlannedRun[] = [];
  for (const variant of variants) {
    const mergedSchema = mergeSchemas(schema, variant.overrides);
    const profile = resolveScientificProfile(mergedSchema);
    const baseSeed = mergedSchema.seed ?? schema.seed ?? Date.now();

    for (let runNumber = 1; runNumber <= runs; runNumber++) {
      const seed = baseSeed + (runNumber - 1);
      const variantName = runs > 1 ? `${variant.name} [run ${runNumber}]` : variant.name;
      const variantRecord = await createVariant(experiment.id, {
        name: variantName,
        description: variant.description,
        configOverrides: {
          profile: profile.profile,
          benchmarkWorld: profile.benchmarkWorld,
          mode: profile.resolvedMode,
          events: mergedSchema.events ?? [],
        },
        worldSeed: seed,
        durationTicks: mergedSchema.duration,
      });

      plannedRuns.push({
        conditionName: variant.name,
        variantName,
        description: variant.description,
        runNumber,
        seed,
        schema: mergedSchema,
        profile,
        variantRecord,
      });
    }
  }

  const needsWorker = plannedRuns.some((plan) => plan.profile.resolvedMode === 'llm' || plan.schema.genesis?.enabled);
  if (needsWorker) {
    startWorker();
  }

  const results: RunResult[] = [];

  try {
    for (const plan of plannedRuns) {
      if (verbose) {
        console.log(`\n[Runner] ${plan.variantName} (seed ${plan.seed}, profile ${plan.profile.profile})`);
      }

      const result = await executePlannedRun(experiment.id, plan, verbose, tickIntervalMs);
      results.push(result);

      if (!verbose) {
        process.stdout.write('.');
      }
    }
  } finally {
    if (needsWorker) {
      await stopWorker();
    }
  }

  if (!verbose) {
    console.log('');
  }

  await updateExperimentStatus(experiment.id, 'completed');

  const report = buildReport(experiment.id, experiment.name, schema.hypothesis ?? null, results, schema);
  const bundle: ResearchBundle = {
    experiment: {
      id: experiment.id,
      name: experiment.name,
      hypothesis: schema.hypothesis ?? null,
      configPath,
      timestamp: new Date().toISOString(),
      codeVersion: getCodeVersion(),
      conditionCount: new Set(results.map((result) => result.conditionName)).size,
      totalRuns: results.length,
    },
    report,
    conditions: buildConditionComparisons(results),
    runs: results,
  };

  if (outputDir) {
    exportResearchBundle(outputDir, configPath, report, bundle);
  }

  console.log('\n========================================');
  console.log('  EXPERIMENT SUMMARY');
  console.log('========================================');
  console.log(`Experiment: ${schema.name}`);
  console.log(`Runs: ${results.length}`);
  console.log(`Conditions: ${new Set(results.map((result) => result.conditionName)).size}`);
  console.log(`Profile classes: ${Array.from(new Set(results.map((result) => result.profile))).join(', ')}`);

  const byCondition = new Map<string, RunResult[]>();
  for (const result of results) {
    const existing = byCondition.get(result.conditionName) ?? [];
    existing.push(result);
    byCondition.set(result.conditionName, existing);
  }

  for (const [conditionName, conditionRuns] of byCondition) {
    const avgSurvival = conditionRuns.reduce((sum, run) => sum + run.finalMetrics.survivalRate, 0) / conditionRuns.length;
    const avgWealth = conditionRuns.reduce((sum, run) => sum + run.finalMetrics.avgWealth, 0) / conditionRuns.length;
    const avgGini = conditionRuns.reduce((sum, run) => sum + run.finalMetrics.giniCoefficient, 0) / conditionRuns.length;
    console.log('');
    console.log(`${conditionName}:`);
    console.log(`  Avg Survival Rate: ${(avgSurvival * 100).toFixed(1)}%`);
    console.log(`  Avg Wealth: ${avgWealth.toFixed(1)}`);
    console.log(`  Avg Gini: ${avgGini.toFixed(3)}`);
  }

  if (format === 'csv' && outputDir) {
    console.log('[Runner] CSV report exported in research bundle.');
  } else if (format === 'json' && outputDir) {
    console.log('[Runner] JSON report exported in research bundle.');
  } else if (format === 'both' && outputDir) {
    console.log('[Runner] JSON and CSV reports exported in research bundle.');
  }

  return results;
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  let configPath = '';
  let runs = 1;
  let outputDir = '';
  let verbose = false;
  let dryRun = false;
  let format: 'json' | 'csv' | 'both' = 'json';
  let autoInjectBaselines = true;
  let skipBaselineValidation = false;
  let tickIntervalMs = 0;
  const baselineConfig: { random?: number; rule?: number; sugarscape?: number; qlearning?: number } = {};

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case '--config':
      case '-c':
        configPath = args[++index];
        break;
      case '--runs':
      case '-r':
        runs = parseInt(args[++index], 10);
        break;
      case '--output':
      case '-o':
        outputDir = args[++index];
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--format':
      case '-f':
        format = args[++index] as 'json' | 'csv' | 'both';
        break;
      case '--tick-interval':
        tickIntervalMs = parseInt(args[++index], 10);
        break;
      case '--auto-inject':
        autoInjectBaselines = true;
        break;
      case '--no-auto-inject':
        autoInjectBaselines = false;
        break;
      case '--skip-baseline-validation':
        skipBaselineValidation = true;
        break;
      case '--baseline-random':
        baselineConfig.random = parseInt(args[++index], 10);
        break;
      case '--baseline-rule':
        baselineConfig.rule = parseInt(args[++index], 10);
        break;
      case '--baseline-sugarscape':
        baselineConfig.sugarscape = parseInt(args[++index], 10);
        break;
      case '--baseline-qlearning':
        baselineConfig.qlearning = parseInt(args[++index], 10);
        break;
      case '--help':
      case '-h':
        console.log(`
SimAgents Experiment Runner

Usage:
  bun run src/experiments/runner.ts --config <file> [options]

Options:
  -c, --config <file>   Path to experiment config (YAML or JSON)
  -r, --runs <n>        Number of runs per condition (default: 1)
  -o, --output <dir>    Output directory for the research bundle
  -v, --verbose         Verbose logging
  --dry-run             Validate config and resolve scientific profiles only
  --tick-interval <ms>  Delay between ticks (default: 0)
  -f, --format <type>   Report preference: json, csv, or both
  -h, --help            Show this help

Baseline Controls:
  --auto-inject               Auto-inject missing baseline agents (default: on)
  --no-auto-inject            Disable auto-injection of baseline agents
  --skip-baseline-validation  Skip baseline validation
  --baseline-random <n>       Number of baseline_random agents
  --baseline-rule <n>         Number of baseline_rule agents
  --baseline-sugarscape <n>   Number of baseline_sugarscape agents
  --baseline-qlearning <n>    Number of baseline_qlearning agents
`);
        return;
      default:
        if (arg.startsWith('-')) {
          console.warn(`[Runner] Unknown option: ${arg}`);
        }
    }
  }

  if (!configPath) {
    console.error('[Runner] Error: --config is required');
    process.exit(1);
  }

  await runExperiment({
    configPath,
    runs,
    outputDir,
    verbose,
    dryRun,
    format,
    autoInjectBaselines,
    baselineConfig,
    skipBaselineValidation,
    tickIntervalMs,
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[Runner] Fatal error:', error);
    process.exit(1);
  });
}
