/**
 * Experiment Analysis Module
 *
 * Statistical helpers for analyzing and comparing scientific baseline experiments.
 * Provides functions for:
 * - Statistical comparison between variants
 * - Survival rate analysis
 * - Economic metrics analysis
 * - Behavioral pattern analysis
 */

import type { VariantComparisonResult } from '../db/queries/experiments';

// =============================================================================
// Types
// =============================================================================

export type ClaimClass = 'validated' | 'exploratory' | 'descriptive_only';

export interface StatisticalTest {
  /** Test name (e.g., 't-test', 'mann-whitney') */
  test: string;
  /** Statistic value */
  statistic: number;
  /** P-value */
  pValue: number;
  /** Significance level */
  significant: boolean;
  /** Effect size (Cohen's d or similar) */
  effectSize?: number;
  /** Effect size interpretation */
  effectInterpretation?: 'negligible' | 'small' | 'medium' | 'large';
}

export interface MetricComparison {
  metric: string;
  controlValue: number;
  treatmentValue: number;
  difference: number;
  percentChange: number;
  statisticalTest?: StatisticalTest;
  adjustedPValue?: number;
  significantAfterCorrection?: boolean;
  correctionMethod?: string;
}

export interface SurvivalAnalysis {
  variantId: string;
  variantName: string;
  initialAgents: number;
  finalAgents: number;
  survivalRate: number;
  /** Estimated half-life in ticks (when 50% would die) */
  halfLifeTicks?: number;
  deathsByTick: { tick: number; deaths: number }[];
}

export interface EconomicAnalysis {
  variantId: string;
  variantName: string;
  /** Initial Gini coefficient */
  initialGini: number;
  /** Final Gini coefficient */
  finalGini: number;
  /** Change in inequality */
  giniChange: number;
  /** Wealth concentration trend */
  concentrationTrend: 'increasing' | 'stable' | 'decreasing';
  /** Wealth per capita over time */
  wealthTimeSeries: { tick: number; avgWealth: number }[];
}

export interface BehavioralAnalysis {
  variantId: string;
  variantName: string;
  /** Action distribution */
  actionDistribution: Record<string, number>;
  /** Most common action */
  dominantAction: string;
  /** Cooperation index (0-1) */
  cooperationIndex: number;
  /** Conflict events count */
  conflictCount: number;
  /** Trade count */
  tradeCount: number;
  /** Behavioral diversity (entropy) */
  behavioralEntropy: number;
}

export interface ExperimentReport {
  experimentId: string;
  experimentName: string;
  hypothesis: string | null;
  claimClass: ClaimClass;
  totalTicks: number;
  variants: {
    id: string;
    name: string;
    ticksRun: number;
    status: string;
  }[];
  metricComparisons: MetricComparison[];
  survivalAnalysis: SurvivalAnalysis[];
  economicAnalysis: EconomicAnalysis[];
  behavioralAnalysis: BehavioralAnalysis[];
  conclusion: string;
  significantFindings: string[];
  claimClassEnforced?: boolean;
  enforcementWarnings?: string[];
  threatsToValidity?: string[];
  preRegistration?: {
    registered: boolean;
    hypothesis: string | null;
    primaryMetrics: string[];
    registeredAt: string | null;
    deviations: string[];
  };
}

// =============================================================================
// Statistical Functions
// =============================================================================

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Calculate variance
 */
export function variance(values: number[]): number {
  const sd = stdDev(values);
  return sd * sd;
}

/**
 * Calculate median
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate percentile
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}

/**
 * Calculate Shannon entropy (behavioral diversity)
 */
export function entropy(probabilities: number[]): number {
  const nonZero = probabilities.filter((p) => p > 0);
  if (nonZero.length === 0) return 0;
  return -nonZero.reduce((sum, p) => sum + p * Math.log2(p), 0);
}

/**
 * Calculate Gini coefficient from an array of values
 */
export function giniCoefficient(values: number[]): number {
  if (values.length === 0 || values.every((v) => v === 0)) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const cumulative = sorted.reduce((acc, v, i) => {
    acc.push((acc[i] || 0) + v);
    return acc;
  }, [0] as number[]);

  const sum = cumulative[n];
  if (sum === 0) return 0;

  const B = cumulative.reduce((acc, c) => acc + c, 0) / (n * sum);
  return 1 - 2 * B + 1 / n;
}

