#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Evidence is recorded after the candidate commit, outside that commit.
const report = JSON.parse(process.env.SIMAGENTS_RELEASE_EVIDENCE || await readFile('docs/release-gates.json', 'utf8'));
const required = ['publicUiEnItAccessibility', 'actionMatrixAndSnapshotValidation',
  'sixtyMinuteTwentyAgentSoak', 'cloudflareAdmissionAndRenewal', 'elevenProviderLiveCompatibility',
  'candidateRemoteCi', 'fiveParticipantUsability', 'stagingMonitoringAndOperator',
  'rollbackWithinFifteenMinutes', 'rollbackReadsIndexedDbVersionTwo'];
const version = process.env.SIMAGENTS_RELEASE_VERSION;
if (version && !/^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:alpha|beta|rc)(?:[.-]\d+)?)?$/.test(version)) throw new Error('Release version must be a stable, alpha, beta or rc semantic version.');
const stable = !version || !/-[0-9A-Za-z]/.test(version);
if (stable) required.push('publicBetaExit');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const blocked = required.filter(key => {
  const evidence = report.gates?.[key];
  return evidence?.status !== 'passed' || evidence.commit !== commit || evidence.candidateId !== report.candidateId || typeof evidence.artifact !== 'string' || !evidence.artifact.trim();
});
const beta = report.gates?.publicBetaExit;
const openedAt = Date.parse(beta?.betaOpenedAt ?? ''), observedAt = Date.parse(beta?.observedAt ?? '');
const betaValid = !stable || (Number.isFinite(openedAt) && Number.isFinite(observedAt) && observedAt <= Date.now() + 30000 && observedAt - openedAt >= 7 * 86400000 &&
  beta.completedSessions >= 20 && Number.isSafeInteger(beta.completedSessions) && beta.distinctHumans >= 5 && beta.distinctHumans <= beta.completedSessions && Number.isSafeInteger(beta.distinctHumans) && beta.criticalHighOpen === 0 && beta.rollbackPassed === true && beta.accessMode === 'public-no-invites-no-accounts');
if (!betaValid) blocked.push('publicBetaExit:seven-days/twenty-sessions/five-humans/no-high-or-critical/rollback/public-access');
if (!/^[a-f0-9]{64}$/.test(report.candidateId ?? '') || report.schemaVersion !== 1 || report.candidateCommit !== commit || blocked.length) {
  console.error(`Release blocked: evidence must match ${commit}. Pending gates: ${blocked.join(', ')}`);
  process.exitCode = 1;
} else console.log('Recorded release gates match this commit; publication still requires operator authorization.');
