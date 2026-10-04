/** Local opt-in diagnostics. No URLs or authentication headers are accepted. */
export const MAX_TRACE_TEXT_CHARS = 16_384;
export const MAX_SESSION_TRACES = 100;
export interface RequestTrace {
  requestId: string;
  sessionId?: string;
  worldSeed?: string;
  agentId: string;
  tick: number;
  protocol: string;
  requestedModel: string;
  connectionId?: string;
  startedAt: number;
  durationMs: number;
  status?: number;
  outcome: 'success' | 'failed' | 'aborted';
  errorCode?: string;
  requestBody: string;
  responseBody?: string;
  truncated: boolean;
  redacted: boolean;
}
export function sanitizeRequestTrace(trace: RequestTrace, secrets: string[]): RequestTrace {
  let redacted = false;
  const variants = [...new Set(secrets.filter(Boolean).flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)]))].sort((a, b) => b.length - a.length);
  const clean = (value: string) => {
    for (const secret of variants) if (value.includes(secret)) { value = value.split(secret).join('[REDACTED]'); redacted = true; }
    return value;
  };
  const result = Object.fromEntries(Object.entries(trace).map(([key, value]) => [key, typeof value === 'string' ? clean(value) : value])) as unknown as RequestTrace;
  result.truncated = trace.truncated || result.requestBody.length > MAX_TRACE_TEXT_CHARS || (result.responseBody?.length ?? 0) > MAX_TRACE_TEXT_CHARS;
  result.requestBody = result.requestBody.slice(0, MAX_TRACE_TEXT_CHARS);
  result.responseBody = result.responseBody?.slice(0, MAX_TRACE_TEXT_CHARS);
  result.redacted = redacted;
  return result;
}
