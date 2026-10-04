import { SubjectQuota, type QuotaNamespace, type QuotaStorage } from '../quota';
export function quotaNamespace(now = () => Date.now()) {
  const entries = new Map<string, { counters: Map<string, unknown>; alarm?: number; failAlarm?: boolean; quota: SubjectQuota }>();
  const namespace: QuotaNamespace = {
    idFromName: name => name,
    get(id) {
      const name = String(id);
      if (!entries.has(name)) {
        const counters = new Map<string, unknown>();
        const record: { counters: Map<string, unknown>; alarm?: number; failAlarm?: boolean; quota: SubjectQuota } = { counters, quota: undefined as unknown as SubjectQuota };
        const storage: QuotaStorage = { get: async <T>(key: string) => structuredClone(counters.get(key)) as T | undefined,
          put: async (key, value) => { counters.set(key, structuredClone(value)); }, deleteAll: async () => { counters.clear(); record.alarm = undefined; }, setAlarm: async time => { if (record.failAlarm) throw new Error('synthetic-alarm-failure'); record.alarm = time; },
          transaction: async operation => {
            const before = new Map([...counters].map(([key, value]) => [key, structuredClone(value)])), alarm = record.alarm;
            try { return await operation(); }
            catch (error) { counters.clear(); for (const [key, value] of before) counters.set(key, value); record.alarm = alarm; throw error; }
          } };
        record.quota = new SubjectQuota({ storage }, undefined, now); entries.set(name, record);
      }
      return { fetch: request => entries.get(name)!.quota.fetch(request) };
    },
  };
  return { namespace, entries };
}
