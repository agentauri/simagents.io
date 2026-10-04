import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{ProviderAttemptJournal}from'./provider-attempt-journal.mjs';
const identity={candidateId:'a'.repeat(64),manifestHash:'b'.repeat(64),attemptIds:['probe','decision-1'],authorizedMaximumUsd:1};
const intent=attemptId=>({attemptId,promptHash:'c'.repeat(64),parametersHash:'d'.repeat(64),reservedMaximumUsd:.6});
test('fsynced intent precedes a send receipt; duplicate and concurrent attempts cannot overspend',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'simagents-attempt-'));let journal;
 try{journal=await ProviderAttemptJournal.create(dir,identity);await journal.begin(intent('probe'));const rows=(await readFile(path.join(dir,'attempts.jsonl'),'utf8')).trim().split('\n');assert.equal(JSON.parse(rows[0]).type,'intent');
 await assert.rejects(journal.begin(intent('decision-1')));await journal.finish({attemptId:'probe',outcome:'success',inputTokens:10,outputTokens:3,latencyMs:20});await assert.rejects(journal.begin(intent('probe')));await assert.rejects(journal.begin(intent('decision-1')));await assert.rejects(ProviderAttemptJournal.create(dir,identity));
 }finally{await journal?.close();await rm(dir,{recursive:true,force:true});}
});
test('first failure stops the campaign; a recorded campaign cannot be reopened as a retry',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'simagents-attempt-'));let journal;
 try{journal=await ProviderAttemptJournal.create(dir,identity);await journal.begin(intent('probe'));await journal.finish({attemptId:'probe',outcome:'failed',errorCode:'provider-error',latencyMs:20});await assert.rejects(journal.begin({...intent('decision-1'),reservedMaximumUsd:.1}));await journal.close();journal=undefined;await assert.rejects(ProviderAttemptJournal.create(dir,identity));}
 finally{await journal?.close();await rm(dir,{recursive:true,force:true});}
});
test('payload/credential-bearing terminal fields are rejected instead of written into logs',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'simagents-attempt-'));let journal;
 try{journal=await ProviderAttemptJournal.create(dir,identity);await journal.begin(intent('probe'));await assert.rejects(journal.finish({attemptId:'probe',outcome:'failed',errorCode:'secret payload with spaces',latencyMs:20}));const raw=await readFile(path.join(dir,'attempts.jsonl'),'utf8');assert.ok(!raw.includes('secret payload'));await journal.finish({attemptId:'probe',outcome:'unknown',errorCode:'outcome-unknown',latencyMs:20});}
 finally{await journal?.close();await rm(dir,{recursive:true,force:true});}
});
