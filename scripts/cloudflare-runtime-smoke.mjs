#!/usr/bin/env node
// Actual local workerd, real elapsed waits, no deployment or provider calls.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const moduleRoot=process.env.MINIFLARE_MODULE_DIR??path.resolve('scripts/fixtures/cloudflare-runtime/node_modules/miniflare');
const{Miniflare}=createRequire(path.join(moduleRoot,'package.json'))('miniflare');
const version=JSON.parse(await readFile(path.join(moduleRoot,'package.json'),'utf8')).version;
const dir=await mkdtemp(path.join(tmpdir(),'simagents-volatile-cf-'));
const compiled=await readFile('apps/relay/dist/worker.js','utf8'),admission=await readFile('apps/admission/dist/worker.js','utf8');
const candidate=JSON.parse(await readFile('apps/web/dist/candidate.json','utf8'));
const report={status:'running',candidateId:candidate.id,runtime:'local workerd',miniflareVersion:version,compatibilityDate:'2026-07-30',relaySha256:createHash('sha256').update(compiled).digest('hex'),admissionSha256:createHash('sha256').update(admission).digest('hex'),scope:'Local memory/entrypoint/zero-storage proof only; genuine deployed runtime, plan, platform logs and Turnstile remain separate',checks:[]};
const inspection=`\nexport class InspectionQuota extends SubjectQuota { constructor(state,env){super(state,env);this.testState=state;} async fetch(request){if(new URL(request.url).pathname==='/__test/read')return Response.json({subjects:this.counters.size,durableKeys:[...(await this.testState.storage.list()).keys()]});return super.fetch(request);} }`;
const mf=new Miniflare({name:'relay-runtime',modules:true,script:compiled+inspection,compatibilityDate:report.compatibilityDate,durableObjects:{INSPECT:{className:'InspectionQuota',useSQLite:true}},durableObjectsPersist:dir});
const evidenceDirectory=path.join(process.env.SIMAGENTS_EVIDENCE_ROOT??'.tmp','cloudflare-runtime-evidence');await mkdir(evidenceDirectory,{recursive:true});
const assert=(value,message)=>{if(!value)throw new Error(message)};
try{
 const ns=await mf.getDurableObjectNamespace('INSPECT'),stub=ns.get(ns.idFromName('simagents-quota-coordinator-v2'));
 const request=(operation,subject='',lease)=>stub.fetch(`https://quota.internal/${operation}`,{method:'POST',body:JSON.stringify({subject,...(lease?{lease}:{})})});
 const inspect=async()=>await(await stub.fetch('https://quota.internal/__test/read')).json();
 const cold=await request('status');assert(cold.status===503,'Cold coordinator allowed grants');
 assert((await request('forward','concurrent')).status===503,'Cold start bypassed previous leases');assert((await inspect()).durableKeys.length===0,'Cold start wrote durable identifiers');
 const warmBegan=Date.now();console.log('Actual workerd cold-start barrier: waiting 91 real seconds.');await new Promise(resolve=>setTimeout(resolve,91000));
 assert((await request('status')).ok,'Coordinator did not become ready');report.warmupElapsedMs=Date.now()-warmBegan;report.checks.push('real cold-start barrier before all new grants');
 const replies=await Promise.all(Array.from({length:10},()=>request('forward','concurrent')));assert(replies.filter(r=>r.ok).length===6,'Concurrent limit is not six');
 for(const r of replies.filter(r=>r.ok)){const{lease}=await r.json();await request('release','concurrent',lease);}
 assert((await request('forward','concurrent')).ok,'Release did not recover slot');report.checks.push('six coordinated leases and recovery');
 for(let i=0;i<50;i++){const r=await request('forward','rolling');assert(r.ok,'Rolling limit refused early');await request('release','rolling',(await r.json()).lease);}
 assert((await request('forward','rolling')).status===429,'Release erased charged forwards');
 for(let i=0;i<4;i++)assert((await request('mint','issuer')).ok,'Mint refused early');assert((await request('mint','issuer')).status===429,'Issuance bypassed four/minute');
 const before=await inspect();assert(before.subjects===3&&before.durableKeys.length===0,'Active counter data was persisted');report.checks.push('50 rolling forwards/four mints; no durable keys while active');
 const expiryBegan=Date.now();console.log('Actual workerd RAM cleanup: waiting 97 real seconds, including the longest lease.');await new Promise(resolve=>setTimeout(resolve,97000));
 const after=await inspect();assert(after.subjects===0&&after.durableKeys.length===0,'Expired identifiers remained resident or durable');report.expiryElapsedMs=Date.now()-expiryBegan;report.checks.push('RAM cleanup erased all subjects before any fresh grant; SQLite remained empty');
 const gate=new Miniflare({modules:true,script:admission,compatibilityDate:report.compatibilityDate});
 try{assert((await gate.dispatchFetch('https://admission.fixture.test/v1/session',{method:'POST',headers:{Origin:'https://app.fixture.test','Content-Type':'application/json'},body:'{"proof":"unused"}'})).status===503,'Unconfigured admission is not closed');}finally{await gate.dispose();}
 report.status='passed-local-only';
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{await writeFile(path.join(evidenceDirectory,'report.json'),JSON.stringify(report,null,2));await mf.dispose();await rm(dir,{recursive:true,force:true});}
console.log(JSON.stringify(report,null,2));
