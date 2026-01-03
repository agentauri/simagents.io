/**
 * Tests for Genesis Module
 *
 * Tests cover:
 * - Prompt building
 * - JSON parsing and validation
 * - Diversity validation
 * - Archetype matching
 * - Population balance analysis
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import {
  buildGenesisPrompt,
  parseAndValidateOutput,
  computePairwiseDistance,
  validateDiversity,
  computeTraitEntropy,
  getChildrenSummary,
  type LLMInvoker,
  generateChildren,
} from '../../agents/genesis';
import type { ChildSpecification, GenesisConfig } from '../../agents/genesis-types';
import { DEFAULT_GENESIS_CONFIG } from '../../agents/genesis-types';
import {
  computeJSDivergence,
  computeGenerationDrift,
  analyzePopulationBalance,
  performComprehensiveValidation,
  generateFixSuggestions,
} from '../../agents/genesis-validator';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockChild(overrides: Partial<ChildSpecification> = {}): ChildSpecification {
  return {
    name: 'Test Agent',
    personality: 'neutral',
    riskTolerance: 0.5,
    socialOrientation: 0.5,
    resourcePriority: 'balanced',
    ...overrides,
  };
}

function createMockConfig(overrides: Partial<GenesisConfig> = {}): GenesisConfig {
  return {
    ...DEFAULT_GENESIS_CONFIG,
    enabled: true,
    childrenPerMother: 10,
    mothers: ['claude'],
    ...overrides,
  };
}

// =============================================================================
// Prompt Building Tests
// =============================================================================

describe('buildGenesisPrompt', () => {
  test('includes mother type in prompt', () => {
    const prompt = buildGenesisPrompt('claude', 10);
    expect(prompt).toContain('CLAUDE');
    expect(prompt).toContain('10 unique child agents');
  });

  test('includes required archetype descriptions', () => {
    const prompt = buildGenesisPrompt('gemini', 5, {
      requiredArchetypes: ['high_risk', 'low_risk'],
    });
    expect(prompt).toContain('high_risk');
    expect(prompt).toContain('low_risk');
    expect(prompt).toContain('risk tolerance > 0.7');
    expect(prompt).toContain('risk tolerance < 0.3');
  });

  test('includes JSON output format', () => {
    const prompt = buildGenesisPrompt('codex', 10);
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('riskTolerance');
    expect(prompt).toContain('socialOrientation');
    expect(prompt).toContain('resourcePriority');
  });

  test('includes diversity requirements', () => {
    const prompt = buildGenesisPrompt('claude', 20);
    expect(prompt).toContain('20%');
    expect(prompt).toContain('risk-averse');
    expect(prompt).toContain('risk-seeking');
    expect(prompt).toContain('personality types');
  });
});

// =============================================================================
// JSON Parsing Tests
// =============================================================================

describe('parseAndValidateOutput', () => {
  test('parses valid JSON array', () => {
    const json = JSON.stringify([
      {
        name: 'Explorer One',
        personality: 'explorer',
        riskTolerance: 0.8,
        socialOrientation: 0.3,
        resourcePriority: 'material',
      },
      {
        name: 'Cautious Two',
        personality: 'cautious',
        riskTolerance: 0.2,
        socialOrientation: 0.6,
        resourcePriority: 'food',
      },
    ]);

    const result = parseAndValidateOutput(json);

    expect(result.isValid).toBe(true);
    expect(result.validChildren.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  test('extracts JSON from markdown code block', () => {
    const response = `Here are the agents:
\`\`\`json
[
  {
    "name": "Test Agent",
    "personality": "neutral",
    "riskTolerance": 0.5,
    "socialOrientation": 0.5,
    "resourcePriority": "balanced"
  }
]
\`\`\`
`;

    const result = parseAndValidateOutput(response);

    expect(result.isValid).toBe(true);
    expect(result.validChildren.length).toBe(1);
    expect(result.validChildren[0].name).toBe('Test Agent');
  });

  test('rejects invalid JSON', () => {
    const result = parseAndValidateOutput('not valid json');
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Failed to parse JSON');
  });

  test('rejects non-array JSON', () => {
    const result = parseAndValidateOutput('{"name": "test"}');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Response is not an array');
  });

  test('validates required fields', () => {
    const json = JSON.stringify([
      { name: 'Missing Fields' }, // Missing required fields
    ]);

    const result = parseAndValidateOutput(json);

    expect(result.isValid).toBe(false);
    expect(result.invalidCount).toBe(1);
    expect(result.errors.some(e => e.includes('personality'))).toBe(true);
  });

  test('validates personality enum', () => {
    const json = JSON.stringify([
      {
        name: 'Bad Personality',
        personality: 'invalid_type',
        riskTolerance: 0.5,
        socialOrientation: 0.5,
        resourcePriority: 'balanced',
      },
    ]);

    const result = parseAndValidateOutput(json);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("Invalid personality"))).toBe(true);
  });

  test('validates riskTolerance range', () => {
    const json = JSON.stringify([
      {
        name: 'Out of Range',
        personality: 'neutral',
        riskTolerance: 1.5, // Invalid: > 1
        socialOrientation: 0.5,
        resourcePriority: 'balanced',
      },
    ]);

    const result = parseAndValidateOutput(json);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('riskTolerance'))).toBe(true);
  });

  test('detects duplicate names', () => {
    const json = JSON.stringify([
      {
        name: 'Duplicate Name',
        personality: 'neutral',
        riskTolerance: 0.5,
        socialOrientation: 0.5,
        resourcePriority: 'balanced',
      },
      {
        name: 'Duplicate Name', // Duplicate
        personality: 'explorer',
        riskTolerance: 0.8,
        socialOrientation: 0.3,
        resourcePriority: 'energy',
      },
    ]);

    const result = parseAndValidateOutput(json);

    // Children are still valid individually
    expect(result.validChildren.length).toBe(2);
    // But duplication is flagged
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });

  test('truncates long strategic hints', () => {
    const json = JSON.stringify([
      {
        name: 'Long Hint',
        personality: 'neutral',
        riskTolerance: 0.5,
        socialOrientation: 0.5,
        resourcePriority: 'balanced',
        strategicHint: 'This is a very long strategic hint that has way more than fifteen words and should be truncated to fit the limit set in the validation logic',
      },
    ]);

    const result = parseAndValidateOutput(json);

    expect(result.isValid).toBe(true);
    const hint = result.validChildren[0].strategicHint;
    expect(hint).toContain('...');
    expect(hint!.split(/\s+/).length).toBeLessThanOrEqual(16); // 15 words + ...
  });
});

// =============================================================================
// Pairwise Distance Tests
// =============================================================================

describe('computePairwiseDistance', () => {
  test('identical children have distance 0', () => {
    const child = createMockChild();
    const distance = computePairwiseDistance(child, child);
    expect(distance).toBe(0);
  });

  test('maximally different children have high distance', () => {
    const child1 = createMockChild({
      personality: 'aggressive',
      riskTolerance: 0,
      socialOrientation: 0,
      resourcePriority: 'food',
    });
    const child2 = createMockChild({
      personality: 'cooperative',
      riskTolerance: 1,
      socialOrientation: 1,
      resourcePriority: 'material',
    });

    const distance = computePairwiseDistance(child1, child2);
    expect(distance).toBeGreaterThan(0.8);
  });

  test('same personality reduces distance', () => {
    const child1 = createMockChild({ personality: 'explorer', riskTolerance: 0.3 });
    const child2 = createMockChild({ personality: 'explorer', riskTolerance: 0.7 });
    const child3 = createMockChild({ personality: 'cautious', riskTolerance: 0.7 });

    const distSamePersonality = computePairwiseDistance(child1, child2);
    const distDiffPersonality = computePairwiseDistance(child1, child3);

    expect(distSamePersonality).toBeLessThan(distDiffPersonality);
  });
});

// =============================================================================
// Diversity Validation Tests
// =============================================================================

describe('validateDiversity', () => {
  test('validates diverse population', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'aggressive', riskTolerance: 0.9, socialOrientation: 0.2 }),
      createMockChild({ name: 'B', personality: 'cooperative', riskTolerance: 0.1, socialOrientation: 0.9 }),
      createMockChild({ name: 'C', personality: 'explorer', riskTolerance: 0.5, socialOrientation: 0.5 }),
      createMockChild({ name: 'D', personality: 'cautious', riskTolerance: 0.2, socialOrientation: 0.3 }),
      createMockChild({ name: 'E', personality: 'social', riskTolerance: 0.8, socialOrientation: 0.8 }),
    ];

    const config = createMockConfig({
      diversityThreshold: 0.2,
      requiredArchetypes: ['high_risk', 'low_risk'],
    });

    const result = validateDiversity(children, config);

    expect(result.isValid).toBe(true);
    expect(result.diversityScore).toBeGreaterThan(0.3);
    expect(result.missingArchetypes.length).toBe(0);
  });

  test('detects homogeneous population', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'neutral', riskTolerance: 0.5, socialOrientation: 0.5 }),
      createMockChild({ name: 'B', personality: 'neutral', riskTolerance: 0.5, socialOrientation: 0.5 }),
      createMockChild({ name: 'C', personality: 'neutral', riskTolerance: 0.5, socialOrientation: 0.5 }),
    ];

    const config = createMockConfig({ diversityThreshold: 0.3 });
    const result = validateDiversity(children, config);

    expect(result.isValid).toBe(false);
    expect(result.minPairwiseDistance).toBe(0);
    expect(result.similarPairs.length).toBeGreaterThan(0);
  });

  test('detects missing archetypes', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'neutral', riskTolerance: 0.5 }),
      createMockChild({ name: 'B', personality: 'neutral', riskTolerance: 0.5 }),
    ];

    const config = createMockConfig({
      requiredArchetypes: ['high_risk', 'aggressive'],
    });

    const result = validateDiversity(children, config);

    expect(result.isValid).toBe(false);
    expect(result.missingArchetypes).toContain('high_risk');
    expect(result.missingArchetypes).toContain('aggressive');
  });
});

// =============================================================================
// Trait Entropy Tests
// =============================================================================

describe('computeTraitEntropy', () => {
  test('uniform distribution has maximum entropy', () => {
    const children: ChildSpecification[] = [
      createMockChild({ personality: 'aggressive' }),
      createMockChild({ personality: 'cooperative' }),
      createMockChild({ personality: 'cautious' }),
      createMockChild({ personality: 'explorer' }),
      createMockChild({ personality: 'social' }),
      createMockChild({ personality: 'neutral' }),
    ];

    const entropy = computeTraitEntropy(children);
    const maxEntropy = Math.log2(6);

    expect(entropy).toBeCloseTo(maxEntropy, 5);
  });

  test('homogeneous population has zero entropy', () => {
    const children: ChildSpecification[] = [
      createMockChild({ personality: 'neutral' }),
      createMockChild({ personality: 'neutral' }),
      createMockChild({ personality: 'neutral' }),
    ];

    const entropy = computeTraitEntropy(children);
    expect(entropy).toBe(0);
  });

  test('empty array returns zero', () => {
    const entropy = computeTraitEntropy([]);
    expect(entropy).toBe(0);
  });
});

// =============================================================================
// JS Divergence Tests
// =============================================================================

describe('computeJSDivergence', () => {
  test('identical distributions have zero divergence', () => {
    const dist = { aggressive: 2, cooperative: 2, cautious: 2, explorer: 2, social: 2, neutral: 2 };
    const divergence = computeJSDivergence(dist, dist);
    expect(divergence).toBeCloseTo(0, 5);
  });

  test('completely different distributions have high divergence', () => {
    const dist1 = { aggressive: 10, cooperative: 0, cautious: 0, explorer: 0, social: 0, neutral: 0 };
    const dist2 = { aggressive: 0, cooperative: 0, cautious: 0, explorer: 0, social: 0, neutral: 10 };
    const divergence = computeJSDivergence(dist1, dist2);
    expect(divergence).toBeGreaterThan(0.5);
  });
});

// =============================================================================
// Generation Drift Tests
// =============================================================================

describe('computeGenerationDrift', () => {
  test('identical populations have zero drift', () => {
    const children = [
      createMockChild({ riskTolerance: 0.5, socialOrientation: 0.5 }),
      createMockChild({ riskTolerance: 0.6, socialOrientation: 0.4 }),
    ];
    const drift = computeGenerationDrift(children, children);
    expect(drift).toBeCloseTo(0, 5);
  });

  test('opposite populations have high drift', () => {
    const gen0 = [
      createMockChild({ riskTolerance: 0.1, socialOrientation: 0.1 }),
      createMockChild({ riskTolerance: 0.2, socialOrientation: 0.2 }),
    ];
    const genN = [
      createMockChild({ riskTolerance: 0.9, socialOrientation: 0.9 }),
      createMockChild({ riskTolerance: 0.8, socialOrientation: 0.8 }),
    ];
    const drift = computeGenerationDrift(gen0, genN);
    expect(drift).toBeGreaterThan(0.7);
  });

  test('empty populations return 1', () => {
    const drift = computeGenerationDrift([], [createMockChild()]);
    expect(drift).toBe(1);
  });
});

// =============================================================================
// Population Balance Tests
// =============================================================================

describe('analyzePopulationBalance', () => {
  test('balanced population has high score', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'aggressive', riskTolerance: 0.9, socialOrientation: 0.2, resourcePriority: 'food' }),
      createMockChild({ name: 'B', personality: 'cooperative', riskTolerance: 0.1, socialOrientation: 0.9, resourcePriority: 'energy' }),
      createMockChild({ name: 'C', personality: 'explorer', riskTolerance: 0.5, socialOrientation: 0.5, resourcePriority: 'material' }),
      createMockChild({ name: 'D', personality: 'cautious', riskTolerance: 0.2, socialOrientation: 0.3, resourcePriority: 'balanced' }),
      createMockChild({ name: 'E', personality: 'social', riskTolerance: 0.8, socialOrientation: 0.8, resourcePriority: 'food' }),
      createMockChild({ name: 'F', personality: 'neutral', riskTolerance: 0.15, socialOrientation: 0.15, resourcePriority: 'energy' }),
    ];

    const result = analyzePopulationBalance(children);

    expect(result.balanceScore).toBeGreaterThan(0.5);
    expect(result.warnings.length).toBe(0);
    expect(result.riskDistribution.lowRisk).toBeGreaterThan(0);
    expect(result.riskDistribution.highRisk).toBeGreaterThan(0);
  });

  test('unbalanced population generates warnings', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'neutral', riskTolerance: 0.5 }),
      createMockChild({ name: 'B', personality: 'neutral', riskTolerance: 0.5 }),
      createMockChild({ name: 'C', personality: 'neutral', riskTolerance: 0.5 }),
      createMockChild({ name: 'D', personality: 'neutral', riskTolerance: 0.5 }),
      createMockChild({ name: 'E', personality: 'neutral', riskTolerance: 0.5 }),
    ];

    const result = analyzePopulationBalance(children);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('risk'))).toBe(true);
    expect(result.warnings.some(w => w.includes('personality') || w.includes('dominance'))).toBe(true);
  });

  test('empty population returns zero score', () => {
    const result = analyzePopulationBalance([]);
    expect(result.balanceScore).toBe(0);
    expect(result.warnings).toContain('No children to analyze');
  });
});

// =============================================================================
// Comprehensive Validation Tests
// =============================================================================

describe('performComprehensiveValidation', () => {
  test('returns valid for diverse population', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'aggressive', riskTolerance: 0.9, socialOrientation: 0.2 }),
      createMockChild({ name: 'B', personality: 'cooperative', riskTolerance: 0.1, socialOrientation: 0.9 }),
      createMockChild({ name: 'C', personality: 'explorer', riskTolerance: 0.5, socialOrientation: 0.5 }),
      createMockChild({ name: 'D', personality: 'cautious', riskTolerance: 0.2, socialOrientation: 0.3 }),
      createMockChild({ name: 'E', personality: 'social', riskTolerance: 0.8, socialOrientation: 0.8 }),
    ];

    const config = createMockConfig({
      diversityThreshold: 0.2,
      requiredArchetypes: ['high_risk', 'low_risk'],
    });

    const result = performComprehensiveValidation(children, config);

    expect(result.isValid).toBe(true);
    expect(result.overallScore).toBeGreaterThan(0.4);
    expect(result.issues.length).toBe(0);
  });

  test('generates fix suggestions for invalid population', () => {
    const children: ChildSpecification[] = [
      createMockChild({ name: 'A', personality: 'neutral', riskTolerance: 0.5 }),
      createMockChild({ name: 'B', personality: 'neutral', riskTolerance: 0.5 }),
    ];

    const config = createMockConfig({
      diversityThreshold: 0.3,
      requiredArchetypes: ['high_risk', 'aggressive'],
    });

    const validation = performComprehensiveValidation(children, config);
    const suggestions = generateFixSuggestions(validation, config);

    expect(validation.isValid).toBe(false);
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Children Summary Tests
// =============================================================================

describe('getChildrenSummary', () => {
  test('computes correct averages', () => {
    const children: ChildSpecification[] = [
      createMockChild({ riskTolerance: 0.2, socialOrientation: 0.8 }),
      createMockChild({ riskTolerance: 0.8, socialOrientation: 0.2 }),
    ];

    const summary = getChildrenSummary(children);

    expect(summary.count).toBe(2);
    expect(summary.avgRiskTolerance).toBeCloseTo(0.5, 5);
    expect(summary.avgSocialOrientation).toBeCloseTo(0.5, 5);
  });

  test('counts personality distribution', () => {
    const children: ChildSpecification[] = [
      createMockChild({ personality: 'aggressive' }),
      createMockChild({ personality: 'aggressive' }),
      createMockChild({ personality: 'cooperative' }),
    ];

    const summary = getChildrenSummary(children);

    expect(summary.personalityDistribution['aggressive']).toBe(2);
    expect(summary.personalityDistribution['cooperative']).toBe(1);
  });

  test('handles empty array', () => {
    const summary = getChildrenSummary([]);
    expect(summary.count).toBe(0);
    expect(summary.avgRiskTolerance).toBe(0);
  });
});

// =============================================================================
// Integration Test with Mock LLM
// =============================================================================

describe('generateChildren (integration)', () => {
  test('generates children with mock invoker', async () => {
    const mockResponse = JSON.stringify([
      {
        name: 'Bold Explorer',
        backstory: 'A daring adventurer',
        personality: 'explorer',
        riskTolerance: 0.85,
        socialOrientation: 0.4,
        resourcePriority: 'material',
        strategicHint: 'Explore first, settle later',
      },
      {
        name: 'Careful Guardian',
        backstory: 'A protective soul',
        personality: 'cautious',
        riskTolerance: 0.15,
        socialOrientation: 0.6,
        resourcePriority: 'food',
        strategicHint: 'Safety before glory',
      },
      {
        name: 'Social Butterfly',
        personality: 'social',
        riskTolerance: 0.5,
        socialOrientation: 0.9,
        resourcePriority: 'balanced',
      },
      {
        name: 'Lone Wolf',
        personality: 'aggressive',
        riskTolerance: 0.75,
        socialOrientation: 0.1,
        resourcePriority: 'energy',
      },
      {
        name: 'Team Player',
        personality: 'cooperative',
        riskTolerance: 0.3,
        socialOrientation: 0.85,
        resourcePriority: 'food',
      },
    ]);

    const mockInvoker: LLMInvoker = {
      invoke: async (_llmType, _prompt, _temperature) => ({
        response: mockResponse,
        promptTokens: 500,
        responseTokens: 300,
        latencyMs: 1000,
      }),
    };

    const config = createMockConfig({
      childrenPerMother: 5,
      diversityThreshold: 0.2,
      requiredArchetypes: ['high_risk', 'low_risk'],
    });

    const result = await generateChildren('claude', config, mockInvoker);

    expect(result.motherType).toBe('claude');
    expect(result.children.length).toBe(5);
    expect(result.metadata.promptTokens).toBe(500);
    expect(result.metadata.responseTokens).toBe(300);

    // Verify children have correct types
    for (const child of result.children) {
      expect(child.name).toBeTruthy();
      expect(child.personality).toBeTruthy();
      expect(child.riskTolerance).toBeGreaterThanOrEqual(0);
      expect(child.riskTolerance).toBeLessThanOrEqual(1);
    }
  });

  test('retries on invalid output', async () => {
    let callCount = 0;

    const mockInvoker: LLMInvoker = {
      invoke: async (_llmType, _prompt, _temperature) => {
        callCount++;
        if (callCount === 1) {
          // First call: invalid JSON
          return {
            response: 'not valid json',
            promptTokens: 100,
            responseTokens: 50,
            latencyMs: 500,
          };
        }
        // Second call: valid response
        return {
          response: JSON.stringify([
            {
              name: 'Valid Agent',
              personality: 'neutral',
              riskTolerance: 0.8,
              socialOrientation: 0.5,
              resourcePriority: 'balanced',
            },
            {
              name: 'Another Agent',
              personality: 'explorer',
              riskTolerance: 0.2,
              socialOrientation: 0.7,
              resourcePriority: 'food',
            },
          ]),
          promptTokens: 100,
          responseTokens: 100,
          latencyMs: 500,
        };
      },
    };

    const config = createMockConfig({
      childrenPerMother: 2,
      diversityThreshold: 0.1,
      requiredArchetypes: [],
    });

    const result = await generateChildren('claude', config, mockInvoker);

    expect(callCount).toBe(2);
    expect(result.children.length).toBe(2);
    expect(result.metadata.retryCount).toBe(1);
  });
});
