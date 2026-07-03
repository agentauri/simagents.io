import type { LLMType } from '@simagents/shared';

export interface ExtractedLLMResponse {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  thinkingText?: string;
}

export function extractProviderResponse(
  provider: LLMType,
  json: unknown
): ExtractedLLMResponse {
  switch (provider) {
    case 'claude':
      return extractAnthropic(json);
    case 'gemini':
      return extractGemini(json);
    case 'codex':
    case 'deepseek':
    case 'qwen':
    case 'glm':
    case 'grok':
    case 'mistral':
    case 'minimax':
    case 'kimi':
      return extractOpenAICompatible(json);
    default:
      return unreachable(provider);
  }
}

function extractAnthropic(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const content = Array.isArray(data.content) ? data.content : [];
  const text: string[] = [];
  const thinking: string[] = [];

  for (const block of content) {
    const item = asRecord(block);
    if (item.type === 'text' && typeof item.text === 'string') {
      text.push(item.text);
    } else if (item.type === 'thinking' && typeof item.thinking === 'string') {
      thinking.push(item.thinking);
    }
  }

  const usage = asRecord(data.usage);
  return {
    text: text.join('\n'),
    usage: tokenUsage(usage.input_tokens, usage.output_tokens),
    thinkingText: thinking.length > 0 ? thinking.join('\n') : undefined,
  };
}

function extractOpenAICompatible(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = asRecord(choices[0]);
  const message = asRecord(first.message);
  const usage = asRecord(data.usage);

  return {
    text: messageContentToText(message.content),
    usage: tokenUsage(usage.prompt_tokens, usage.completion_tokens),
    thinkingText:
      typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined,
  };
}

function extractGemini(json: unknown): ExtractedLLMResponse {
  const data = asRecord(json);
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const usage = asRecord(data.usageMetadata);

  return {
    text: parts
      .map((part) => asRecord(part).text)
      .filter((text): text is string => typeof text === 'string')
      .join('\n'),
    usage: tokenUsage(
      usage.promptTokenCount,
      usage.candidatesTokenCount ?? usage.outputTokenCount
    ),
  };
}

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const item = asRecord(part);
      if (typeof item.text === 'string') return item.text;
      if (typeof item.content === 'string') return item.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function tokenUsage(input: unknown, output: unknown): ExtractedLLMResponse['usage'] | undefined {
  const inputTokens = typeof input === 'number' ? input : undefined;
  const outputTokens = typeof output === 'number' ? output : undefined;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return { inputTokens, outputTokens };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function unreachable(value: never): never {
  throw new Error(`Unhandled response extraction case: ${String(value)}`);
}
