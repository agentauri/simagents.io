// Chromium quota manager fault scenarios on an isolated origin/profile; no inference traffic.
import { createRequire } from 'node:module';
import { mkdir,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildSoakWorld } from './fixtures/soak-world';
import { validateWorldSnapshotV1 } from '../packages/engine/src/engine/persistence';
import { openSimulationTool,productText,setSmokeLanguage,smokeLanguage } from './browser-helpers.mjs';
const require=createRequire(import.meta.url),pw=process.env.PLAYWRIGHT_MODULE_DIR?createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright'):require('playwright');
const base=process.env.SIMAGENTS_SMOKE_URL??'http://127.0.0.1:5185/',origin=new URL(base).origin;
const fixture=await buildSoakWorld();
await mkdir('.tmp/storage-faults',{recursive:true});
const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message)};
for(const scenario of ['quota-denied','insufficient-space']){
  const profile=await mkdtemp(path.join(tmpdir(),'simagents-quota-'));
  const context=await pw.chromium.launchPersistentContext(profile,{headless:true}),page=await context.newPage();await setSmokeLanguage(page);page.setDefaultTimeout(30000);const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  await context.addInitScript(() => {
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:any[]){if((window as any).__quotaFault && this.name==='records')throw new DOMException('Injected storage denial','QuotaExceededError');return original.apply(this,args as any);};
  });
  await context.route('**/*',(r:any)=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const cdp=await context.newCDPSession(page);
  async function stored(){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('simagents-app-data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction(['records','accounting']);const r=tx.objectStore('records').get('world:current'),a=tx.objectStore('accounting').get('bytes');tx.oncomplete=()=>resolve({record:r.result,accounting:a.result});tx.onabort=()=>reject(tx.error)});}finally{db.close()}})}
  async function imported(file:any){await openSimulationTool(page,'Import saved world');await page.locator('input[type=file]').setInputFiles({name:'storage-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});}
  try{
   await page.goto(base);await imported(fixture.file);await page.getByRole('status').filter({hasText:productText('World imported. Use Start to resume the saved world.')}).waitFor();await page.getByRole('status').filter({hasText:productText('World imported. Use Start to resume the saved world.')}).getByRole('button',{name:productText('Close'),exact:true}).click();
   const before=await stored(),usage=await cdp.send('Storage.getUsageAndQuota',{origin});
   const next=structuredClone(fixture.file);for(const event of next.snapshot.store.events)event.payload.pressure=randomBytes(128).toString('hex');next.snapshot.configuration.customPrompt='Changed input must not replace the baseline if the browser refuses its write.';validateWorldSnapshotV1(next.snapshot);
   const quotaSize=scenario==='quota-denied'?0:Math.ceil(usage.usage)+64*1024;
   await cdp.send('Storage.overrideQuotaForOrigin',{origin,quotaSize});
   await page.evaluate(()=>{(window as any).__quotaFault=true;});
   console.log(JSON.stringify({scenario,quotaSize,quotaInfo:await cdp.send('Storage.getUsageAndQuota',{origin})}));
   await imported(next);await page.getByRole('alert').filter({hasText:productText('The browser denied storage space. Existing data was preserved; export or remove data before saving more.')}).waitFor();
   const after=await stored();assert(JSON.stringify(after)===JSON.stringify(before),`${scenario}: failed write changed committed world or accounting`);assert(!errors.length,`${scenario}: unhandled browser exception`);
   await page.screenshot({path:`.tmp/storage-faults/${scenario}-${smokeLanguage}.png`});await writeFile(`.tmp/storage-faults/${scenario}-${smokeLanguage}.json`,JSON.stringify({status:'passed-injected-fault-only',method:'Injected QuotaExceededError in real browser IndexedDB transaction; CDP quota override did not enforce rejection',scenario,language:smokeLanguage,quotaSize,browserUsageBefore:usage.usage,committedStatePreserved:true,providerTraffic:'blocked',candidate:await(await context.request.get(new URL('candidate.json',base).href)).json()},null,2));
   console.log(`PASS ${scenario} ${smokeLanguage}: injected quota denial in Chromium preserves committed world/accounting, handled visible error, no provider traffic.`);
  }catch(error){await page.screenshot({path:`.tmp/storage-faults/${scenario}-${smokeLanguage}-failure.png`});throw error;}
  finally{await cdp.send('Storage.overrideQuotaForOrigin',{origin}).catch(()=>{});await context.close();await rm(profile,{recursive:true,force:true});}
}
