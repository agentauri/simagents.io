#!/usr/bin/env node
// Local workerd/SQLite evidence only. No deployment, credentials or upstream provider calls.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const moduleRoot = process.env.MINIFLARE_MODULE_DIR ?? path.resolve('.tmp/cloudflare-runtime/node_modules/miniflare');
const { Miniflare } = createRequire(path.join(moduleRoot,'package.json'))('miniflare');
const version = JSON.parse(await readFile(path.join(moduleRoot,'package.json'),'utf8')).version;
const dir=await mkdtemp(path.join(tmpdir(),'simagents-local-cf-'));
const compiled=await readFile('apps/relay/dist/worker.js','utf8');
const admission=await readFile('apps/admission/dist/worker.js','utf8');
const candidate=JSON.parse(await readFile('apps/web/dist/candidate.json','utf8'));
const report={status:'running',candidateId:candidate.id,runtime:'Miniflare/workerd local',miniflareVersion:version,compatibilityDate:'2026-07-30',requestedDeploymentDates:{relay:'2026-09-17',admission:'2026-10-04'},relaySha256:createHash('sha256').update(compiled).digest('hex'),admissionSha256:createHash('sha256').update(admission).digest('hex'),scope:'Local SQL/alarm/entrypoint test; cannot certify deployment dates, multi-location behavior or genuine Turnstile',checks:[]};
const assert=(value,message)=>{if(!value)throw new Error(message)};
const mf=new Miniflare({name:'relay-runtime',modules:true,script:compiled+`\nexport class InspectionQuota extends SubjectQuota { fetch(request) { if (new URL(request.url).pathname === '/__test/read') return this.state.storage.get('counters').then(value => Response.json(value ?? null)); return super.fetch(request); } }`,compatibilityDate:report.compatibilityDate,durableObjects:{QUOTAS:{className:'SubjectQuota',useSQLite:true},INSPECT:{className:'InspectionQuota',useSQLite:true}},durableObjectsPersist:dir});
const evidenceDirectory=path.join(process.env.SIMAGENTS_EVIDENCE_ROOT??'.tmp','cloudflare-runtime-evidence');
await mkdir(evidenceDirectory,{recursive:true});
try{
 const ns=await mf.getDurableObjectNamespace('QUOTAS');
 const request=(stub,path,lease)=>stub.fetch(`https://quota.internal/${path}`,{method:'POST',body:JSON.stringify(lease?{lease}:{})});
 const concurrent=ns.get(ns.idFromName('coordinated-concurrency'));
 const responses=await Promise.all(Array.from({length:10},()=>request(concurrent,'forward')));
 assert(responses.filter(r=>r.ok).length===6,'Runtime concurrency exceeded six');
 const leases=await Promise.all(responses.filter(r=>r.ok).map(r=>r.json()));for(const item of leases)await request(concurrent,'release',item.lease);
 assert((await request(concurrent,'forward')).ok,'Release did not recover runtime slot');report.checks.push('six concurrent coordinated leases and recovery');
 const rolling=ns.get(ns.idFromName('rolling-budget'));
 for(let index=0;index<50;index++){const r=await request(rolling,'forward');assert(r.ok,`Runtime rolling count refused ${index}`);const{lease}=await r.json();await request(rolling,'release',lease);}
 assert((await request(rolling,'forward')).status===429,'Runtime rolling 50/minute limit was bypassed');report.checks.push('50 forwarded operations remain charged after release');
 const inspection=await mf.getDurableObjectNamespace('INSPECT');
 const mint=inspection.get(inspection.idFromName('mint-cleanup'));for(let index=0;index<4;index++)assert((await request(mint,'mint')).ok,'Mint failed');assert((await request(mint,'mint')).status===429,'Runtime issuance exceeded four/minute');report.checks.push('coordinated issuance limit');
 // Real one-minute alarm/window; no accelerated time is used here.
 const storedBefore=await(await mint.fetch('https://quota.internal/__test/read')).json();assert(storedBefore?.mints?.length===4,'No actual stored issuance counters');
 const began=Date.now();console.log('Local workerd SQL/counters passed; waiting for the real alarm/window expiry.');
 await new Promise(resolve=>setTimeout(resolve,62000));
 const storedAfter=await(await mint.fetch('https://quota.internal/__test/read')).json();assert(storedAfter===null,'Scheduled alarm did not delete expired SQLite counters');
 report.checks.push('actual alarm deleted SQLite counter state before another mint request');
 assert((await request(mint,'mint')).ok,'Runtime alarm/window did not permit new issuance');
 assert((await request(rolling,'forward')).ok,'Runtime rolling window never recovered');report.checks.push('real elapsed mint/forward window recovery with scheduled storage alarm');report.elapsedCleanupMs=Date.now()-began;
 const gate=new Miniflare({modules:true,script:admission,compatibilityDate:'2026-07-30'});
 try{const result=await gate.dispatchFetch('https://admission.fixture.test/v1/session',{method:'POST',headers:{Origin:'https://app.fixture.test','Content-Type':'application/json'},body:'{"proof":"synthetic-unused"}'});assert(result.status===503,'Admission did not fail closed without bindings/secrets');report.checks.push('admission entrypoint starts and fails closed unconfigured');}finally{await gate.dispose();}
 report.status='passed-local-only';
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{await writeFile(path.join(evidenceDirectory,'report.json'),JSON.stringify(report,null,2));await mf.dispose();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(report,null,2));
