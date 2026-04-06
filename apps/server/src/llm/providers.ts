/**
 * LLM Provider Definitions
 *
 * Central registry of all supported LLM providers with their metadata.
 * Used by the key management system to display provider info and validate keys.
 */

import type { LLMType } from './types';

export interface LLMProviderInfo {
  type: LLMType;
  displayName: string;
  envVar: string;
  docsUrl: string;
  costInfo: string;
}

/**
 * All supported LLM providers.
 * Order determines display order in the UI.
 */
export const LLM_PROVIDERS: LLMProviderInfo[] = [
  {
    type: 'claude',
    displayName: 'Claude Opus 4.6 (Anthropic)',
    envVar: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    costInfo: 'Opus 4.6: $5/1M input, $25/1M output',
  },
  {
    type: 'codex',
    displayName: 'GPT-5.4 (OpenAI)',
    envVar: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    costInfo: '$2.50/1M input, $15/1M output',
  },
  {
    type: 'gemini',
    displayName: 'Gemini 3.1 Pro (Google)',
    envVar: 'GOOGLE_AI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    costInfo: 'Pro: $2/1M input, $12/1M output',
  },
  {
    type: 'deepseek',
    displayName: 'DeepSeek V3',
    envVar: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    costInfo: '$0.27/1M input, $1.10/1M output',
  },
  {
    type: 'qwen',
    displayName: 'Qwen 3.5 Max (Alibaba)',
    envVar: 'QWEN_API_KEY',
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey',
    costInfo: 'Max: $0.80/1M input, $3.20/1M output',
  },
  {
    type: 'glm',
    displayName: 'GLM-5.1 (Zhipu)',
    envVar: 'GLM_API_KEY',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    costInfo: '$1/1M input, $3.20/1M output',
  },
  {
    type: 'grok',
    displayName: 'Grok 4.20 Reasoning (xAI)',
    envVar: 'GROK_API_KEY',
    docsUrl: 'https://console.x.ai',
    costInfo: '$2/1M input, $10/1M output',
  },
  {
    type: 'mistral',
    displayName: 'Mistral Large (Mistral AI)',
    envVar: 'MISTRAL_API_KEY',
    docsUrl: 'https://console.mistral.ai/api-keys',
    costInfo: '$2/1M input, $6/1M output',
  },
  {
    type: 'minimax',
    displayName: 'MiniMax M2.7',
    envVar: 'MINIMAX_API_KEY',
    docsUrl: 'https://platform.minimax.io',
    costInfo: '$0.30/1M input, $1.20/1M output',
  },
  {
    type: 'kimi',
    displayName: 'Kimi K2.5 (Moonshot AI)',
    envVar: 'MOONSHOT_API_KEY',
    docsUrl: 'https://platform.moonshot.ai',
    costInfo: '$0.60/1M input, $2.50/1M output',
  },
];

/**
 * Get provider info by type
 */
export function getProviderInfo(type: LLMType): LLMProviderInfo | undefined {
  return LLM_PROVIDERS.find((p) => p.type === type);
}

/**
 * Get all provider types
 */
export function getAllProviderTypes(): LLMType[] {
  return LLM_PROVIDERS.map((p) => p.type);
}
