import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');
/** Only compilation inputs; excludes tests, generated data, credentials and browser profiles. */
export async function buildSourceFingerprint(root) {
  const names = [];
  async function walk(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) names.push(name);
      else throw new Error(`Unsupported source entry: ${name}`);
    }
  }
  for (const directory of ['apps/web/src', 'apps/web/public', 'packages/engine/src', 'packages/shared/src', 'apps/relay/src', 'apps/admission/src']) await walk(directory);
  names.push('apps/web/index.html', 'apps/web/vite.config.ts', 'apps/web/package.json', 'apps/web/tsconfig.json', 'packages/engine/package.json', 'packages/engine/tsconfig.json', 'packages/shared/package.json', 'packages/shared/tsconfig.json', 'package.json', 'tsconfig.json', 'bun.lock', 'scripts/build-source.mjs', 'apps/relay/package.json', 'apps/relay/wrangler.toml', 'apps/admission/package.json', 'apps/admission/wrangler.toml');
  const files = Object.fromEntries(await Promise.all(names.sort().map(async name => [name, hash(await readFile(path.join(root, name)))])));
  return { hash: hash(JSON.stringify(files)), files };
}
