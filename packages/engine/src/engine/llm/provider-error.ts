export type ProviderErrorCode = 'credentials' | 'quota' | 'rate-limit' | 'unavailable' | 'incompatible' | 'network';
const instructions: Record<ProviderErrorCode, string> = {
  credentials: 'Check the API key and its access to the selected model.',
  quota: 'Check credit and spending limits in the provider account.',
  'rate-limit': 'The provider rate limit was reached. Wait before resuming explicitly.',
  unavailable: 'The provider or model is unavailable. Check the selected model and endpoint.',
  incompatible: 'The response or request format is incompatible. Check model parameters and the output token limit.',
  network: 'The request outcome is unknown. Check the network and relay before resuming explicitly.',
};
export class ProviderRequestError extends Error {
  constructor(readonly code: ProviderErrorCode, readonly provider: string, readonly status?: number) {
    super(`${provider}: ${instructions[code]} No automatic retry was made.`);
  }
}
export function classifyProviderStatus(status: number, payload?: unknown): ProviderErrorCode {
  const error = (payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : undefined);
  const detail = error && typeof error === 'object' ? error as { code?: unknown; type?: unknown } : {};
  if (status === 402 || ['insufficient_quota', 'quota_exceeded', 'billing_hard_limit_reached'].includes(String(detail.code ?? detail.type ?? ''))) return 'quota';
  if (status === 401 || status === 403) return 'credentials';
  if (status === 429) return 'rate-limit';
  if (status === 404 || status >= 500) return 'unavailable';
  return 'incompatible';
}
export async function boundedProviderJson(response: Response, maxBytes = 1024 * 1024, captureText?: (text: string) => void): Promise<unknown> {
  const size = response.headers.get('content-length');
  if (size && Number(size) > maxBytes) { await response.body?.cancel(); throw new Error('Provider response exceeds size limit'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty provider response');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('Provider response exceeds size limit'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  captureText?.(text);
  return JSON.parse(text);
}
export function isTruncatedResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as { status?: unknown; stop_reason?: unknown; choices?: Array<{ finish_reason?: unknown }>; candidates?: Array<{ finishReason?: unknown }> };
  return data.status === 'incomplete' || data.stop_reason === 'max_tokens' ||
    (Array.isArray(data.choices) && data.choices.some((choice) => choice?.finish_reason === 'length')) ||
    (Array.isArray(data.candidates) && data.candidates.some((candidate) => candidate?.finishReason === 'MAX_TOKENS'));
}
