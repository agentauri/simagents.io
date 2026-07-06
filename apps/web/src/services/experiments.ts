export const EXPERIMENT_DEFS_KEY = 'simagents_experiment_defs_v1';
export const EXPERIMENT_RUNS_KEY = 'simagents_experiment_runs_v1';

const MAX_DEFINITIONS = 50;
const MAX_RUNS = 20;
const MAX_RUNS_BYTES = 1_500_000;

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

export function loadExperimentDefinitions(): BrowserExperimentDefinition[] {
  return readArray(EXPERIMENT_DEFS_KEY, isExperimentDefinition);
}

export function saveExperimentDefinition(definition: BrowserExperimentDefinition): void {
  const definitions = [definition, ...loadExperimentDefinitions().filter((item) => item.id !== definition.id)]
    .slice(0, MAX_DEFINITIONS);
  localStorage.setItem(EXPERIMENT_DEFS_KEY, JSON.stringify(definitions));
}

export function loadExperimentRuns(): BrowserExperimentRun[] {
  return readArray(EXPERIMENT_RUNS_KEY, isExperimentRun);
}

export function saveExperimentRun(run: BrowserExperimentRun): void {
  let runs = [run, ...loadExperimentRuns().filter((item) => item.id !== run.id)].slice(0, MAX_RUNS);
  let json = JSON.stringify(runs);
  while (byteLength(json) > MAX_RUNS_BYTES && runs.length > 1) {
    runs = runs.slice(0, -1);
    json = JSON.stringify(runs);
  }
  localStorage.setItem(EXPERIMENT_RUNS_KEY, json);
}

export function clearExperimentRuns(): void {
  localStorage.removeItem(EXPERIMENT_RUNS_KEY);
}

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

function readArray<T>(key: string, guard: (value: unknown) => value is T): T[] {
  const json = localStorage.getItem(key);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

function isExperimentDefinition(value: unknown): value is BrowserExperimentDefinition {
  return !!value && typeof value === 'object';
}

function isExperimentRun(value: unknown): value is BrowserExperimentRun {
  const run = value as Partial<BrowserExperimentRun>;
  return (
    !!run &&
    run.schemaVersion === 1 &&
    typeof run.id === 'string' &&
    typeof run.startedAt === 'number' &&
    typeof run.targetTicks === 'number' &&
    typeof run.ticksCompleted === 'number' &&
    Array.isArray(run.snapshots)
  );
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function byteLength(value: string): number {
  return new Blob([value]).size;
}