/**
 * Calculate Cohen's d effect size
 */
export function cohensD(group1: number[], group2: number[]): number {
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const var1 = variance(group1);
  const var2 = variance(group2);

  const n1 = group1.length;
  const n2 = group2.length;

  // Pooled standard deviation
  const pooledStd = Math.sqrt(
    ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
  );

  if (pooledStd === 0) return 0;
  return (mean1 - mean2) / pooledStd;
}

/**
 * Interpret Cohen's d effect size
 */
export function interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large' {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

/**
 * Simple t-test (Welch's t-test for unequal variances)
 * Returns approximate p-value using normal approximation
 */
export function tTest(group1: number[], group2: number[]): StatisticalTest {
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const var1 = variance(group1);
  const var2 = variance(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) {
    return {
      test: 't-test',
      statistic: 0,
      pValue: 1,
      significant: false,
    };
  }

  // Welch's t-statistic
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) {
    return {
      test: 't-test',
      statistic: 0,
      pValue: 1,
      significant: false,
    };
  }

  const t = (mean1 - mean2) / se;

  // Degrees of freedom (Welch-Satterthwaite)
  const df =
    Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));

  // Two-tailed p-value using Student's t-distribution CDF
  const pValue = 2 * (1 - studentTCDF(Math.abs(t), df));

  const d = cohensD(group1, group2);

  return {
    test: 't-test',
    statistic: t,
    pValue,
    significant: pValue < 0.05,
    effectSize: d,
    effectInterpretation: interpretEffectSize(d),
  };
}

/**
 * Standard normal CDF approximation
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1 / (1 + p * x);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Regularized incomplete beta function using continued fraction expansion.
 * Used to compute the CDF of the Student's t-distribution.
 */
