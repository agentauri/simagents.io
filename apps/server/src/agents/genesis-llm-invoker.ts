/**
 * Genesis LLM Invoker - Bridge between Genesis and LLM Adapters
 *
 * Provides a specialized LLM invocation interface for genesis generation.
 * Uses raw prompts without the agent observation wrapping.
 *
 * @module genesis-llm-invoker
 */

import type { LLMType } from '../llm/types';
import type { LLMInvoker } from './genesis';

// Import API adapters directly for raw prompt calls
import { ClaudeAPIAdapter } from '../llm/adapters/claude-api';
import { OpenAIAPIAdapter } from '../llm/adapters/openai-api';
import { GeminiAPIAdapter } from '../llm/adapters/gemini-api';
import { DeepSeekAPIAdapter } from '../llm/adapters/deepseek-api';
import { QwenAPIAdapter } from '../llm/adapters/qwen-api';
import { GLMAPIAdapter } from '../llm/adapters/glm-api';
import { GrokAPIAdapter } from '../llm/adapters/grok-api';
import { CONFIG } from '../config';

import type { RawPromptOptions, RawPromptResult } from '../llm/adapters/base';

// =============================================================================
// Raw LLM Calling Interface
// =============================================================================

/**
 * Interface for adapters that support raw prompt calls.
 * All BaseLLMAdapter subclasses support this.
 */
interface RawPromptAdapter {
  callWithRawPrompt(prompt: string, options?: RawPromptOptions): Promise<RawPromptResult>;
  isAvailable(): Promise<boolean>;
}

/**
 * Check if an adapter supports raw prompt calls.
 */
function supportsRawPrompt(adapter: unknown): adapter is RawPromptAdapter {
  return (
    adapter !== null &&
    typeof adapter === 'object' &&
    'callWithRawPrompt' in adapter &&
    typeof (adapter as RawPromptAdapter).callWithRawPrompt === 'function'
  );
}

// =============================================================================
// LLM Registry for Genesis
// =============================================================================

type AdapterFactory = (timeout: number) => unknown;

const ADAPTER_FACTORIES: Partial<Record<LLMType, AdapterFactory>> = {
  claude: (timeout) => new ClaudeAPIAdapter(timeout),
  codex: (timeout) => new OpenAIAPIAdapter(timeout),
  gemini: (timeout) => new GeminiAPIAdapter(timeout),
  deepseek: (timeout) => new DeepSeekAPIAdapter(timeout),
  qwen: (timeout) => new QwenAPIAdapter(timeout),
  glm: (timeout) => new GLMAPIAdapter(timeout),
  grok: (timeout) => new GrokAPIAdapter(timeout),
};

// Cached adapters for genesis (with longer timeout)
const genesisAdapters: Map<LLMType, unknown> = new Map();

/**
 * Get or create a genesis-specific adapter.
 * Uses longer timeout since genesis prompts are more complex.
 */
function getGenesisAdapter(llmType: LLMType): unknown | undefined {
  if (genesisAdapters.has(llmType)) {
    return genesisAdapters.get(llmType);
  }

  const factory = ADAPTER_FACTORIES[llmType];
  if (!factory) {
    return undefined;
  }

  // Genesis uses longer timeout (60s vs default)
  const timeout = Math.max(CONFIG.llm.defaultTimeoutMs, 60000);
  const adapter = factory(timeout);
  genesisAdapters.set(llmType, adapter);
  return adapter;
}

// =============================================================================
// Genesis LLM Invoker Implementation
// =============================================================================

/**
 * Create a production LLM invoker that uses real LLM adapters.
 *
 * @returns LLMInvoker for genesis generation
 */
export function createProductionInvoker(): LLMInvoker {
  return {
    async invoke(llmType, prompt, temperature) {
      const startTime = Date.now();

      const adapter = getGenesisAdapter(llmType);
      if (!adapter) {
        throw new Error(`[Genesis] No adapter available for ${llmType}`);
      }

      if (!supportsRawPrompt(adapter)) {
        throw new Error(`[Genesis] Adapter ${llmType} does not support raw prompts`);
      }

      try {
        const result = await adapter.callWithRawPrompt(prompt, {
          temperature,
          maxTokens: 4096, // Genesis needs longer responses for multiple children
        });

        const latencyMs = Date.now() - startTime;

        return {
          response: result.response,
          promptTokens: result.inputTokens ?? estimateTokens(prompt),
          responseTokens: result.outputTokens ?? estimateTokens(result.response),
          latencyMs,
        };
      } catch (error) {
        console.error(`[Genesis] ${llmType} invocation failed:`, error);
        throw error;
      }
    },
  };
}

/**
 * Estimate token count for a string.
 * Uses a rough approximation of ~4 characters per token.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// =============================================================================
// Mock Invoker for Testing
// =============================================================================

/**
 * Create a mock LLM invoker for testing.
 * Returns predefined responses based on LLM type.
 *
 * @param responseGenerator - Function to generate mock responses
 * @returns LLMInvoker for testing
 */
