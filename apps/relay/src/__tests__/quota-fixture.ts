import { SubjectQuota, COORDINATOR_WARMUP_MS, type QuotaNamespace } from '../quota';
/** Offline fixtures start a prewarmed object; eviction tests construct cold objects explicitly. */
export function quotaNamespace(now = () => Date.now()) {
  const entries = new Map<string, { quota: SubjectQuota }>();
  const namespace: QuotaNamespace = {
    idFromName: name => name,
    get(id) {
      const name = String(id);
      if (!entries.has(name)) {
        let initializing = true;
        const clock = () => { if (initializing) { initializing = false; return now() - COORDINATOR_WARMUP_MS; } return now(); };
        const state = new Proxy({}, { get() { throw new Error('quota must never access durable storage'); } });
        entries.set(name, { quota: new SubjectQuota(state, undefined, clock) });
      }
      return { fetch: request => entries.get(name)!.quota.fetch(request) };
    },
  };
  return { namespace, entries };
}