function betaCF(x: number, a: number, b: number): number {
  const maxIter = 200;
  const eps = 1e-14;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

/**
 * Log-gamma function (Lanczos approximation).
 */
function logGamma(x: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  const z = x - 1;
  let a = coef[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += coef[i] / (z + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function I_x(a, b).
 */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaCF(x, a, b)) / a;
  }
  return 1 - (front * betaCF(1 - x, b, a)) / b;
}

/**
 * Student's t-distribution CDF.
 * Uses the regularized incomplete beta function for accurate p-values
 * at all sample sizes, including small n.
 */
export function studentTCDF(t: number, df: number): number {
  if (df <= 0) return 0.5;

  const x = df / (df + t * t);
  const ibeta = regularizedBeta(x, df / 2, 0.5);

  if (t >= 0) {
    return 1 - 0.5 * ibeta;
  }
  return 0.5 * ibeta;
}

/**
 * Inverse Student's t-distribution (quantile function).
 * Uses bisection method to find t such that CDF(t, df) = p.
 */
export function studentTInverse(p: number, df: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Bisection search — converges in ~45 iterations for eps=1e-10 on [-1000,1000]
  let lo = -1000;
  let hi = 1000;
  const eps = 1e-10;
  const maxIter = 60;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const cdf = studentTCDF(mid, df);

    if (Math.abs(cdf - p) < eps) return mid;

    if (cdf < p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Compare two variants' metrics
 */
export function compareMetrics(
  control: VariantComparisonResult,
  treatment: VariantComparisonResult
): MetricComparison[] {
  const comparisons: MetricComparison[] = [];

  const metricPairs: Array<{ key: keyof typeof control.metrics; label: string }> = [
    { key: 'avgGiniCoefficient', label: 'Gini Coefficient' },
    { key: 'avgCooperationIndex', label: 'Cooperation Index' },
    { key: 'avgWealth', label: 'Average Wealth' },
    { key: 'avgHealth', label: 'Average Health' },
    { key: 'avgHunger', label: 'Average Hunger' },
    { key: 'avgEnergy', label: 'Average Energy' },
    { key: 'survivalRate', label: 'Survival Rate' },
    { key: 'totalEvents', label: 'Total Events' },
    { key: 'tradeCount', label: 'Trade Count' },
    { key: 'conflictCount', label: 'Conflict Count' },
  ];

  for (const { key, label } of metricPairs) {
    const controlValue = control.metrics[key];
    const treatmentValue = treatment.metrics[key];
    const difference = treatmentValue - controlValue;
    const percentChange = controlValue !== 0
      ? ((treatmentValue - controlValue) / controlValue) * 100
      : treatmentValue > 0 ? 100 : 0;

    comparisons.push({
      metric: label,
      controlValue,
      treatmentValue,
      difference,
      percentChange,
    });
  }

  return comparisons;
}

/**
 * Analyze survival patterns from snapshots
 */
export function analyzeSurvival(
  variantId: string,
  variantName: string,
  snapshots: Array<{
    tick: number;
    metricsSnapshot: { aliveAgents?: number } | null;
    agentStates: Array<{ state: string }> | null;
  }>
): SurvivalAnalysis {
  if (snapshots.length === 0) {
    return {
      variantId,
      variantName,
      initialAgents: 0,
      finalAgents: 0,
      survivalRate: 0,
      deathsByTick: [],
    };
  }

  // Get agent counts per snapshot
  const agentCounts = snapshots.map((s) => {
    const metrics = s.metricsSnapshot as { aliveAgents?: number } | null;
    return {
      tick: Number(s.tick),
      alive: metrics?.aliveAgents ?? s.agentStates?.filter((a) => a.state !== 'dead').length ?? 0,
    };
  });

  const initialAgents = agentCounts[0]?.alive ?? 0;
  const finalAgents = agentCounts[agentCounts.length - 1]?.alive ?? 0;

  // Calculate deaths per tick
  const deathsByTick: { tick: number; deaths: number }[] = [];
  for (let i = 1; i < agentCounts.length; i++) {
    const deaths = agentCounts[i - 1].alive - agentCounts[i].alive;
    if (deaths > 0) {
      deathsByTick.push({ tick: agentCounts[i].tick, deaths });
    }
  }

  // Estimate half-life (tick when population would drop to 50%)
  let halfLifeTicks: number | undefined;
  const halfPoint = initialAgents / 2;
  for (const count of agentCounts) {
    if (count.alive <= halfPoint) {
      halfLifeTicks = count.tick;
      break;
    }
  }

  return {
    variantId,
    variantName,
    initialAgents,
    finalAgents,
    survivalRate: initialAgents > 0 ? finalAgents / initialAgents : 0,
    halfLifeTicks,
    deathsByTick,
  };
}

/**
 * Analyze economic patterns from snapshots
 */
export function analyzeEconomics(
  variantId: string,
  variantName: string,
  snapshots: Array<{
    tick: number;
    metricsSnapshot: { giniCoefficient?: number; avgWealth?: number } | null;
    agentStates: Array<{ balance: number }> | null;
  }>
): EconomicAnalysis {
  if (snapshots.length === 0) {
    return {
      variantId,
      variantName,
      initialGini: 0,
      finalGini: 0,
      giniChange: 0,
      concentrationTrend: 'stable',
      wealthTimeSeries: [],
    };
  }

  const getGini = (s: typeof snapshots[0]): number => {
    const metrics = s.metricsSnapshot as { giniCoefficient?: number } | null;
    if (metrics?.giniCoefficient !== undefined) {
      return metrics.giniCoefficient;
    }
    if (s.agentStates) {
      return giniCoefficient(s.agentStates.map((a) => a.balance));
    }
    return 0;
  };

  const getWealth = (s: typeof snapshots[0]): number => {
    const metrics = s.metricsSnapshot as { avgWealth?: number } | null;
    if (metrics?.avgWealth !== undefined) {
      return metrics.avgWealth;
    }
    if (s.agentStates && s.agentStates.length > 0) {
      return mean(s.agentStates.map((a) => a.balance));
    }
    return 0;
  };

  const initialGini = getGini(snapshots[0]);
  const finalGini = getGini(snapshots[snapshots.length - 1]);
  const giniChange = finalGini - initialGini;

  // Determine trend
  let concentrationTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (giniChange > 0.05) concentrationTrend = 'increasing';
  else if (giniChange < -0.05) concentrationTrend = 'decreasing';

  const wealthTimeSeries = snapshots.map((s) => ({
    tick: Number(s.tick),
    avgWealth: getWealth(s),
  }));

  return {
    variantId,
    variantName,
    initialGini,
    finalGini,
    giniChange,
    concentrationTrend,
    wealthTimeSeries,
  };
}

/**
 * Analyze behavioral patterns from real event data.
 *
 * @param variantId - The variant ID
 * @param variantName - The variant name
 * @param comparison - Aggregated metrics from variant snapshots
 * @param eventCounts - Optional map of action type -> count from real event log.
 *   If provided, the action distribution is computed from actual data.
 *   If omitted, a coarse distribution is estimated from the aggregated metrics.
 */
export function analyzeBehavior(
  variantId: string,
  variantName: string,
  comparison: VariantComparisonResult,
  eventCounts?: Record<string, number>
): BehavioralAnalysis {
  let actionDistribution: Record<string, number>;

  if (eventCounts && Object.keys(eventCounts).length > 0) {
    // Build distribution from real event data
    const totalActions = Object.values(eventCounts).reduce((sum, c) => sum + c, 0);
    actionDistribution = {};
    if (totalActions > 0) {
      for (const [action, count] of Object.entries(eventCounts)) {
        actionDistribution[action] = count / totalActions;
      }
    }
  } else {
    // Estimate distribution from aggregated snapshot metrics.
    // This is an approximation — the real fix is to pass eventCounts from the caller.
    const { totalEvents, tradeCount, conflictCount } = comparison.metrics;
    const knownEvents = tradeCount + conflictCount;
    const otherEvents = Math.max(totalEvents - knownEvents, 0);

    actionDistribution = {};
    if (totalEvents > 0) {
      if (tradeCount > 0) actionDistribution.trade = tradeCount / totalEvents;
      if (conflictCount > 0) actionDistribution.conflict = conflictCount / totalEvents;
      if (otherEvents > 0) actionDistribution.other = otherEvents / totalEvents;
    }
  }

  const probabilities = Object.values(actionDistribution);
  const behavioralEntropy = entropy(probabilities);

  // Find dominant action
  let dominantAction = 'unknown';
  let maxProportion = 0;
  for (const [action, proportion] of Object.entries(actionDistribution)) {
    if (proportion > maxProportion) {
      maxProportion = proportion;
      dominantAction = action;
    }
  }

  return {
    variantId,
    variantName,
    actionDistribution,
    dominantAction,
    cooperationIndex: comparison.metrics.avgCooperationIndex,
    conflictCount: comparison.metrics.conflictCount,
    tradeCount: comparison.metrics.tradeCount,
    behavioralEntropy,
  };
}

/**
 * Generate a comprehensive experiment report
 */
export function generateExperimentReport(
  experimentId: string,
  experimentName: string,
  hypothesis: string | null,
  variants: Array<{
    id: string;
    name: string;
    status: string;
    startTick?: number | null;
    endTick?: number | null;
  }>,
  comparisons: VariantComparisonResult[]
): ExperimentReport {
  const significantFindings: string[] = [];

  // Assume first variant is control
  const controlComparison = comparisons[0];
  const treatmentComparisons = comparisons.slice(1);

  // Generate metric comparisons
  const metricComparisons: MetricComparison[] = [];
  for (const treatment of treatmentComparisons) {
    if (controlComparison) {
      const compared = compareMetrics(controlComparison, treatment);
      metricComparisons.push(...compared);
    }
  }

  // Calculate total ticks across all variants
  const totalTicks = variants.reduce((sum, v) => {
    const hasTicks = v.endTick !== null && v.endTick !== undefined && v.startTick !== null && v.startTick !== undefined;
    const ticks = hasTicks ? Number(v.endTick) - Number(v.startTick) : 0;
    return sum + ticks;
  }, 0);

  // Generate conclusion based on findings
  let conclusion = 'Experiment completed. ';
  if (metricComparisons.length === 0) {
    conclusion += 'Only one completed condition was available, so no comparative inference was generated.';
  } else {
    conclusion += 'Descriptive comparisons are available, but scientific claims require corrected multi-run analysis.';
  }

  // Survival and economic analysis would need snapshot data
  // Placeholder empty arrays - caller should populate from snapshots
  const survivalAnalysis: SurvivalAnalysis[] = [];
  const economicAnalysis: EconomicAnalysis[] = [];
  const behavioralAnalysis: BehavioralAnalysis[] = [];

  for (const comp of comparisons) {
    behavioralAnalysis.push(analyzeBehavior(comp.variantId, comp.variantName, comp));
  }

  return {
    experimentId,
    experimentName,
    hypothesis,
    claimClass: 'descriptive_only',
    totalTicks,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      ticksRun: v.endTick !== null && v.endTick !== undefined && v.startTick !== null && v.startTick !== undefined
        ? Number(v.endTick) - Number(v.startTick)
        : 0,
      status: v.status,
    })),
    metricComparisons,
    survivalAnalysis,
    economicAnalysis,
    behavioralAnalysis,
    conclusion,
    significantFindings,
  };
}

