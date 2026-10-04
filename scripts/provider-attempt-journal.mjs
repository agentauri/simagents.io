// Durable attempt intent/results only. This module performs no network requests.
import { open, readFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
export class ProviderAttemptJournal {
  static async create(directory, { candidateId, manifestHash, attemptIds, authorizedMaximumUsd }) {
    if (![candidateId,manifestHash].every(value => /^[a-f0-9]{64}$/.test(value)) || !Array.isArray(attemptIds) || new Set(attemptIds).size !== attemptIds.length || !attemptIds.every(id => /^[a-zA-Z0-9:_-]{1,150}$/.test(id)) || !Number.isFinite(authorizedMaximumUsd) || authorizedMaximumUsd <= 0) throw new Error('Invalid finite campaign identity/budget');
    await mkdir(directory,{recursive:true});
    const lockPath=path.join(directory,'campaign.lock'), lock=await open(lockPath,'wx');
    try {
      await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),candidateId,manifestHash}));await lock.sync();
      const journalPath=path.join(directory,'attempts.jsonl');let rows=[];
      try {const raw=await readFile(journalPath,'utf8');if(raw && !raw.endsWith('\n'))throw new Error('Incomplete attempt journal; reconcile before any further call');rows=raw.trim()?raw.trim().split('\n').map(line=>JSON.parse(line)):[];}catch(error){if(error.code!=='ENOENT')throw error;}
      if(rows.length)throw new Error('Campaign already has recorded attempts. Reconcile it; never silently restart/retry.');
      const file=await open(journalPath,'ax');
      return new ProviderAttemptJournal(file,lock,lockPath,{candidateId,manifestHash,attemptIds,authorizedMaximumUsd});
    }catch(error){await lock.close();await unlink(lockPath);throw error;}
  }
  constructor(file,lock,lockPath,identity){this.file=file;this.lock=lock;this.lockPath=lockPath;this.identity=identity;this.used=new Set();this.reserved=0;this.pending=undefined;this.stopped=false;this.tail=Promise.resolve();}
  serialize(operation){const result=this.tail.then(operation);this.tail=result.catch(()=>{});return result;}
  async persist(record){try{await this.file.write(JSON.stringify({...record,candidateId:this.identity.candidateId,manifestHash:this.identity.manifestHash,at:new Date().toISOString()})+'\n');await this.file.sync();}catch(error){this.stopped=true;throw error;}}
  begin({attemptId,promptHash,parametersHash,reservedMaximumUsd}){
    return this.serialize(async()=>{
      if(this.stopped||this.pending||this.used.has(attemptId)||!this.identity.attemptIds.includes(attemptId))throw new Error('Attempt is not authorized, already used or campaign requires reconciliation');
      if(![promptHash,parametersHash].every(value=>/^[a-f0-9]{64}$/.test(value))||!Number.isFinite(reservedMaximumUsd)||reservedMaximumUsd<0||this.reserved+reservedMaximumUsd>this.identity.authorizedMaximumUsd)throw new Error('Attempt hash/budget exceeds the finite campaign');
      await this.persist({type:'intent',attemptId,promptHash,parametersHash,reservedMaximumUsd});
      this.used.add(attemptId);this.pending=attemptId;this.reserved+=reservedMaximumUsd;
      return {attemptId}; // Caller may send once only after this fsynced receipt resolves.
    });
  }
  finish({attemptId,outcome,errorCode=null,inputTokens=null,outputTokens=null,latencyMs,reportedModel=null}){
    return this.serialize(async()=>{
      if(this.pending!==attemptId||!['success','failed','not-sent','unknown'].includes(outcome)||!Number.isFinite(latencyMs)||latencyMs<0||![inputTokens,outputTokens].every(value=>value===null||(Number.isSafeInteger(value)&&value>=0))||!(errorCode===null||/^[a-zA-Z0-9_-]{1,80}$/.test(errorCode))||!(reportedModel===null||/^[a-zA-Z0-9_./:@-]{1,200}$/.test(reportedModel)))throw new Error('Invalid safe terminal attempt record');
      await this.persist({type:'result',attemptId,outcome,errorCode,inputTokens,outputTokens,latencyMs,reportedModel});
      this.pending=undefined;if(outcome!=='success')this.stopped=true;
    });
  }
  async close(){await this.tail;await this.file.close();await this.lock.close();await unlink(this.lockPath);}
}
