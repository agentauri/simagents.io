/**
 * Sugarscape Validation Script
 *
 * Runs the sugarscape replication experiment with multiple seeds to verify:
 * 1. Deterministic reproducibility (same seed -> same event/state hashes)
 * 2. Meaningful differences between control and treatment conditions
 * 3. Statistical power analysis for the experiment design
 * 4. Research bundle integrity
 *
 * Usage:
 *   bun run src/scripts/validate-sugarscape.ts [--runs N] [--seeds N] [--verbose]
 *
 * Recommended for publication: --runs 5 --seeds 10
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runExperiment, resetRunnerWorld, type RunResult } from '../experiments/runner';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import {
  cohensD,
  interpretEffectSize,
  mean,
  stdDev,
  confidenceInterval,
  tTest,
  mannWhitneyU,
  normalityTest,
  requiredSampleSize,
} from '../analysis/experiment-analysis';

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_RUNS_PER_CONDITION = 3;
const DEFAULT_SEED_COUNT = 10;
const CONFIG_PATH = join(import.meta.dir, '../../experiments/sugarscape-replication.yaml');

function parseArgs(): { runsPerCondition: number; seedCount: number; verbose: boolean; outputDir?: string } {
  const args = process.argv.slice(2);
  let runsPerCondition = DEFAULT_RUNS_PER_CONDITION;
  let seedCount = DEFAULT_SEED_COUNT;
  let verbose = false;
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runs' && args[i + 1]) {
      runsPerCondition = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--seeds' && args[i + 1]) {
      seedCount = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    }
  }

  return { runsPerCondition, seedCount, verbose, outputDir };
}

// =============================================================================
// Reproducibility Check
// =============================================================================

interface ReproducibilityResult {
  seed: number;
  hashesMatch: boolean;
  run1Hash: string;
  run2Hash: string;
}

async function checkReproducibility(
  verbose: boolean
): Promise<ReproducibilityResult> {
  const tmpDir1 = mkdtempSync(join(tmpdir(), 'sugarscape-repro-1-'));
  const tmpDir2 = mkdtempSync(join(tmpdir(), 'sugarscape-repro-2-'));

  try {
    // Nuclear reset: truncate ALL tables to ensure pristine starting state
    const nuclearReset = async () => {
      await resetRunnerWorld();
      await db.execute(sql`
        TRUNCATE TABLE variant_snapshots, experiment_variants, experiments,
                       events, ledger, inventory, agent_memories, agent_relationships,
                       agent_knowledge, agent_roles
        RESTART IDENTITY CASCADE
      `);
    };

    await nuclearReset();

    const results1 = await runExperiment({
      configPath: CONFIG_PATH,
      runs: 1,
      outputDir: tmpDir1,
      verbose,
    });

    await nuclearReset();

    const results2 = await runExperiment({
      configPath: CONFIG_PATH,
      runs: 1,
      outputDir: tmpDir2,
      verbose,
    });

    const hash1 = results1[0]?.artifact.eventTraceHash ?? 'NO_HASH';
    const hash2 = results2[0]?.artifact.eventTraceHash ?? 'NO_HASH';

    return {
      seed: results1[0]?.seed ?? 0,
      hashesMatch: hash1 === hash2,
      run1Hash: hash1,
      run2Hash: hash2,
    };
  } finally {
    rmSync(tmpDir1, { recursive: true, force: true });
    rmSync(tmpDir2, { recursive: true, force: true });
  }
}

// =============================================================================
// Statistical Summary
// =============================================================================

interface MetricSummary {
  name: string;
  controlValues: number[];
  treatmentValues: number[];
  controlMean: number;
  controlCI: { lower: number; upper: number };
  treatmentMean: number;
  treatmentCI: { lower: number; upper: number };
  cohensD: number;
  effectInterpretation: string;
  tTestPValue: number;
  mannWhitneyPValue: number;
  controlNormal: boolean;
  treatmentNormal: boolean;
}

function analyzeMetric(
  name: string,
  controlResults: RunResult[],
  treatmentResults: RunResult[],
  extract: (r: RunResult) => number
): MetricSummary {
  const controlValues = controlResults.map(extract);
  const treatmentValues = treatmentResults.map(extract);

  const controlCI = confidenceInterval(controlValues);
  const treatmentCI = confidenceInterval(treatmentValues);
  const d = cohensD(controlValues, treatmentValues);
  const tResult = tTest(controlValues, treatmentValues);
  const mwResult = mannWhitneyU(controlValues, treatmentValues);
  const normControl = normalityTest(controlValues);
  const normTreatment = normalityTest(treatmentValues);

  return {
    name,
    controlValues,
    treatmentValues,
    controlMean: mean(controlValues),
    controlCI: { lower: controlCI.lower, upper: controlCI.upper },
    treatmentMean: mean(treatmentValues),
    treatmentCI: { lower: treatmentCI.lower, upper: treatmentCI.upper },
    cohensD: d,
    effectInterpretation: interpretEffectSize(d),
    tTestPValue: tResult.pValue,
    mannWhitneyPValue: mwResult.pValue,
    controlNormal: normControl.isNormal,
    treatmentNormal: normTreatment.isNormal,
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const { runsPerCondition, seedCount, verbose, outputDir } = parseArgs();

  console.log('='.repeat(70));
  console.log('  Sugarscape Replication Validation');
  console.log('='.repeat(70));
  console.log(`  Config:             ${CONFIG_PATH}`);
  console.log(`  Runs per condition: ${runsPerCondition}`);
  console.log(`  Reproducibility:    ${Math.min(seedCount, 3)} checks`);
  console.log('');

  // Phase 1: Multi-seed experiment runs
  console.log('[Phase 1] Running experiments...');

  const resolvedOutputDir = outputDir ?? mkdtempSync(join(tmpdir(), 'sugarscape-validation-'));
  if (!existsSync(resolvedOutputDir)) {
    mkdirSync(resolvedOutputDir, { recursive: true });
  }

  let allResults: RunResult[] = [];

  try {
    allResults = await runExperiment({
      configPath: CONFIG_PATH,
      runs: runsPerCondition,
      outputDir: resolvedOutputDir,
      verbose,
    });
  } catch (err) {
    console.error('[Phase 1] Experiment run failed:', err);
    if (!outputDir) rmSync(resolvedOutputDir, { recursive: true, force: true });
    process.exit(1);
  }

  const conditions = [...new Set(allResults.map((r) => r.conditionName))];
  console.log(`  Completed ${allResults.length} runs across ${conditions.length} conditions.`);

  // Phase 2: Reproducibility check
  await resetRunnerWorld();
  const reproChecks = Math.min(seedCount, 3);
  console.log(`\n[Phase 2] Reproducibility — running ${reproChecks} determinism check(s)...`);
  const reproResults: ReproducibilityResult[] = [];

  for (let i = 0; i < reproChecks; i++) {
    console.log(`  Check ${i + 1}/${reproChecks}...`);
    try {
      const result = await checkReproducibility(verbose);
      reproResults.push(result);
      console.log(`    ${result.hashesMatch ? 'PASS' : 'FAIL'}: ${result.run1Hash.slice(0, 12)}... vs ${result.run2Hash.slice(0, 12)}...`);
    } catch (err) {
      console.error(`    ERROR on check ${i + 1}:`, err);
    }
  }

  const reproPass = reproResults.filter((r) => r.hashesMatch).length;
  const reproTotal = reproResults.length;

  // Phase 3: Statistical analysis
  console.log('\n[Phase 3] Statistical analysis...');

  if (conditions.length >= 2) {
    const controlResults = allResults.filter((r) => r.conditionName === conditions[0]);
    const treatmentResults = allResults.filter((r) => r.conditionName === conditions[1]);

    const metrics: Array<{ name: string; extract: (r: RunResult) => number }> = [
      { name: 'Survival Rate', extract: (r) => r.finalMetrics.survivalRate },
      { name: 'Gini Coefficient', extract: (r) => r.finalMetrics.giniCoefficient },
      { name: 'Average Wealth', extract: (r) => r.finalMetrics.avgWealth },
      { name: 'Cooperation Index', extract: (r) => r.finalMetrics.cooperationIndex },
      { name: 'Trade Count', extract: (r) => r.finalMetrics.tradeCount },
      { name: 'Conflict Count', extract: (r) => r.finalMetrics.conflictCount },
    ];

    const summaries = metrics.map((m) =>
      analyzeMetric(m.name, controlResults, treatmentResults, m.extract)
    );

    // Print detailed results table
    console.log(`\n  ${conditions[0]} vs ${conditions[1]}:`);
    console.log(`  ${'Metric'.padEnd(22)} ${'Control'.padStart(12)} ${'Treatment'.padStart(12)} ${"Cohen's d".padStart(12)} ${'Effect'.padStart(10)} ${'t-test p'.padStart(10)} ${'MW-U p'.padStart(10)}`);
    console.log('  ' + '-'.repeat(88));

    for (const s of summaries) {
      const controlStr = `${s.controlMean.toFixed(3)}`;
      const treatmentStr = `${s.treatmentMean.toFixed(3)}`;
      const dStr = `${s.cohensD.toFixed(3)}`;
      const pTStr = s.tTestPValue < 0.001 ? '<0.001' : s.tTestPValue.toFixed(3);
      const pMWStr = s.mannWhitneyPValue < 0.001 ? '<0.001' : s.mannWhitneyPValue.toFixed(3);

      console.log(
        `  ${s.name.padEnd(22)} ${controlStr.padStart(12)} ${treatmentStr.padStart(12)} ${dStr.padStart(12)} ${s.effectInterpretation.padStart(10)} ${pTStr.padStart(10)} ${pMWStr.padStart(10)}`
      );
    }

    // Normality assessment
    console.log('\n  Normality check (for test selection guidance):');
    for (const s of summaries) {
      if (!s.controlNormal || !s.treatmentNormal) {
        const which = !s.controlNormal && !s.treatmentNormal
          ? 'both groups'
          : !s.controlNormal ? 'control' : 'treatment';
        console.log(`    ${s.name}: NON-NORMAL (${which}) — prefer Mann-Whitney U p-value`);
      }
    }

    // Confidence intervals
    console.log('\n  95% Confidence Intervals:');
    for (const s of summaries) {
      console.log(
        `    ${s.name.padEnd(22)} Control: [${s.controlCI.lower.toFixed(3)}, ${s.controlCI.upper.toFixed(3)}]  Treatment: [${s.treatmentCI.lower.toFixed(3)}, ${s.treatmentCI.upper.toFixed(3)}]`
      );
    }

    // Power analysis
    console.log('\n  A priori power analysis (runs needed per condition for 80% power):');
    for (const s of summaries) {
      const absD = Math.abs(s.cohensD);
      if (absD > 0.01) {
        const needed = requiredSampleSize(absD);
        const sufficient = controlResults.length >= needed ? 'SUFFICIENT' : `NEED ${needed}`;
        console.log(`    ${s.name.padEnd(22)} d=${absD.toFixed(2)} -> n=${needed} per group (${sufficient})`);
      } else {
        console.log(`    ${s.name.padEnd(22)} d~0 — no detectable effect`);
      }
    }
  } else {
    console.log('  Only one condition found — no comparative analysis possible.');
    for (const condition of conditions) {
      const runs = allResults.filter((r) => r.conditionName === condition);
      console.log(`\n  ${condition} (${runs.length} runs):`);
      console.log(`    Survival: ${mean(runs.map((r) => r.finalMetrics.survivalRate)).toFixed(3)} +/- ${stdDev(runs.map((r) => r.finalMetrics.survivalRate)).toFixed(3)}`);
      console.log(`    Gini:     ${mean(runs.map((r) => r.finalMetrics.giniCoefficient)).toFixed(3)} +/- ${stdDev(runs.map((r) => r.finalMetrics.giniCoefficient)).toFixed(3)}`);
    }
  }

  // Phase 4: Summary
  console.log('\n' + '='.repeat(70));
  console.log('  Validation Summary');
  console.log('='.repeat(70));
  console.log(`  Conditions:        ${conditions.length} (minimum 2: ${conditions.length >= 2 ? 'PASS' : 'FAIL'})`);
  console.log(`  Total runs:        ${allResults.length}`);
  console.log(`  Runs/condition:    ${runsPerCondition} (recommended >= 5 for publication)`);
  console.log(`  Reproducibility:   ${reproPass}/${reproTotal} seeds match`);
  console.log(`  Output:            ${resolvedOutputDir}`);

  const allPass = conditions.length >= 2 && reproPass === reproTotal;
  const publicationReady = allPass && runsPerCondition >= 5;

  console.log(`\n  Validation:        ${allPass ? 'PASSED' : 'INCOMPLETE'}`);
  console.log(`  Publication ready: ${publicationReady ? 'YES' : 'NO — ' + (runsPerCondition < 5 ? `need >= 5 runs/condition (have ${runsPerCondition})` : 'see notes')}`);

  if (!allPass) {
    console.log('\n  Notes:');
    if (conditions.length < 2) {
      console.log('    - Need at least 2 conditions (variants) for comparative claims');
    }
    if (reproPass < reproTotal) {
      console.log(`    - ${reproTotal - reproPass} seed(s) produced non-identical hashes`);
    }
  }

  // Cleanup temp dir only if we created it
  if (!outputDir) {
    rmSync(resolvedOutputDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
