/**
 * Multi-Agent Evolution Orchestrator
 *
 * Runs one AgentEvolutionRunner per enabled agent type.
 * Each agent evolves independently — no genome sharing between types.
 *
 * Usage:
 *   bun run apps/server/src/evolution/orchestrator.ts [--once] [--agent claude] [--generations 50] [--status]
 */

import { AgentEvolutionRunner } from './runner';
import type { EvolutionConfig, SurvivalStatus } from './types';
import type { LLMType } from '../llm/types';
import { CONFIG } from '../config';
import { join } from 'path';

// Agent types that participate in evolution (excludes baselines and external)
const EVOLVING_AGENTS: LLMType[] = [
  'claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok',
];

export class EvolutionOrchestrator {
  private runners: Map<LLMType, AgentEvolutionRunner> = new Map();
  private config: EvolutionConfig;

  constructor(
    dataDir: string,
    config: Partial<EvolutionConfig> = {},
    agents?: LLMType[],
    seed?: number,
  ) {
    this.config = { ...CONFIG.evolution, ...config };
    const agentList = agents ?? EVOLVING_AGENTS;

    for (const agentType of agentList) {
      this.runners.set(
        agentType,
        new AgentEvolutionRunner(agentType, dataDir, this.config, seed),
      );
    }
  }

  /** Run one generation for all agents */
  runGeneration(): Map<LLMType, { best: number; avg: number; improved: boolean }> {
    const results = new Map<LLMType, { best: number; avg: number; improved: boolean }>();

    for (const [agentType, runner] of this.runners) {
      const { best, avgFitness, improved } = runner.runGeneration();
      results.set(agentType, {
        best: best.fitness?.composite ?? 0,
        avg: avgFitness,
        improved,
      });
    }

    return results;
  }

  /** Run N generations for all agents */
  run(maxGenerations: number): void {
    console.log(`\n=== Evolution: ${this.runners.size} agents × ${maxGenerations} generations ===\n`);

    for (let g = 0; g < maxGenerations; g++) {
      this.runGeneration();
    }

    console.log('\n=== Evolution complete ===\n');
    this.printStatus();
  }

  /** Get survival status for all agents */
  getSurvivalStatuses(): SurvivalStatus[] {
    return Array.from(this.runners.values()).map(r => r.getSurvivalStatus());
  }

  /** Print a human-readable status table */
  printStatus(): void {
    const statuses = this.getSurvivalStatuses();

    console.log('┌─────────────┬───────┬──────┬───────────┬──────────┬──────────────────────────┐');
    console.log('│ Agent       │ Alive │ Gen  │ Fitness   │ Baseline │ Reason                   │');
    console.log('├─────────────┼───────┼──────┼───────────┼──────────┼──────────────────────────┤');

    for (const s of statuses) {
      const alive = s.alive ? ' YES ' : ' NO  ';
      const agent = s.agentType.padEnd(11);
      const gen = String(s.generation).padStart(4);
      const fit = s.incumbentFitness.toFixed(3).padStart(9);
      const base = s.baselineFitness.toFixed(3).padStart(8);
      const reason = s.reason.substring(0, 24).padEnd(24);
      console.log(`│ ${agent} │${alive}│${gen}  │${fit}  │${base}  │ ${reason} │`);
    }

    console.log('└─────────────┴───────┴──────┴───────────┴──────────┴──────────────────────────┘');

    const aliveCount = statuses.filter(s => s.alive).length;
    console.log(`\n${aliveCount}/${statuses.length} agents earned survival.\n`);
  }

  getRunner(agentType: LLMType): AgentEvolutionRunner | undefined {
    return this.runners.get(agentType);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dataDir = join(import.meta.dir, '../../../../data');

  const getFlag = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const agent = getFlag('agent') as LLMType | undefined;
  const maxGen = Number(getFlag('generations') ?? 10);
  const seed = getFlag('seed') ? Number(getFlag('seed')) : undefined;
  const agents = agent ? [agent] : undefined;

  const orchestrator = new EvolutionOrchestrator(dataDir, {}, agents, seed);

  if (hasFlag('status')) {
    orchestrator.printStatus();
  } else if (hasFlag('once')) {
    orchestrator.runGeneration();
    orchestrator.printStatus();
  } else {
    orchestrator.run(maxGen);
  }
}
