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
    displayName: 'DeepSeek Reasoner',
    envVar: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    costInfo: '$0.55/1M input, $2.19/1M output',
  },
  {
    type: 'qwen',
    displayName: 'Qwen 3.5 Plus (Alibaba)',
    envVar: 'QWEN_API_KEY',
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey',
    costInfo: 'Plus: $0.40/1M input, $2.40/1M output',
  },
  {
    type: 'glm',
    displayName: 'GLM-5 (Zhipu)',
    envVar: 'GLM_API_KEY',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    costInfo: '$1/1M input, $3.20/1M output',
  },
  {
    type: 'grok',
    displayName: 'Grok 4.1 Fast (xAI)',
    envVar: 'GROK_API_KEY',
    docsUrl: 'https://console.x.ai',
    costInfo: '$0.20/1M input, $0.50/1M output',
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
