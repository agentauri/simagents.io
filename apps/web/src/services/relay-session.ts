/** Short-lived relay authorization. No browser storage, provider keys or inference retries. */
export type RelaySessionStatus = 'idle' | 'checking' | 'ready' | 'interaction-required' | 'failed' | 'expired';
export type RelaySessionFailure = 'not-configured' | 'proof-unavailable' | 'access-denied' | 'rate-limit' | 'unavailable' | 'invalid-response' | 'cancelled';
export interface RelaySessionState { status: RelaySessionStatus; renewing: boolean; expiresAt?: number; warmUntil?: number; failure?: RelaySessionFailure }
export interface RelaySessionOptions {
  admissionUrl: string;
  readinessUrl?: string;
  obtainProof: (interact: () => void, signal: AbortSignal) => Promise<string>;
  onSuspend: () => Promise<void>;
  onToken: (token: string) => Promise<void>;
  transport?: typeof fetch;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  unschedule?: (timer: ReturnType<typeof setTimeout>) => void;
}
class RelaySessionError extends Error { constructor(readonly code: RelaySessionFailure) { super(code); } }
export class RelaySession {
  private token?: string;
  private state: RelaySessionState = { status: 'idle', renewing: false };
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private renewing?: Promise<void>;
  private renewTimer?: ReturnType<typeof setTimeout>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private suspend: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly schedule: NonNullable<RelaySessionOptions['schedule']>;
  private readonly unschedule: NonNullable<RelaySessionOptions['unschedule']>;
  constructor(private readonly options: RelaySessionOptions) {
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? setTimeout;
    this.unschedule = options.unschedule ?? clearTimeout;
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  getToken(): string | undefined {
    return this.token && !this.state.warmUntil && (this.state.expiresAt ?? 0) * 1000 > this.now() && ['ready', 'checking'].includes(this.state.status) ? this.token : undefined;
  }
  /** An explicit new admission after expiry is distinct from an authenticated renewal. */
  start(): Promise<void> {
    if (this.renewing) return this.renewing;
    if (this.token && (this.state.expiresAt ?? 0) * 1000 > this.now()) return this.renew();
    this.token = undefined;
    return this.run(false);
  }
  renew(): Promise<void> {
    if (this.renewing) return this.renewing;
    if (!this.token || (this.state.expiresAt ?? 0) * 1000 <= this.now()) { this.expire(); return Promise.resolve(); }
    return this.run(true);
  }
  cancel(): void { this.controller?.abort(); }
  clear(): void {
    this.controller?.abort(); this.controller = undefined;
    this.clearTimers(); this.token = undefined;
    this.publish({ status: 'idle', renewing: false });
  }
  private publish(state: RelaySessionState) { this.state = state; for (const listener of this.listeners) listener(); }
  private clearTimers() {
    if (this.renewTimer !== undefined) this.unschedule(this.renewTimer);
    if (this.expiryTimer !== undefined) this.unschedule(this.expiryTimer);
    this.renewTimer = undefined; this.expiryTimer = undefined;
  }
  private suspendRequests() {
    // Suspension starts before waiting for user interaction, and is never followed by resume here.
    this.suspend = this.options.onSuspend();
    void this.suspend.catch(() => undefined);
  }
  private expire() {
    this.controller?.abort(); this.clearTimers(); this.token = undefined;
    this.publish({ status: 'expired', renewing: false }); this.suspendRequests();
  }
  private run(renewing: boolean): Promise<void> {
    const controller = new AbortController(); this.controller = controller;
    const operation = this.admit(controller, renewing);
    this.renewing = operation;
    void operation.finally(() => { if (this.renewing === operation) this.renewing = undefined; });
    return operation;
  }
  private async admit(controller: AbortController, renewing: boolean) {
    const previousToken = renewing ? this.token : undefined;
    this.publish({ status: 'checking', renewing, expiresAt: this.state.expiresAt });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const url = new URL(this.options.admissionUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/session') throw new RelaySessionError('not-configured');
      if (this.options.readinessUrl) await this.waitForReadiness(controller);
      const proof = await abortable(this.options.obtainProof(() => {
        if (controller.signal.aborted || this.controller !== controller) return;
        this.publish({ ...this.state, status: 'interaction-required' }); this.suspendRequests();
      }, controller.signal), controller.signal);
      if (controller.signal.aborted) throw new RelaySessionError('cancelled');
      if (!proof || proof.length > 2048) throw new RelaySessionError('proof-unavailable');
      // Every attempt has one fresh proof and one POST; failures never trigger an automatic retry.
      timer = this.schedule(() => controller.abort(), 20000);
      const response = await abortable((this.options.transport ?? fetch)(url.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof, ...(previousToken ? { previousToken } : {}) }),
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
      }), controller.signal);
      if (!response.ok) { if (response.status === 401) this.token = undefined; void response.body?.cancel().catch(() => undefined); throw new RelaySessionError(response.status === 429 ? 'rate-limit' : response.status === 401 || response.status === 403 ? 'access-denied' : 'unavailable'); }
      const body = await boundedJson(response, controller.signal) as { token?: unknown; expiresAt?: unknown; renewAt?: unknown };
      const now = this.now() / 1000;
      if (!body || typeof body.token !== 'string' || !body.token || body.token.length > 4096 || /[\r\n]/.test(body.token) || !Number.isInteger(body.expiresAt) || !Number.isInteger(body.renewAt) || (body.expiresAt as number) <= now + 120 || (body.expiresAt as number) > now + 901 || body.renewAt !== (body.expiresAt as number) - 120) throw new RelaySessionError('invalid-response');
      await abortable(this.suspend, controller.signal);
      if (controller.signal.aborted || this.controller !== controller) throw new RelaySessionError('cancelled');
      await abortable(this.options.onToken(body.token), controller.signal);
      if (controller.signal.aborted || this.controller !== controller) throw new RelaySessionError('cancelled');
      this.clearTimers(); this.token = body.token;
      this.publish({ status: 'ready', renewing: false, expiresAt: body.expiresAt as number });
      this.renewTimer = this.schedule(() => { void this.renew(); }, Math.max(0, (body.renewAt as number) * 1000 - this.now()));
      this.expiryTimer = this.schedule(() => this.expire(), Math.max(0, (body.expiresAt as number) * 1000 - this.now()));
    } catch (error) {
      if (this.controller !== controller || this.state.status === 'expired') return;
      if (this.renewTimer !== undefined) this.unschedule(this.renewTimer);
      this.renewTimer = undefined;
      this.publish({ ...this.state, status: 'failed', renewing: false, failure: controller.signal.aborted ? 'cancelled' : error instanceof RelaySessionError ? error.code : 'unavailable' });
      this.suspendRequests();
    } finally { if (timer !== undefined) this.unschedule(timer); if (this.controller === controller) this.controller = undefined; }
  }
  private async waitForReadiness(controller: AbortController) {
    if (!this.options.readinessUrl) return;
    const url = new URL(this.options.readinessUrl), admission = new URL(this.options.admissionUrl);
    if (url.origin !== admission.origin || url.pathname !== '/v1/status' || url.search || url.hash) throw new RelaySessionError('not-configured');
    for (let check = 0; check < 2; check++) {
      const timeout = this.schedule(() => controller.abort(), 20000);
      let body: { ready?: unknown; retryAfter?: unknown };
      try {
        const response = await abortable((this.options.transport ?? fetch)(url.href, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal }), controller.signal);
        if (!response.ok && response.status !== 503) throw new RelaySessionError(response.status === 429 ? 'rate-limit' : 'unavailable');
        body = await boundedJson(response, controller.signal) as typeof body;
      } finally { this.unschedule(timeout); }
      if (body?.ready === true) { this.publish({ ...this.state, warmUntil: undefined }); return; }
      if (check || body?.ready !== false || !Number.isInteger(body.retryAfter) || (body.retryAfter as number) < 1 || (body.retryAfter as number) > 90) throw new RelaySessionError('invalid-response');
      this.publish({ ...this.state, warmUntil: this.now() + (body.retryAfter as number) * 1000 });
      this.suspendRequests();
      let waiting: ReturnType<typeof setTimeout> | undefined;
      try { await abortable(new Promise<void>(resolve => { waiting = this.schedule(resolve, (body.retryAfter as number) * 1000); }), controller.signal); }
      finally { if (waiting !== undefined) this.unschedule(waiting); }
    }
  }
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void promise.catch(() => undefined); throw new RelaySessionError('cancelled'); }
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(new RelaySessionError('cancelled')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get('Content-Length')) > 8192) { void response.body?.cancel().catch(() => undefined); throw new RelaySessionError('invalid-response'); }
  const reader = response.body?.getReader(); if (!reader) throw new RelaySessionError('invalid-response');
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await abortable(reader.read(), signal); if (part.done) break; size += part.value.byteLength; if (size > 8192) { cancel(); throw new RelaySessionError('invalid-response'); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RelaySessionError('invalid-response'); }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
