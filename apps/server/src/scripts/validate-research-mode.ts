/**
 * Research Mode Validation Harness
 *
 * Runs a small deterministic matrix to establish an operating envelope for
 * scientific-mode execution.
 *
 * Usage:
 *   bun run src/scripts/validate-research-mode.ts
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runExperiment } from '../experiments/runner';

interface ValidationScenario {
  name: string;
  ticks: number;
  randomAgents: number;
  ruleAgents: number;
}

const SCENARIOS: ValidationScenario[] = [
  { name: 'tiny', ticks: 10, randomAgents: 1, ruleAgents: 1 },
  { name: 'small', ticks: 25, randomAgents: 2, ruleAgents: 2 },
  { name: 'medium', ticks: 50, randomAgents: 4, ruleAgents: 4 },
];

async function main(): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), 'simagents-research-validate-'));

  try {
    const report: Array<Record<string, unknown>> = [];

    for (const scenario of SCENARIOS) {
      const configPath = join(tempDir, `${scenario.name}.json`);
      writeFileSync(configPath, JSON.stringify({
        name: `Research Mode Validation - ${scenario.name}`,
        duration: scenario.ticks,
        seed: 1000 + scenario.ticks,
        mode: 'fallback',
        profile: 'deterministic_baseline',
        benchmarkWorld: 'canonical_core',
        agents: [
          { type: 'baseline_random', count: scenario.randomAgents },
          { type: 'baseline_rule', count: scenario.ruleAgents },
        ],
      }, null, 2));

      const startedAt = Date.now();
      const [result] = await runExperiment({
        configPath,
        runs: 1,
        verbose: false,
        autoInjectBaselines: false,
      });
      const elapsedMs = Date.now() - startedAt;

      report.push({
        scenario: scenario.name,
        ticks: scenario.ticks,
        agents: scenario.randomAgents + scenario.ruleAgents,
        elapsedMs,
        ticksPerSecond: result.ticksCompleted > 0 ? result.ticksCompleted / Math.max(elapsedMs / 1000, 0.001) : 0,
        eventCount: result.artifact.eventCount,
        eventTraceHash: result.artifact.eventTraceHash,
      });
    }

    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[ResearchModeValidation] Failed:', error);
  process.exit(1);
});
