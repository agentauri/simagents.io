import { IndexedCollection, legacyArray } from './secondary-data';
export const EXPERIMENT_DEFS_KEY = 'simagents_experiment_defs_v1';
export const EXPERIMENT_RUNS_KEY = 'simagents_experiment_runs_v1';

const definitions = new IndexedCollection<BrowserExperimentDefinition>(EXPERIMENT_DEFS_KEY, value => legacyArray(value, isExperimentDefinition), definition => definition.id ?? 'default');
const runs = new IndexedCollection<BrowserExperimentRun>(EXPERIMENT_RUNS_KEY, value => legacyArray(value, isExperimentRun), run => run.id);

export interface BrowserExperimentDefinition {
  id?: string;
  name?: string;
  ticks?: number;
  wallStepMs?: number;
  captureEveryTicks?: number;
  notes?: string;
  configOverrides?: Record<string, unknown>;
}

export interface BrowserExperimentSnapshot {
  tick: number;
  simTimeMs: number;
  capturedAt: number;
  agentCount: number;
  aliveAgents: number;
  avgHunger: number;
  avgEnergy: number;
  avgHealth: number;
  totalBalance: number;
  resourceAmount: number;
  eventCount: number;
}

export interface BrowserExperimentSummary {
  startedTick: number;
  endedTick: number;
  ticksAdvanced: number;
  eventsGenerated: number;
  finalAliveAgents: number;
  finalAvgHealth: number;
  finalResourceAmount: number;
}

export interface BrowserExperimentRun {
  schemaVersion: 1;
  id: string;
  definition: BrowserExperimentDefinition;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  startedAt: number;
  completedAt?: number;
  targetTicks: number;
  ticksCompleted: number;
  snapshots: BrowserExperimentSnapshot[];
  summary?: BrowserExperimentSummary;
  error?: string;
}

export interface BrowserExperimentExport {
  run: BrowserExperimentRun;
  json: string;
  csv: string;
}

export const loadExperimentDefinitions = () => definitions.load();
export const saveExperimentDefinition = (definition: BrowserExperimentDefinition) =>
  definitions.put(definition, false);
export const loadExperimentRuns = () => runs.load();
export const saveExperimentRun = (run: BrowserExperimentRun) =>
  runs.put(run, false);
export const clearExperimentRuns = () => runs.clear();

export function exportExperimentRun(run: BrowserExperimentRun): BrowserExperimentExport {
  return {
    run,
    json: JSON.stringify(run, null, 2),
    csv: experimentRunToCsv(run),
  };
}

export function experimentRunToCsv(run: BrowserExperimentRun): string {
  const headers = [
    'runId',
    'tick',
    'simTimeMs',
    'agentCount',
    'aliveAgents',
    'avgHunger',
    'avgEnergy',
    'avgHealth',
    'totalBalance',
    'resourceAmount',
    'eventCount',
  ];
  const rows = run.snapshots.map((snapshot) => [
    run.id,
    snapshot.tick,
    snapshot.simTimeMs,
    snapshot.agentCount,
    snapshot.aliveAgents,
    snapshot.avgHunger,
    snapshot.avgEnergy,
    snapshot.avgHealth,
    snapshot.totalBalance,
    snapshot.resourceAmount,
    snapshot.eventCount,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function isExperimentDefinition(value: unknown): value is BrowserExperimentDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const definition = value as BrowserExperimentDefinition;
  return ['id', 'name', 'notes'].every(key => (definition as Record<string, unknown>)[key] === undefined || typeof (definition as Record<string, unknown>)[key] === 'string') &&
    [definition.ticks, definition.wallStepMs, definition.captureEveryTicks].every(number => number === undefined || (Number.isFinite(number) && number > 0));
}

function isExperimentRun(value: unknown): value is BrowserExperimentRun {
  const run = value as Partial<BrowserExperimentRun>;
  return (
    !!run &&
    run.schemaVersion === 1 &&
    typeof run.id === 'string' &&
    Number.isFinite(run.startedAt) &&
    Number.isSafeInteger(run.targetTicks) && run.targetTicks! >= 0 &&
    Number.isSafeInteger(run.ticksCompleted) && run.ticksCompleted! >= 0 &&
    ['running', 'completed', 'cancelled', 'failed'].includes(run.status ?? '') &&
    isExperimentDefinition(run.definition) &&
    Array.isArray(run.snapshots) && run.snapshots.every(snapshot => !!snapshot && ['tick', 'simTimeMs', 'capturedAt', 'agentCount', 'aliveAgents', 'avgHunger', 'avgEnergy', 'avgHealth', 'totalBalance', 'resourceAmount', 'eventCount'].every(key => Number.isFinite((snapshot as unknown as Record<string, unknown>)[key])))
  );
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