// =============================================================================
// Export Helpers
// =============================================================================

/**
 * Convert experiment report to CSV format
 */
export function reportToCSV(report: ExperimentReport): string {
  const lines: string[] = [];

  // Header section
  lines.push('# Experiment Report');
  lines.push(`Experiment ID,${report.experimentId}`);
  lines.push(`Experiment Name,${report.experimentName}`);
  lines.push(`Hypothesis,${report.hypothesis || 'N/A'}`);
  lines.push(`Claim Class,${report.claimClass}`);
  lines.push(`Total Ticks,${report.totalTicks}`);
  lines.push('');

  // Variants section
  lines.push('# Variants');
  lines.push('Variant ID,Variant Name,Ticks Run,Status');
  for (const v of report.variants) {
    lines.push(`${v.id},${v.name},${v.ticksRun},${v.status}`);
  }
  lines.push('');

  // Metric comparisons section
  lines.push('# Metric Comparisons');
  lines.push('Metric,Control Value,Treatment Value,Difference,Percent Change,Adjusted P Value,Significant After Correction,Correction Method');
  for (const mc of report.metricComparisons) {
    lines.push(
      `${mc.metric},${mc.controlValue.toFixed(4)},${mc.treatmentValue.toFixed(4)},${mc.difference.toFixed(4)},${mc.percentChange.toFixed(2)}%,${mc.adjustedPValue?.toFixed(4) ?? ''},${mc.significantAfterCorrection ?? ''},${mc.correctionMethod ?? ''}`
    );
  }
  lines.push('');

  // Behavioral analysis section
  lines.push('# Behavioral Analysis');
  lines.push('Variant,Dominant Action,Cooperation Index,Trade Count,Conflict Count,Behavioral Entropy');
  for (const ba of report.behavioralAnalysis) {
    lines.push(
      `${ba.variantName},${ba.dominantAction},${ba.cooperationIndex.toFixed(4)},${ba.tradeCount},${ba.conflictCount},${ba.behavioralEntropy.toFixed(4)}`
    );
  }
  lines.push('');

  // Significant findings
  lines.push('# Significant Findings');
  for (const finding of report.significantFindings) {
    lines.push(finding);
  }
  lines.push('');

  // Threats to validity
  if (report.threatsToValidity && report.threatsToValidity.length > 0) {
    lines.push('# Threats to Validity');
    for (const threat of report.threatsToValidity) {
      lines.push(threat);
    }
    lines.push('');
  }

  // Pre-registration
  if (report.preRegistration) {
    lines.push('# Pre-Registration');
    lines.push(`Registered,${report.preRegistration.registered}`);
    if (report.preRegistration.registered) {
      lines.push(`Registered At,${report.preRegistration.registeredAt}`);
      lines.push(`Primary Metrics,${report.preRegistration.primaryMetrics.join('; ')}`);
      lines.push(`Deviations,${report.preRegistration.deviations.length}`);
      for (const dev of report.preRegistration.deviations) {
        lines.push(`  - ${dev}`);
      }
    }
    lines.push('');
  }

  // Conclusion
  lines.push('# Conclusion');
  lines.push(report.conclusion);

  return lines.join('\n');
}

