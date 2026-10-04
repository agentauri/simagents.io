/** Widget bridge: each proof is delivered to one admission attempt, never stored. */
interface ProofRequest {
  id: string; signal: AbortSignal; interact: () => void; succeed: (proof: string) => void; fail: () => void;
}
let pending: ProofRequest | undefined;
const listeners = new Set<() => void>();
function emit() { for (const listener of listeners) listener(); }
export const subscribeProof = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const proofSnapshot = () => pending;
export function requestTurnstileProof(interact: () => void, signal: AbortSignal): Promise<string> {
  if (pending) return Promise.reject(new Error('proof-busy'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const finish = (proof?: string) => {
      signal.removeEventListener('abort', abort);
      if (pending?.id === id) { pending = undefined; emit(); }
      if (proof) resolve(proof); else reject(new Error('proof-unavailable'));
    };
    const abort = () => finish();
    pending = { id, signal, interact, succeed: proof => finish(proof), fail: () => finish() };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else emit();
  });
}
export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }
let loading: Promise<TurnstileApi> | undefined;
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => fail(), 15000);
    const fail = () => { clearTimeout(timeout); script.remove(); loading = undefined; reject(new Error('proof-unavailable')); };
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => { clearTimeout(timeout); if (window.turnstile) resolve(window.turnstile); else fail(); };
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
