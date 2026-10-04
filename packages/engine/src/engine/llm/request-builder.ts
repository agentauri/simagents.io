import { defaultCapabilities, defaultConnection, getProviderCatalogEntry, type ConnectionProfile, type ModelCapabilities, type LLMType, type ReasoningLevel, type TextProtocol } from '@simagents/shared';
import { buildProtocolRequest } from './protocol-adapters';
export interface ProviderPrompt { system: string; user: string }
export interface ProviderRequestOptions {
  provider: LLMType; modelId: string; reasoningLevel?: ReasoningLevel; apiKey: string;
  prompt: ProviderPrompt; maxTokens: number; temperature?: number; proxyUrl?: string;
  relayAccessToken?: string;
  connection?: ConnectionProfile; capabilities?: ModelCapabilities;
}
export interface ProviderRequest { url: string; headers: Record<string, string>; body: Record<string, unknown>; protocol?: TextProtocol }
export type ProviderUnavailableReason = 'no-key' | 'needs-proxy';
export class ProviderUnavailableError extends Error {
  constructor(readonly provider: LLMType, readonly reason: ProviderUnavailableReason) { super(`Provider ${provider} unavailable: ${reason}`); }
}
export function buildProviderRequest(opts: ProviderRequestOptions): ProviderRequest {
  if (!opts.apiKey.trim()) throw new ProviderUnavailableError(opts.provider, 'no-key');
  let connection = opts.connection;
  if (!connection) {
    connection = defaultConnection(opts.provider, opts.proxyUrl);
    // Preserve pre-profile OpenAI saves; new OpenAI profiles default to Responses.
    if (opts.provider === 'codex') connection = { ...connection, protocol: 'chat-completions', endpoint: getProviderCatalogEntry('codex')!.endpoint };
    if (connection.transport === 'user-relay' && !connection.relayUrl) throw new ProviderUnavailableError(opts.provider, 'needs-proxy');
  }
  return buildProtocolRequest({ ...opts, connection, capabilities: opts.capabilities ?? defaultCapabilities(connection.providerId, opts.modelId, connection.protocol) });
}
export function isReasoningEnabled(level: ReasoningLevel | undefined): boolean {
  return level !== undefined && level !== false && level !== 0 && !['', 'none', 'false', 'disabled'].includes(String(level).trim().toLowerCase());
}
