import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const gates = ['publicUiEnItAccessibility','actionMatrixAndSnapshotValidation','sixtyMinuteTwentyAgentSoak','cloudflareAdmissionAndRenewal','elevenProviderLiveCompatibility','candidateRemoteCi','fiveParticipantUsability','stagingMonitoringAndOperator','rollbackWithinFifteenMinutes','rollbackReadsIndexedDbVersionTwo'];
function fixture() {
 const candidateId='a'.repeat(64), entry={status:'passed',commit,candidateId,artifact:'synthetic-unit-evidence-not-a-release'};
 return {schemaVersion:1,candidateCommit:commit,candidateId,gates:Object.fromEntries(gates.map(gate=>[gate,{...entry}]))};
}
const check=(report,version)=>spawnSync(process.execPath,['scripts/check-release-gates.mjs'],{encoding:'utf8',env:{...process.env,SIMAGENTS_RELEASE_EVIDENCE:JSON.stringify(report),SIMAGENTS_RELEASE_VERSION:version}}).status;
test('beta still requires every original exact-candidate gate but does not claim stable exit',()=>{
 const report=fixture();assert.equal(check(report,'v1.0.0-beta.1'),0);
 report.gates.candidateRemoteCi.status='cancelled';assert.notEqual(check(report,'v1.0.0-beta.1'),0);
});
test('stable cannot pass without real beta-duration, human-session and rollback fields',()=>{
 const report=fixture();assert.notEqual(check(report,'v1.0.0'),0);
 const now=Date.now();report.gates.publicBetaExit={...report.gates.candidateRemoteCi,betaOpenedAt:new Date(now-8*86400000).toISOString(),observedAt:new Date(now).toISOString(),completedSessions:20,distinctHumans:5,criticalHighOpen:0,rollbackPassed:true,accessMode:'public-no-invites-no-accounts'};
 assert.equal(check(report,'v1.0.0'),0);
 for(const patch of [{betaOpenedAt:new Date(now-6*86400000).toISOString()},{completedSessions:19},{distinctHumans:4},{criticalHighOpen:1},{rollbackPassed:false},{accessMode:'invite-only'},{observedAt:new Date(now+3600000).toISOString()},{candidateId:'b'.repeat(64)}])assert.notEqual(check({...report,gates:{...report.gates,publicBetaExit:{...report.gates.publicBetaExit,...patch}}},'v1.0.0'),0);
});
test('malformed versions cannot bypass stable checks with an arbitrary hyphen',()=>{
 assert.notEqual(check(fixture(),'stable-but-not-really'),0);
});