/**
 * Convert experiment report to JSON format (pretty-printed)
 */
export function reportToJSON(report: ExperimentReport): string {
  return JSON.stringify(report, null, 2);
}

// =============================================================================
// Additional Statistical Functions for Scientific Publication
// =============================================================================

/**
 * Calculate confidence interval for a mean
 * Uses t-distribution approximation for small samples
 */
export function confidenceInterval(
  values: number[],
  confidenceLevel = 0.95
): { lower: number; upper: number; margin: number } {
  if (values.length < 2) {
    const m = mean(values);
    return { lower: m, upper: m, margin: 0 };
  }

  const m = mean(values);
  const s = stdDev(values);
  const n = values.length;
  const df = n - 1;

  // Use Student's t-distribution critical value for accurate intervals at small n.
  // For large n this converges to the z-score values (1.645, 1.96, 2.576).
  const alpha = 1 - confidenceLevel;
  const tCrit = studentTInverse(1 - alpha / 2, df);

  // Standard error
  const se = s / Math.sqrt(n);
  const margin = tCrit * se;

  return {
    lower: m - margin,
    upper: m + margin,
    margin,
  };
}

/**
 * Mann-Whitney U test (non-parametric alternative to t-test)
 * Returns approximate p-value using normal approximation for large samples
 */
