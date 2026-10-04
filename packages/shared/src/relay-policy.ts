import type { AppIssue } from './errors';
import type { TextProtocol } from './connections';
/** Explicit deployment-reviewed destinations, independent of editable client profiles. */
export const RELAY_DESTINATIONS: ReadonlyArray<{ providerId: string; protocol: TextProtocol; endpoint: string }> = [
  { providerId: 'codex', protocol: 'openai-responses', endpoint: 'https://api.openai.com/v1/responses' },
  { providerId: 'codex', protocol: 'chat-completions', endpoint: 'https://api.openai.com/v1/chat/completions' },
  { providerId: 'claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages' },
  { providerId: 'gemini', protocol: 'gemini-generate-content', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models' },
  { providerId: 'deepseek', protocol: 'chat-completions', endpoint: 'https://api.deepseek.com/v1/chat/completions' },
  { providerId: 'qwen', protocol: 'chat-completions', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { providerId: 'qwen', protocol: 'chat-completions', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
  { providerId: 'glm', protocol: 'chat-completions', endpoint: 'https://api.z.ai/api/paas/v4/chat/completions' },
  { providerId: 'glm', protocol: 'chat-completions', endpoint: 'https://api.z.ai/api/coding/paas/v4/chat/completions' },
  { providerId: 'grok', protocol: 'chat-completions', endpoint: 'https://api.x.ai/v1/chat/completions' },
  { providerId: 'mistral', protocol: 'chat-completions', endpoint: 'https://api.mistral.ai/v1/chat/completions' },
  { providerId: 'minimax', protocol: 'chat-completions', endpoint: 'https://api.minimax.io/v1/chat/completions' },
  { providerId: 'kimi', protocol: 'chat-completions', endpoint: 'https://api.moonshot.ai/v1/chat/completions' },
  { providerId: 'openrouter', protocol: 'chat-completions', endpoint: 'https://openrouter.ai/api/v1/chat/completions' },
];
export function approvedRelayDestination(providerId: string, protocol: TextProtocol, endpoint: string) {
  // Match the exact reviewed string. Never forward a caller-supplied URL after normalization.
  return RELAY_DESTINATIONS.find((destination) => destination.providerId === providerId && destination.protocol === protocol && destination.endpoint === endpoint);
}
export function relayModelsEndpoint(endpoint: string, protocol: TextProtocol): string {
  if (protocol === 'gemini-generate-content') return endpoint;
  const suffix = protocol === 'openai-responses' ? '/responses' : protocol === 'anthropic-messages' ? '/messages' : '/chat/completions';
  if (!endpoint.endsWith(suffix)) throw new Error('Model listing is unavailable for this path');
  return endpoint.slice(0, -suffix.length) + '/models';
}

export function relayErrorMessage(code: string | null): string {
  switch (code) {
    case 'access-denied': return 'Relay access is invalid or expired. Renew access, then resume explicitly. No inference was retried.';
    case 'rate-limit': return 'Official relay rate limit reached. Wait before resuming explicitly; no retry was made.';
    case 'size-limit': return 'Official relay payload limit exceeded (256 KiB request / 1 MiB response). Shorten the prompt or lower the output limit.';
    case 'timeout': return 'Official relay request timed out; its outcome may be unknown. No automatic retry was made.';
    case 'request-not-approved': return 'The official relay does not approve this endpoint or request format. Check the preset, or use direct access or your own relay.';
    default: return 'Official relay is unavailable or rejected the request. Check the relay configuration before resuming; no retry was made.';
  }
}

export function relayErrorIssue(code: string | null): AppIssue {
  switch (code) {
    case 'access-denied': return { code: 'RELAY_ACCESS' };
    case 'rate-limit': return { code: 'RELAY_RATE_LIMIT' };
    case 'size-limit': return { code: 'RELAY_SIZE_LIMIT' };
    case 'timeout': return { code: 'RELAY_TIMEOUT' };
    case 'request-not-approved': return { code: 'RELAY_REQUEST_REJECTED' };
    default: return { code: 'RELAY_UNAVAILABLE' };
  }
}
