import type { LLMType } from './types';

export type AuthStyle = 'bearer' | 'x-api-key' | 'google-key';
export type CorsMode = 'direct' | 'proxy';

export type ReasoningCapability =
  | { kind: 'none' }
  | { kind: 'effort'; levels: string[]; default?: string }
  | { kind: 'budget'; min: number; max: number; default: number }
  | { kind: 'toggle' }
  | { kind: 'model-swap'; reasoningModelId: string };

export interface ModelCatalogEntry {
  id: string;
  label: string;
  reasoning: ReasoningCapability;
}

export interface ProviderCatalogEntry {
  id: LLMType;
  displayName: string;
  endpoint: string;
  authStyle: AuthStyle;
  cors: CorsMode;
  docsUrl: string;
  models: ModelCatalogEntry[];
  defaultModelId: string;
}

export type BaselineLLMType =
  | 'baseline_random'
  | 'baseline_rule'
  | 'baseline_sugarscape'
  | 'baseline_qlearning';

export type AgentRosterProvider = LLMType | BaselineLLMType;
export type ReasoningLevel = string | number | boolean;

export interface AgentRosterEntry {
  name: string;
  provider: AgentRosterProvider;
  modelId: string;
  reasoningLevel?: ReasoningLevel;
  color: string;
  personality?: string | null;
}

const anthropicThinkingBudget: ReasoningCapability = {
  kind: 'budget',
  min: 1024,
  max: 64000,
  default: 4096,
};

const openAIEffort: ReasoningCapability = {
  kind: 'effort',
  levels: ['none', 'low', 'medium', 'high', 'xhigh'],
  default: 'medium',
};

const geminiThinkingBudget: ReasoningCapability = {
  kind: 'budget',
  min: 0,
  max: 24576,
  default: 4096,
};

const grokEffort: ReasoningCapability = {
  kind: 'effort',
  levels: ['none', 'low', 'medium', 'high'],
  default: 'low',
};

