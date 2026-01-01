/**
 * Reproducibility Test Script
 *
 * Verifies that the SeededRNG produces deterministic results.
 * Runs the same seed twice and compares outputs.
 *
 * Usage:
 *   bun run src/scripts/test-reproducibility.ts
 */

import { initializeRNG, resetRNG, random, randomBelow, randomChoice } from '../utils/random';

// =============================================================================
// Test 1: Basic RNG Reproducibility
// =============================================================================

function testBasicReproducibility(): boolean {
  console.log('\n[Test 1] Basic RNG Reproducibility');
  console.log('─'.repeat(50));

  const seed = '42001';
  const sampleSize = 100;

  // First run
  initializeRNG(seed);
  const run1: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run1.push(random());
  }

  // Reset and second run with same seed
  resetRNG();
  initializeRNG(seed);
  const run2: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run2.push(random());
  }

  // Compare
  let identical = true;
  for (let i = 0; i < sampleSize; i++) {
    if (run1[i] !== run2[i]) {
      console.log(`  ✗ Mismatch at index ${i}: ${run1[i]} !== ${run2[i]}`);
      identical = false;
      break;
    }
  }

  if (identical) {
    console.log(`  ✓ ${sampleSize} random values identical across both runs`);
    console.log(`    First 5 values: [${run1.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
  }

  resetRNG();
  return identical;
}

// =============================================================================
// Test 2: randomBelow Reproducibility
// =============================================================================

function testRandomBelowReproducibility(): boolean {
  console.log('\n[Test 2] randomBelow() Reproducibility');
  console.log('─'.repeat(50));

  const seed = '43001';
  const sampleSize = 50;
  const maxValue = 100;

  // First run
  initializeRNG(seed);
  const run1: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run1.push(randomBelow(maxValue));
  }

  // Reset and second run
  resetRNG();
  initializeRNG(seed);
  const run2: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run2.push(randomBelow(maxValue));
  }

  // Compare
  let identical = true;
  for (let i = 0; i < sampleSize; i++) {
    if (run1[i] !== run2[i]) {
      console.log(`  ✗ Mismatch at index ${i}: ${run1[i]} !== ${run2[i]}`);
      identical = false;
      break;
    }
  }

  if (identical) {
    console.log(`  ✓ ${sampleSize} randomBelow(${maxValue}) values identical`);
    console.log(`    First 10 values: [${run1.slice(0, 10).join(', ')}]`);
  }

  resetRNG();
  return identical;
}

// =============================================================================
// Test 3: randomChoice Reproducibility
// =============================================================================

function testRandomChoiceReproducibility(): boolean {
  console.log('\n[Test 3] randomChoice() Reproducibility');
  console.log('─'.repeat(50));

  const seed = '44001';
  const sampleSize = 30;
  const choices = ['north', 'south', 'east', 'west'];

  // First run
  initializeRNG(seed);
  const run1: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run1.push(randomChoice(choices) ?? 'none');
  }

  // Reset and second run
  resetRNG();
  initializeRNG(seed);
  const run2: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run2.push(randomChoice(choices) ?? 'none');
  }

  // Compare
  let identical = true;
  for (let i = 0; i < sampleSize; i++) {
    if (run1[i] !== run2[i]) {
      console.log(`  ✗ Mismatch at index ${i}: ${run1[i]} !== ${run2[i]}`);
      identical = false;
      break;
    }
  }

  if (identical) {
    console.log(`  ✓ ${sampleSize} randomChoice() values identical`);
    console.log(`    First 10 choices: [${run1.slice(0, 10).join(', ')}]`);
  }

  resetRNG();
  return identical;
}

// =============================================================================
// Test 4: Different Seeds Produce Different Results
// =============================================================================

function testDifferentSeeds(): boolean {
  console.log('\n[Test 4] Different Seeds → Different Results');
  console.log('─'.repeat(50));

  const sampleSize = 20;

  // Seed 1
  initializeRNG('seed_alpha');
  const run1: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run1.push(random());
  }

  // Seed 2
  resetRNG();
  initializeRNG('seed_beta');
  const run2: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    run2.push(random());
  }

  // Check they're different
  let differences = 0;
  for (let i = 0; i < sampleSize; i++) {
    if (run1[i] !== run2[i]) {
      differences++;
    }
  }

  const allDifferent = differences === sampleSize;

  if (allDifferent) {
    console.log(`  ✓ All ${sampleSize} values differ between seeds`);
    console.log(`    Seed 'seed_alpha': [${run1.slice(0, 3).map(v => v.toFixed(4)).join(', ')}, ...]`);
    console.log(`    Seed 'seed_beta':  [${run2.slice(0, 3).map(v => v.toFixed(4)).join(', ')}, ...]`);
  } else {
    console.log(`  ✗ Only ${differences}/${sampleSize} values differ (expected all)`);
  }

  resetRNG();
  return allDifferent;
}

// =============================================================================
// Test 5: Simulated Tick Sequence
// =============================================================================

function testTickSequence(): boolean {
  console.log('\n[Test 5] Simulated Tick Sequence');
  console.log('─'.repeat(50));

  const seed = '42001';
  const numTicks = 10;
  const numAgents = 6;
  const directions = ['north', 'south', 'east', 'west'];

  interface TickResult {
    tick: number;
    agentMoves: { agentId: number; direction: string; roll: number }[];
  }

  function simulateTicks(): TickResult[] {
    const results: TickResult[] = [];

    for (let tick = 0; tick < numTicks; tick++) {
      const agentMoves: { agentId: number; direction: string; roll: number }[] = [];

      for (let agent = 0; agent < numAgents; agent++) {
        const direction = randomChoice(directions) ?? 'north';
        const roll = randomBelow(100);
        agentMoves.push({ agentId: agent, direction, roll });
      }

      results.push({ tick, agentMoves });
    }

    return results;
  }

  // First simulation
  initializeRNG(seed);
  const sim1 = simulateTicks();

  // Reset and second simulation
  resetRNG();
  initializeRNG(seed);
  const sim2 = simulateTicks();

  // Compare
  let identical = true;
  outer: for (let t = 0; t < numTicks; t++) {
    for (let a = 0; a < numAgents; a++) {
      const m1 = sim1[t].agentMoves[a];
      const m2 = sim2[t].agentMoves[a];
      if (m1.direction !== m2.direction || m1.roll !== m2.roll) {
        console.log(`  ✗ Mismatch at tick ${t}, agent ${a}`);
        identical = false;
        break outer;
      }
    }
  }

  if (identical) {
    console.log(`  ✓ ${numTicks} ticks × ${numAgents} agents = ${numTicks * numAgents} decisions identical`);
    console.log(`    Tick 0 sample: Agent 0 → ${sim1[0].agentMoves[0].direction} (roll: ${sim1[0].agentMoves[0].roll})`);
    console.log(`    Tick 0 sample: Agent 5 → ${sim1[0].agentMoves[5].direction} (roll: ${sim1[0].agentMoves[5].roll})`);
  }

  resetRNG();
  return identical;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('========================================');
  console.log('  AgentsCity Reproducibility Test');
  console.log('========================================');

  const results: { name: string; passed: boolean }[] = [];

  results.push({ name: 'Basic RNG Reproducibility', passed: testBasicReproducibility() });
  results.push({ name: 'randomBelow() Reproducibility', passed: testRandomBelowReproducibility() });
  results.push({ name: 'randomChoice() Reproducibility', passed: testRandomChoiceReproducibility() });
  results.push({ name: 'Different Seeds → Different Results', passed: testDifferentSeeds() });
  results.push({ name: 'Simulated Tick Sequence', passed: testTickSequence() });

  // Summary
  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${result.name}`);
  }

  console.log(`\n  Total: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n  🎉 All reproducibility tests passed!');
    console.log('     SeededRNG is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n  ⚠️  Some tests failed. Check SeededRNG implementation.\n');
    process.exit(1);
  }
}

main();
