/**
 * Experiment Batch Runner
 *
 * Executes scientific experiments against the full tick engine and exports
 * reproducible research bundles with provenance, snapshots, and per-run metrics.
 */

import { execSync } from 'child_process';
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
import {
  applyScientificProfile,
  resolveScientificProfile,
  type BenchmarkWorldName,
  type ExperimentProfileName,
  type ResolvedScientificProfile,
} from './scientific-profile';
import { getRuntimeConfig, setRuntimeConfig } from '../config';
import { getActiveTransformations } from '../llm/prompt-builder';

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
    giniCoefficient: number;
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
  giniCoefficient?: number;
  tradeCount?: number;
  conflictCount?: number;
};

type SnapshotState = {
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

function getCodeVersion(): string | null {
  const envVersion =
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA;

  if (envVersion) {
    return envVersion;
  }

  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function getInitialAgentCount(metrics: SnapshotMetrics | null, states: SnapshotState[] | null): number {
  return metrics?.aliveAgents ?? states?.filter((state) => state.state !== 'dead').length ?? 0;
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

  return {
    initialAgents,
    finalMetrics: {
      aliveAgents: finalAlive,
      survivalRate: initialAgents > 0 ? finalAlive / initialAgents : 0,
      avgWealth: lastMetrics?.avgWealth ?? 0,
      avgHealth: lastMetrics?.avgHealth ?? 0,
      giniCoefficient: lastMetrics?.giniCoefficient ?? 0,
      tradeCount: lastMetrics?.tradeCount ?? 0,
      conflictCount: lastMetrics?.conflictCount ?? 0,
    },
    survivalAnalysis,
    economicAnalysis,
    initialStateHash: firstStates ? hashValue(firstStates) : null,
    finalStateHash: lastStates ? hashValue(lastStates) : null,
  };
}

async function resetRunnerWorld(): Promise<void> {
  tickEngine.stop();
  tickEngine.clearExperimentContext();
  clearScheduledShocks();
  clearScheduledCompositeShocks();
  clearBlackoutState();
  await clearWorld();
  await db.delete(events);
  await db.delete(ledger);
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
    resetRNG();
    initializeRNG(String(plan.seed));
    await resetRunnerWorld();

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
        eventTraceHash: hashValue(runEvents.map((event) => ({
          tick: event.tick,
          eventType: event.eventType,
          agentId: event.agentId,
          payload: event.payload,
        }))),
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
        avgCooperationIndex: 0,
        avgWealth: mean(runs.map((run) => run.finalMetrics.avgWealth)),
        avgHealth: mean(runs.map((run) => run.finalMetrics.avgHealth)),
        avgHunger: 0,
        avgEnergy: 0,
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

  const metricMap: Array<{ label: string; accessor: (result: RunResult) => number }> = [
    { label: 'Gini Coefficient', accessor: (result) => result.finalMetrics.giniCoefficient },
    { label: 'Average Wealth', accessor: (result) => result.finalMetrics.avgWealth },
    { label: 'Average Health', accessor: (result) => result.finalMetrics.avgHealth },
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

  return comparisons;
}

function buildReport(
  experimentId: string,
  experimentName: string,
  hypothesis: string | null,
  results: RunResult[]
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

  report.metricComparisons = buildStatisticalComparisons(results);
  report.survivalAnalysis = results.map((result) => result.survivalAnalysis);
  report.economicAnalysis = results.map((result) => result.economicAnalysis);
  report.significantFindings = report.metricComparisons
    .filter((metric) => metric.statisticalTest?.significant)
    .map((metric) => `${metric.metric}: p=${metric.statisticalTest?.pValue.toFixed(4)} effect=${metric.statisticalTest?.effectInterpretation ?? 'n/a'}`);

  if (report.metricComparisons.length === 0) {
    report.conclusion = 'Single-condition run completed. The bundle contains descriptive artifacts only.';
  } else if (report.significantFindings.length === 0) {
    report.conclusion = 'Comparative runs completed. No metric reached statistical significance under the configured tests.';
  } else {
    report.conclusion = `Comparative runs completed with ${report.significantFindings.length} statistically supported finding(s).`;
  }

  return report;
}

function exportResearchBundle(
  outputDir: string,
  configPath: string,
  report: ExperimentReport,
  bundle: ResearchBundle
): void {
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

  const report = buildReport(experiment.id, experiment.name, schema.hypothesis ?? null, results);
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
