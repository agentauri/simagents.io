#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSourceFingerprint } from './build-source.mjs';

const root = 'apps/web/dist';
const manifestPath = path.join(root, 'candidate.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const name = path.join(directory, entry.name);
    if (name === manifestPath) continue;
    if (entry.isDirectory()) result.push(...await files(name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Unsupported artifact entry: ${name}`);
  }
  return result.sort();
}
const build = JSON.parse(await readFile(path.join(root, 'build-source.json'), 'utf8'));
const sources = await buildSourceFingerprint(process.cwd());
if (build.schemaVersion !== 1 || build.sourceHash !== sources.hash) throw new Error('SPA artifact is stale or lacks verified compilation inputs. Build successfully before recording a candidate.');
const assets = Object.fromEntries(await Promise.all((await files(root)).map(async file => [path.relative(root, file), sha256(await readFile(file))])));
const identity = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    bundle: sha256(JSON.stringify(assets)),
    compilationInputs: sources.hash,
    relay: sha256(await readFile('apps/relay/dist/worker.js')),
    admission: sha256(await readFile('apps/admission/dist/worker.js')),
    catalog: sha256(await readFile('packages/shared/src/llm-catalog.ts')),
    pricingCatalog: sha256(await readFile('packages/shared/src/provider-prices.json')),
    connections: sha256(await readFile('packages/shared/src/connections.ts')),
    storageSchema: sha256(await readFile('apps/web/src/services/app-data.ts')),
    snapshotSchema: sha256(await readFile('packages/engine/src/engine/persistence.ts')),
    snapshotDomainSchema: sha256(await readFile('packages/engine/src/engine/snapshot-domain.ts')),
    translationCatalog: sha256(await readFile('apps/web/src/i18n/catalog.ts')),
    lockfile: sha256(await readFile('bun.lock')),
  };
if (process.argv.includes('--verify')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (JSON.stringify(manifest.identity) !== JSON.stringify(identity)) throw new Error('Candidate relay, admission, sources, lockfile or commit changed.');
  if (JSON.stringify(assets) !== JSON.stringify(manifest.assets)) throw new Error('Candidate assets changed after build.');
  if (sha256(JSON.stringify(manifest.identity)) !== manifest.id) throw new Error('Candidate identity is invalid.');
  if (sha256(JSON.stringify(assets)) !== manifest.identity.bundle) throw new Error('Bundle does not match candidate identity.');
  console.log(`Verified candidate ${manifest.id}`);
} else {

  const manifest = { schemaVersion: 1, id: sha256(JSON.stringify(identity)), createdAt: new Date().toISOString(), identity, assets };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Recorded candidate ${manifest.id}; dirty=${identity.dirty}`);
}
