#!/usr/bin/env node
// Read-only GitHub verification; release consumes the CI artifacts and never rebuilds them.
import { appendFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const report = JSON.parse(process.env.SIMAGENTS_RELEASE_EVIDENCE || await readFile('docs/release-gates.json', 'utf8'));
const runId = report.gates?.candidateRemoteCi?.runId;
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
if (!Number.isSafeInteger(runId) || runId <= 0 || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token) throw new Error('An exact candidate CI run and workflow authentication are required.');
const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, {
  headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
  redirect: 'error', signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error('Candidate CI run could not be verified.');
const run = await response.json();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (run.head_sha !== commit || run.repository?.full_name !== repository || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== '.github/workflows/ci.yml' || run.event !== 'push') throw new Error('Candidate must come from the successful main-repository push CI on this exact commit.');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `run-id=${runId}\n`);
console.log(`Verified candidate CI run ${runId} for ${commit}.`);
