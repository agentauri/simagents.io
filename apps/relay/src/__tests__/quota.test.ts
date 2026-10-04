import { expect, test } from 'bun:test';
import { quotaOperation, SubjectQuota, COORDINATOR_NAME, COORDINATOR_WARMUP_MS } from '../quota';
import { quotaNamespace } from './quota-fixture';
test('one constant object coordinates independent subjects with six concurrent leases and idempotent release', async () => {
  const {namespace,entries}=quotaNamespace();
  const replies=await Promise.all(Array.from({length:10},()=>quotaOperation(namespace,'subject','forward')));
  expect(replies.filter(r=>r.ok)).toHaveLength(6);
  expect((await quotaOperation(namespace,'other-subject','forward')).ok).toBe(true);
  expect([...entries.keys()]).toEqual([COORDINATOR_NAME]);
  const {lease}=await replies.find(r=>r.ok)!.json() as {lease:string};
  await quotaOperation(namespace,'subject','release',lease);await quotaOperation(namespace,'subject','release',lease);
  expect((await quotaOperation(namespace,'subject','forward')).ok).toBe(true);
});
test('forwarded attempts remain charged after release, while issuance is independently limited to four/minute',async()=>{
  const{namespace}=quotaNamespace();
  for(let i=0;i<50;i++){const r=await quotaOperation(namespace,'subject','forward');expect(r.ok).toBe(true);await quotaOperation(namespace,'subject','release',(await r.json() as {lease:string}).lease);}
  expect((await quotaOperation(namespace,'subject','forward')).status).toBe(429);
  for(let i=0;i<4;i++)expect((await quotaOperation(namespace,'subject','mint')).ok).toBe(true);
  expect((await quotaOperation(namespace,'subject','mint')).status).toBe(429);
});
test('eviction/restart fails closed for a full lease interval, without touching any storage API',async()=>{
  let now=0;const noStorage=new Proxy({}, {get(){throw new Error('durable data forbidden')}});
  const fresh=()=>new SubjectQuota(noStorage,undefined,()=>now);
  const invoke=(q:SubjectQuota,path:string)=>q.fetch(new Request('https://quota.internal/'+path,{method:'POST',body:JSON.stringify({subject:'same-subject'})}));
  let q=fresh();expect((await invoke(q,'forward')).status).toBe(503);
  now=COORDINATOR_WARMUP_MS;for(let i=0;i<6;i++)expect((await invoke(q,'forward')).ok).toBe(true);
  q=fresh();expect((await invoke(q,'mint')).status).toBe(503);expect((await invoke(q,'forward')).status).toBe(503);
  now+=COORDINATOR_WARMUP_MS-1;expect((await invoke(q,'forward')).status).toBe(503);
  now++;expect((await invoke(q,'forward')).ok).toBe(true);
});
test('rolling windows expire at sixty seconds and unreleased leases at ninety seconds',async()=>{
  let now=0;const{namespace}=quotaNamespace(()=>now);
  for(let i=0;i<6;i++)expect((await quotaOperation(namespace,'subject','forward')).ok).toBe(true);
  now=60000;expect((await quotaOperation(namespace,'subject','forward')).status).toBe(429);
  now=90000;expect((await quotaOperation(namespace,'subject','forward')).ok).toBe(true);
});
test('resident capacity rejects new subjects without erasing active limits',async()=>{
  const{namespace}=quotaNamespace();
  for(let i=0;i<4096;i++)expect((await quotaOperation(namespace,'s'+i,'mint')).ok).toBe(true);
  expect((await quotaOperation(namespace,'new-subject','mint')).status).toBe(429);
  for(let i=0;i<3;i++)expect((await quotaOperation(namespace,'s0','mint')).ok).toBe(true);
  expect((await quotaOperation(namespace,'s0','mint')).status).toBe(429);
});
