#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// Bun 1.2 has no audit command. Query npm's advisory API with the locked inventory.
const lock = JSON.parse((await readFile('bun.lock', 'utf8')).replace(/,\s*([}\]])/g, '$1'));
const inventory = {};
for (const entry of Object.values(lock.packages)) {
  const resolved = entry[0];
  const at = resolved.lastIndexOf('@');
  if (at <= 0 || resolved.includes('workspace:')) continue;
  const name = resolved.slice(0, at), version = resolved.slice(at + 1);
  (inventory[name] ??= []).push(version);
}
const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(inventory), signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`Dependency audit unavailable (${response.status}).`);
const advisories = await response.json();
await mkdir('.tmp', { recursive: true });
await writeFile('.tmp/app-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), inventory, advisories }, null, 2));
const blockers = Object.entries(advisories).flatMap(([name, values]) => values
  .filter(value => ['high', 'critical'].includes(value.severity))
  .map(value => ({ name, severity: value.severity, title: value.title, url: value.url })));
console.log(JSON.stringify({ packages: Object.keys(inventory).length, blockers }, null, 2));
if (blockers.length) process.exitCode = 1;
