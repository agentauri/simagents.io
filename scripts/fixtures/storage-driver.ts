import { AppDataStore,APP_DATA_BUDGET } from '../../apps/web/src/services/app-data';
const dbName='simagents-storage-budget-browser';
const data=new AppDataStore(dbName);
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
async function accounting(){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(dbName);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<number>((resolve,reject)=>{const r=db.transaction('accounting').objectStore('accounting').get('bytes');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});}finally{db.close()}}
(window as any).storageBudgetScenario=async()=>{
 const primary={fixture:'primary-world-preservation',content:'p'.repeat(1024*1024)};await data.write('world:current',primary);const primaryBytes=bytes(primary);
 const chunk={fixture:'secondary-archive',content:'s'.repeat(1024*1024)};let accepted=0;
 for(let index=0;index<60;index++){try{await data.putItem('replay-archive',`frame:${index}`,chunk,{world:'synthetic-budget-world',tick:index});accepted++;}catch{break;}}
 const before=await accounting();
 if(before!==primaryBytes+accepted*bytes(chunk)||before>45*1024*1024)throw new Error('Secondary accounting/45 MiB limit inconsistent');
 let rejected=false;try{await data.putItem('replay-archive','overflow',chunk)}catch{rejected=true};if(!rejected||await data.item('replay-archive','overflow')!==undefined||await accounting()!==before)throw new Error('Failed secondary append mutated its archive/accounting');
 let full=await data.write('primary-reserve',{content:'r'.repeat(4*1024*1024)});if(full>APP_DATA_BUDGET)throw new Error('Primary reserve exceeded budget');
 const prior=await data.read('world:current');let primaryRejected=false;try{await data.write('world:current',{content:'too-large'.repeat(8*1024*1024)})}catch{primaryRejected=true};if(!primaryRejected||JSON.stringify(await data.read('world:current'))!==JSON.stringify(prior)||await accounting()!==full)throw new Error('Failed primary growth lost world/accounting');
 await data.clearItems('replay-archive');const after=await accounting();if(after!==bytes(primary)+bytes({content:'r'.repeat(4*1024*1024)}))throw new Error('Archive removal broke accounting');
 return {secondaryAccepted:accepted,secondaryPayloadBytes:before,primaryPayloadBytes:full,secondaryLimit:45*1024*1024,totalLimit:APP_DATA_BUDGET,sourceWorldPreserved:true,failedWritesAtomic:true,afterRemovalBytes:after};
};