export function mannWhitneyU(group1: number[], group2: number[]): StatisticalTest {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) {
    return {
      test: 'mann-whitney-u',
      statistic: 0,
      pValue: 1,
      significant: false,
    };
  }

  // Combine and rank all values
  const combined = [
    ...group1.map((v) => ({ value: v, group: 1 })),
    ...group2.map((v) => ({ value: v, group: 2 })),
  ].sort((a, b) => a.value - b.value);

  // Assign ranks (handling ties by averaging)
  const ranks: Map<typeof combined[0], number> = new Map();
  let i = 0;
  while (i < combined.length) {
    let j = i;
    // Find all elements with the same value
    while (j < combined.length && combined[j].value === combined[i].value) {
      j++;
    }
    // Average rank for ties
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks.set(combined[k], avgRank);
    }
    i = j;
  }

  // Calculate rank sum for group 1 using indices to handle duplicates correctly
  let R1 = 0;
  for (let idx = 0; idx < combined.length; idx++) {
    if (combined[idx].group === 1) {
      R1 += ranks.get(combined[idx]) ?? 0;
    }
  }

  // U statistic
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  // Mean and standard deviation of U under null hypothesis
  const mU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  // Z-score for normal approximation
  const z = sigmaU > 0 ? (U - mU) / sigmaU : 0;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // Effect size (rank-biserial correlation)
  const effectSize = 1 - (2 * U) / (n1 * n2);

  return {
    test: 'mann-whitney-u',
    statistic: U,
    pValue,
    significant: pValue < 0.05,
    effectSize,
    effectInterpretation: interpretEffectSize(effectSize),
  };
}

/**
 * Generate LaTeX table for experiment results
 */
export function reportToLaTeX(report: ExperimentReport): string {
  const lines: string[] = [];

  // Table header
  lines.push('% Auto-generated LaTeX table from SimAgents experiment');
  lines.push(`% Experiment: ${report.experimentName}`);
  lines.push(`% Generated: ${new Date().toISOString()}`);
  lines.push(`% Claim class: ${report.claimClass}`);
  lines.push('');

  // Summary table
  lines.push('\\begin{table}[htbp]');
  lines.push('\\centering');
  lines.push(`\\caption{Experiment Results: ${report.experimentName}}`);
  lines.push('\\label{tab:experiment-results}');
  lines.push('\\begin{tabular}{lrrrrr}');
  lines.push('\\toprule');
  lines.push('Metric & Control & Treatment & Difference & \\% Change & Significant \\\\');
  lines.push('\\midrule');

  for (const mc of report.metricComparisons) {
    const isSignificant = mc.significantAfterCorrection ?? mc.statisticalTest?.significant ?? false;
    const sig = isSignificant ? '$\\checkmark$' : '';
    lines.push(
      `${mc.metric} & ${mc.controlValue.toFixed(2)} & ${mc.treatmentValue.toFixed(2)} & ${mc.difference.toFixed(2)} & ${mc.percentChange.toFixed(1)}\\% & ${sig} \\\\`
    );
  }

  lines.push('\\bottomrule');
  lines.push('\\end{tabular}');
  lines.push('\\end{table}');
  lines.push('');

  // Survival analysis table (if available)
  if (report.survivalAnalysis.length > 0) {
    lines.push('\\begin{table}[htbp]');
    lines.push('\\centering');
    lines.push('\\caption{Survival Analysis}');
    lines.push('\\label{tab:survival-analysis}');
    lines.push('\\begin{tabular}{lrrr}');
    lines.push('\\toprule');
    lines.push('Variant & Initial Agents & Final Agents & Survival Rate \\\\');
    lines.push('\\midrule');

    for (const sa of report.survivalAnalysis) {
      lines.push(
        `${sa.variantName} & ${sa.initialAgents} & ${sa.finalAgents} & ${(sa.survivalRate * 100).toFixed(1)}\\% \\\\`
      );
    }

    lines.push('\\bottomrule');
    lines.push('\\end{tabular}');
    lines.push('\\end{table}');
    lines.push('');
  }

  // Conclusion
  lines.push('% Conclusion');
  lines.push(`% ${report.conclusion}`);
  lines.push('');

  // Significant findings
  if (report.significantFindings.length > 0) {
    lines.push('% Key Findings:');
    for (const finding of report.significantFindings) {
      lines.push(`%   - ${finding}`);
    }
  }

  return lines.join('\n');
}