export const LLM_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'claude',
    displayName: 'Claude (Anthropic)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authStyle: 'x-api-key',
    cors: 'direct',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    defaultModelId: 'claude-sonnet-5',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', reasoning: anthropicThinkingBudget },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', reasoning: anthropicThinkingBudget },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', reasoning: anthropicThinkingBudget },
      { id: 'claude-fable-5', label: 'Claude Fable 5', reasoning: anthropicThinkingBudget },
    ],
  },
  {
    id: 'codex',
    displayName: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultModelId: 'gpt-5.4',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5', reasoning: openAIEffort },
      { id: 'gpt-5.4', label: 'GPT-5.4', reasoning: openAIEffort },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', reasoning: openAIEffort },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', reasoning: openAIEffort },
    ],
  },
  {
    id: 'gemini',
    displayName: 'Gemini (Google)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    authStyle: 'google-key',
    cors: 'direct',
    docsUrl: 'https://aistudio.google.com/apikey',
    defaultModelId: 'gemini-3.5-flash',
    models: [
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', reasoning: geminiThinkingBudget },
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', reasoning: geminiThinkingBudget },
      { id: 'gemini-3-flash', label: 'Gemini 3 Flash', reasoning: geminiThinkingBudget },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', reasoning: geminiThinkingBudget },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', reasoning: geminiThinkingBudget },
    ],
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    defaultModelId: 'deepseek-chat',
    models: [
      {
        id: 'deepseek-chat',
        label: 'DeepSeek Chat',
        reasoning: { kind: 'model-swap', reasoningModelId: 'deepseek-reasoner' },
      },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', reasoning: { kind: 'none' } },
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        reasoning: { kind: 'model-swap', reasoningModelId: 'deepseek-reasoner' },
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        reasoning: { kind: 'model-swap', reasoningModelId: 'deepseek-reasoner' },
      },
    ],
  },
  {
    id: 'qwen',
    displayName: 'Qwen (Alibaba Cloud)',
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey',
    defaultModelId: 'qwen3.7-max',
    models: [
      { id: 'qwen3.7-max', label: 'Qwen3.7 Max', reasoning: { kind: 'toggle' } },
      { id: 'qwen3.7-plus', label: 'Qwen3.7 Plus', reasoning: { kind: 'toggle' } },
      { id: 'qwen3.6-flash', label: 'Qwen3.6 Flash', reasoning: { kind: 'toggle' } },
      { id: 'qwen3-max', label: 'Qwen3 Max', reasoning: { kind: 'toggle' } },
      { id: 'qwen-plus', label: 'Qwen Plus', reasoning: { kind: 'toggle' } },
    ],
  },
  {
    id: 'glm',
    displayName: 'GLM (Z.ai)',
    endpoint: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    defaultModelId: 'glm-5.1',
    models: [
      { id: 'glm-5.1', label: 'GLM-5.1', reasoning: { kind: 'toggle' } },
      { id: 'glm-5', label: 'GLM-5', reasoning: { kind: 'toggle' } },
      { id: 'glm-4.7', label: 'GLM-4.7', reasoning: { kind: 'toggle' } },
    ],
  },
  {
    id: 'grok',
    displayName: 'Grok (xAI)',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://console.x.ai',
    defaultModelId: 'grok-4.3',
    models: [
      { id: 'grok-4.3', label: 'Grok 4.3', reasoning: grokEffort },
      { id: 'grok-4.20', label: 'Grok 4.20', reasoning: grokEffort },
      { id: 'grok-4.1-fast', label: 'Grok 4.1 Fast', reasoning: grokEffort },
      { id: 'grok-build-0.1', label: 'Grok Build 0.1', reasoning: { kind: 'none' } },
    ],
  },
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://console.mistral.ai/api-keys',
    defaultModelId: 'mistral-large-latest',
    models: [
      {
        id: 'mistral-large-latest',
        label: 'Mistral Large',
        reasoning: { kind: 'model-swap', reasoningModelId: 'magistral-medium-latest' },
      },
      {
        id: 'mistral-medium-2604',
        label: 'Mistral Medium 3.5',
        reasoning: { kind: 'model-swap', reasoningModelId: 'magistral-medium-2509' },
      },
      {
        id: 'mistral-small-2603',
        label: 'Mistral Small 4',
        reasoning: { kind: 'model-swap', reasoningModelId: 'magistral-small-2509' },
      },
      { id: 'magistral-medium-latest', label: 'Magistral Medium', reasoning: { kind: 'none' } },
    ],
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    endpoint: 'https://api.minimax.io/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.minimax.io',
    defaultModelId: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7', label: 'MiniMax M2.7', reasoning: { kind: 'none' } },
      { id: 'MiniMax-M2.5', label: 'MiniMax M2.5', reasoning: { kind: 'none' } },
      { id: 'MiniMax-M2.1', label: 'MiniMax M2.1', reasoning: { kind: 'none' } },
    ],
  },
  {
    id: 'kimi',
    displayName: 'Kimi (Moonshot AI)',
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    authStyle: 'bearer',
    cors: 'proxy',
    docsUrl: 'https://platform.moonshot.ai',
    defaultModelId: 'kimi-k2.6',
    models: [
      { id: 'kimi-k2.6', label: 'Kimi K2.6', reasoning: { kind: 'toggle' } },
      { id: 'kimi-k2.5', label: 'Kimi K2.5', reasoning: { kind: 'toggle' } },
      { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking', reasoning: { kind: 'none' } },
      { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', reasoning: { kind: 'none' } },
    ],
  },
];

export const LLM_PROVIDER_IDS = LLM_CATALOG.map((entry) => entry.id);

export const BASELINE_PROVIDER_IDS: BaselineLLMType[] = [
  'baseline_random',
  'baseline_rule',
  'baseline_sugarscape',
  'baseline_qlearning',
];

export const DEFAULT_AGENT_ROSTER: AgentRosterEntry[] = [
  {
    name: 'Random-1',
    provider: 'baseline_random',
    modelId: 'baseline_random',
    color: '#9ca3af',
  },
  {
    name: 'Rule-1',
    provider: 'baseline_rule',
    modelId: 'baseline_rule',
    color: '#6b7280',
  },
  {
    name: 'Sugar-1',
    provider: 'baseline_sugarscape',
    modelId: 'baseline_sugarscape',
    color: '#4b5563',
  },
];

export function isLLMProviderId(value: string): value is LLMType {
  return LLM_PROVIDER_IDS.includes(value as LLMType);
}

export function isBaselineProviderId(value: string): value is BaselineLLMType {
  return BASELINE_PROVIDER_IDS.includes(value as BaselineLLMType);
}

export function isRosterProvider(value: string): value is AgentRosterProvider {
  return isLLMProviderId(value) || isBaselineProviderId(value);
}

export function getProviderCatalogEntry(provider: LLMType): ProviderCatalogEntry | undefined {
  return LLM_CATALOG.find((entry) => entry.id === provider);
}

export function getModelCatalogEntry(
  provider: LLMType,
  modelId: string
): ModelCatalogEntry | undefined {
  return getProviderCatalogEntry(provider)?.models.find((model) => model.id === modelId);
}

export function getDefaultModelId(provider: LLMType): string {
  return getProviderCatalogEntry(provider)?.defaultModelId ?? provider;
}