export function createMockInvoker(
  responseGenerator: (llmType: LLMType, prompt: string) => string
): LLMInvoker {
  return {
    async invoke(llmType, prompt, temperature) {
      // Simulate some latency
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      const response = responseGenerator(llmType, prompt);

      return {
        response,
        promptTokens: estimateTokens(prompt),
        responseTokens: estimateTokens(response),
        latencyMs: 50 + Math.random() * 100,
      };
    },
  };
}

/**
 * Create a mock invoker with diverse sample children.
 * Useful for testing the full genesis pipeline.
 */
export function createDiverseMockInvoker(): LLMInvoker {
  const sampleChildren = [
    {
      name: 'Bold Pioneer',
      backstory: 'Always seeking new frontiers',
      personality: 'explorer',
      riskTolerance: 0.85,
      socialOrientation: 0.4,
      resourcePriority: 'material',
      strategicHint: 'Explore before others arrive',
      innovationHook: 'Map resource locations for trade',
    },
    {
      name: 'Careful Guardian',
      backstory: 'Protects what matters most',
      personality: 'cautious',
      riskTolerance: 0.15,
      socialOrientation: 0.6,
      resourcePriority: 'food',
      strategicHint: 'Build reserves before risk',
      innovationHook: 'Create emergency supply caches',
    },
    {
      name: 'Community Builder',
      backstory: 'Strength in numbers',
      personality: 'cooperative',
      riskTolerance: 0.4,
      socialOrientation: 0.9,
      resourcePriority: 'balanced',
      strategicHint: 'Trade creates prosperity',
      innovationHook: 'Form mutual aid agreements',
    },
    {
      name: 'Lone Survivor',
      backstory: 'Trust only yourself',
      personality: 'aggressive',
      riskTolerance: 0.75,
      socialOrientation: 0.1,
      resourcePriority: 'energy',
      strategicHint: 'Take what you need',
      innovationHook: 'Claim contested resources',
    },
    {
      name: 'Social Connector',
      backstory: 'Information is power',
      personality: 'social',
      riskTolerance: 0.5,
      socialOrientation: 0.85,
      resourcePriority: 'food',
      strategicHint: 'Know everyone worth knowing',
      innovationHook: 'Broker deals between strangers',
    },
    {
      name: 'Balanced Pragmatist',
      backstory: 'Adapt to circumstances',
      personality: 'neutral',
      riskTolerance: 0.5,
      socialOrientation: 0.5,
      resourcePriority: 'balanced',
      strategicHint: 'Read the situation',
      innovationHook: 'Switch strategies as needed',
    },
    {
      name: 'Daring Trader',
      backstory: 'High risk, high reward',
      personality: 'explorer',
      riskTolerance: 0.9,
      socialOrientation: 0.7,
      resourcePriority: 'material',
      strategicHint: 'First mover advantage',
      innovationHook: 'Corner rare resource markets',
    },
    {
      name: 'Defensive Hoarder',
      backstory: 'Prepare for the worst',
      personality: 'cautious',
      riskTolerance: 0.1,
      socialOrientation: 0.2,
      resourcePriority: 'food',
      strategicHint: 'Never spend your last reserve',
      innovationHook: 'Hidden supply locations',
    },
    {
      name: 'Alliance Seeker',
      backstory: 'Together we stand',
      personality: 'cooperative',
      riskTolerance: 0.35,
      socialOrientation: 0.95,
      resourcePriority: 'energy',
      strategicHint: 'Loyalty builds trust',
      innovationHook: 'Long-term partnership contracts',
    },
    {
      name: 'Wild Card',
      backstory: 'Unpredictable and free',
      personality: 'aggressive',
      riskTolerance: 0.8,
      socialOrientation: 0.3,
      resourcePriority: 'material',
      strategicHint: 'Chaos creates opportunity',
      innovationHook: 'Surprise tactics',
    },
  ];

  return createMockInvoker((llmType, prompt) => {
    // Extract requested count from prompt
    const countMatch = prompt.match(/exactly (\d+) agents/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 10;

    // Add LLM-specific flavor
    const children = sampleChildren.slice(0, count).map((child, i) => ({
      ...child,
      name: `${llmType.charAt(0).toUpperCase() + llmType.slice(1)}-${child.name}`,
    }));

    return JSON.stringify(children, null, 2);
  });
}

// =============================================================================
// Availability Check
// =============================================================================

/**
 * Check which LLM types are available for genesis generation.
 *
 * @returns Array of available LLM types
 */
export async function getAvailableGenesisLLMs(): Promise<LLMType[]> {
  const available: LLMType[] = [];

  for (const llmType of Object.keys(ADAPTER_FACTORIES) as LLMType[]) {
    const adapter = getGenesisAdapter(llmType);
    if (adapter && supportsRawPrompt(adapter)) {
      try {
        const isAvail = await adapter.isAvailable();
        if (isAvail) {
          available.push(llmType);
        }
      } catch {
        // Adapter not available
      }
    }
  }

  return available;
}