/**
 * Calculate statistical power (post-hoc)
 * Uses Cohen's d and sample sizes to estimate achieved power
 */
export function statisticalPower(
  group1: number[],
  group2: number[],
  alpha = 0.05
): number {
  const n1 = group1.length;
  const n2 = group2.length;
  const d = Math.abs(cohensD(group1, group2));

  if (n1 < 2 || n2 < 2 || d === 0) return 0;

  // Harmonic mean of sample sizes
  const nH = (2 * n1 * n2) / (n1 + n2);

  // Non-centrality parameter
  const ncp = d * Math.sqrt(nH / 2);

  // Critical z-value for alpha
  const zCrit = alpha === 0.05 ? 1.96 : 2.576;

  // Power approximation using normal distribution
  // Power = P(Z > z_crit - ncp)
  const power = 1 - normalCDF(zCrit - ncp);

  return Math.min(Math.max(power, 0), 1);
}

/**
 * Enhanced statistical comparison with confidence intervals and effect sizes
 */
export function enhancedStatisticalComparison(
  controlValues: number[],
  treatmentValues: number[],
  metricName: string
): MetricComparison & {
  controlCI: { lower: number; upper: number };
  treatmentCI: { lower: number; upper: number };
  power: number;
} {
  const controlMean = mean(controlValues);
  const treatmentMean = mean(treatmentValues);
  const difference = treatmentMean - controlMean;
  const percentChange = controlMean !== 0
    ? ((treatmentMean - controlMean) / controlMean) * 100
    : treatmentMean > 0 ? 100 : 0;

  // Confidence intervals
  const controlCI = confidenceInterval(controlValues);
  const treatmentCI = confidenceInterval(treatmentValues);

  // Statistical tests
  const tTestResult = tTest(controlValues, treatmentValues);
  const power = statisticalPower(controlValues, treatmentValues);

  return {
    metric: metricName,
    controlValue: controlMean,
    treatmentValue: treatmentMean,
    difference,
    percentChange,
    statisticalTest: tTestResult,
    controlCI: { lower: controlCI.lower, upper: controlCI.upper },
    treatmentCI: { lower: treatmentCI.lower, upper: treatmentCI.upper },
    power,
  };
}

// =============================================================================
// Normality Testing & Automatic Test Selection
// =============================================================================

/**
 * Normality test combining Jarque-Bera with skewness z-test for small samples.
 *
 * For n >= 20: uses Jarque-Bera statistic (good power for moderate samples).
 * For n < 20: uses skewness z-score test, which has better small-sample properties.
 *
 * The skewness z-test computes z_S = S * sqrt(n*(n-1)) / sqrt(6*(n-2))
 * and rejects at |z_S| > 1.96.
 *
 * Uses methods that don't require precomputed coefficient tables.
 */
