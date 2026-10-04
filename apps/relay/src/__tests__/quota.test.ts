import { expect,test } from 'bun:test';
import {quotaOperation,TECHNICAL_STATE_TTL_MS}from'../quota';
import{quotaNamespace}from'./quota-fixture';
test('coordinated concurrency is six across caller instances and releases are idempotent',async()=>{
 const{namespace}=quotaNamespace();const responses=await Promise.all(Array.from({length:10},()=>quotaOperation(namespace,'same-subject','forward')));expect(responses.filter(r=>r.ok)).toHaveLength(6);const lease=(await responses.find(r=>r.ok)!.json()as{lease:string}).lease;await quotaOperation(namespace,'same-subject','release',lease);await quotaOperation(namespace,'same-subject','release',lease);expect((await quotaOperation(namespace,'same-subject','forward')).ok).toBe(true);
});
test('forwarded attempts remain charged to the rolling 50/minute limit after release',async()=>{
 const{namespace}=quotaNamespace();for(let i=0;i<50;i++){const response=await quotaOperation(namespace,'subject','forward');expect(response.ok).toBe(true);const lease=(await response.json()as{lease:string}).lease;await quotaOperation(namespace,'subject','release',lease);}expect((await quotaOperation(namespace,'subject','forward')).status).toBe(429);
});
test('technical state expires within 24 hours and a stale alarm cannot erase new counters', async () => {
  let now = 1000;
  const { namespace, entries } = quotaNamespace(() => now);
  await quotaOperation(namespace, 'opaque', 'mint');
  const record = entries.get('opaque')!;
  expect(record.alarm).toBe(now + 60_000);
  expect(record.alarm! - now).toBeLessThanOrEqual(TECHNICAL_STATE_TTL_MS);
  now = record.alarm!;
  await record.quota.alarm();
  expect(record.counters.size).toBe(0);
  await quotaOperation(namespace, 'opaque', 'mint');
  await record.quota.alarm();
  expect(record.counters.size).toBe(1);
  now += TECHNICAL_STATE_TTL_MS;
  await record.quota.alarm();
  expect(record.counters.size).toBe(0);
});

test('rolling windows and active leases survive the former 24-hour boundary and stale alarms', async () => {
  let now = 1000;
  const { namespace, entries } = quotaNamespace(() => now);
  await quotaOperation(namespace, 'subject', 'mint');
  now += TECHNICAL_STATE_TTL_MS - 1000;
  for (let index = 0; index < 50; index++) {
    const response = await quotaOperation(namespace, 'subject', 'forward');
    const lease = (await response.json() as { lease: string }).lease;
    await quotaOperation(namespace, 'subject', 'release', lease);
  }
  now += 1000;
  await entries.get('subject')!.quota.alarm();
  expect((await quotaOperation(namespace, 'subject', 'forward')).status).toBe(429);
  now += 59_000;
  const held = await Promise.all(Array.from({ length: 6 }, () => quotaOperation(namespace, 'subject', 'forward')));
  expect(held.every(response => response.ok)).toBe(true);
  now += 60_000;
  await entries.get('subject')!.quota.alarm();
  expect((await quotaOperation(namespace, 'subject', 'forward')).status).toBe(429); // leases last 90 seconds
  now += 30_000;
  await entries.get('subject')!.quota.alarm();
  expect((await quotaOperation(namespace, 'subject', 'forward')).ok).toBe(true);
});
test('alarm failure rolls counter and lease writes back atomically and permits a clean next attempt', async () => {
  const { namespace, entries } = quotaNamespace();
  await quotaOperation(namespace, 'subject', 'mint');
  const record = entries.get('subject')!;
  const before = structuredClone([...record.counters]), beforeAlarm = record.alarm;
  record.failAlarm = true;
  await expect(quotaOperation(namespace, 'subject', 'forward')).rejects.toThrow('synthetic-alarm-failure');
  expect([...record.counters]).toEqual(before); expect(record.alarm).toBe(beforeAlarm);
  record.failAlarm = false;
  expect((await quotaOperation(namespace, 'subject', 'forward')).ok).toBe(true);
});
test('alarm cleanup deletes each expired window while retaining new traffic and live leases', async () => {
  let now = 0;
  const { namespace, entries } = quotaNamespace(() => now);
  const first = await quotaOperation(namespace, 'subject', 'forward');
  expect(first.ok).toBe(true);
  now = 30_000; await quotaOperation(namespace, 'subject', 'mint');
  const record = entries.get('subject')!;
  now = 60_000; await record.quota.alarm();
  const live = record.counters.get('counters') as { forwards: number[]; mints: number[]; leases: unknown[] };
  expect(live.forwards).toHaveLength(0); expect(live.mints).toHaveLength(1); expect(live.leases).toHaveLength(1);
  expect(record.alarm).toBe(90_000);
  now = 90_000; await record.quota.alarm();
  expect(record.counters.size).toBe(0); expect(record.alarm).toBeUndefined();
});