export function normalityTest(values: number[]): { statistic: number; pValue: number; isNormal: boolean } {
  const n = values.length;

  if (n < 3) {
    return { statistic: 1, pValue: 1, isNormal: true };
  }

  const m = mean(values);
  const s = stdDev(values);

  if (s === 0) {
    return { statistic: 1, pValue: 1, isNormal: true };
  }

  // Compute sample skewness and kurtosis
  let m3 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = (v - m) / s;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const skewness = m3 / n;
  const kurtosis = m4 / n;

  if (n < 20) {
    // Small-sample approach: skewness z-test
    // z_S = S * sqrt(n*(n-1)) / sqrt(6*(n-2))
    const zSkew = skewness * Math.sqrt(n * (n - 1)) / Math.sqrt(6 * (n - 2));
    const pSkew = 2 * (1 - normalCDF(Math.abs(zSkew)));

    // Also check for extreme kurtosis (excess kurtosis far from 0)
    const excessKurtosis = kurtosis - 3;
    // For small n, expect SE of kurtosis ~ sqrt(24/n)
    const zKurt = excessKurtosis / Math.sqrt(24 / n);
    const pKurt = 2 * (1 - normalCDF(Math.abs(zKurt)));

    // Combined: reject if either skewness or kurtosis is significantly non-normal
    const pValue = Math.min(pSkew, pKurt) * 2; // Bonferroni for 2 tests
    const clampedP = Math.min(Math.max(pValue, 0), 1);

    return {
      statistic: 1 - Math.abs(skewness),
      pValue: clampedP,
      isNormal: clampedP >= 0.05,
    };
  }

  // For n >= 20: Jarque-Bera statistic
  const jb = (n / 6) * (skewness * skewness + (1 / 4) * Math.pow(kurtosis - 3, 2));
  const pValue = Math.exp(-jb / 2);

  return {
    statistic: jb,
    pValue: Math.min(Math.max(pValue, 0), 1),
    isNormal: pValue >= 0.05,
  };
}

/**
 * Normal quantile function (inverse CDF) using rational approximation.
 * Abramowitz and Stegun formula 26.2.23, accurate to ~4.5e-4.
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const isLower = p < 0.5;
  const pp = isLower ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(pp));

  // Rational approximation coefficients
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const result = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);

  return isLower ? -result : result;
}

/**
 * Automatically select the appropriate statistical test based on data characteristics.
 *
 * Decision logic:
 * 1. If either group has n < 3: not enough data, return undefined
 * 2. If either group fails Shapiro-Wilk normality test: use Mann-Whitney U
 * 3. Otherwise: use Welch's t-test
 *
 * Returns the selected test result along with the selection rationale.
 */
export function autoSelectTest(
  group1: number[],
  group2: number[]
): { test: StatisticalTest; testUsed: 'welch-t' | 'mann-whitney-u'; reason: string } | null {
  if (group1.length < 3 || group2.length < 3) {
    return null;
  }

  const norm1 = normalityTest(group1);
  const norm2 = normalityTest(group2);

  const fmt = (r: typeof norm1) => `p=${r.pValue.toFixed(3)}`;

  if (!norm1.isNormal || !norm2.isNormal) {
    const reason = !norm1.isNormal && !norm2.isNormal
      ? `Both groups fail normality (${fmt(norm1)}; ${fmt(norm2)})`
      : !norm1.isNormal
        ? `Group 1 fails normality (${fmt(norm1)})`
        : `Group 2 fails normality (${fmt(norm2)})`;

    return {
      test: mannWhitneyU(group1, group2),
      testUsed: 'mann-whitney-u',
      reason: `Non-parametric test selected: ${reason}`,
    };
  }

  return {
    test: tTest(group1, group2),
    testUsed: 'welch-t',
    reason: `Parametric test selected: both groups pass normality (${fmt(norm1)}; ${fmt(norm2)})`,
  };
}

/**
 * A priori power analysis: estimate the minimum sample size needed per group
 * to detect a given effect size with specified power and alpha.
 *
 * Uses the formula: n = ((z_alpha + z_beta) / d)^2 * 2
 * where d = Cohen's d effect size.
 */
export function requiredSampleSize(
  effectSize: number,
  power = 0.80,
  alpha = 0.05
): number {
  if (effectSize <= 0) return Infinity;

  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);

  // Two-sample formula: n per group = 2 * ((z_alpha + z_beta) / d)^2
  const n = 2 * Math.pow((zAlpha + zBeta) / effectSize, 2);

  return Math.ceil(n);
}
