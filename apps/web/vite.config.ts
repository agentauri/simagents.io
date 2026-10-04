import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildSourceFingerprint } from '../../scripts/build-source.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const engineSrc = fileURLToPath(new URL('../../packages/engine/src', import.meta.url));

export default defineConfig({
  plugins: [react(), (() => {
    let config: import('vite').ResolvedConfig;
    let sources: Awaited<ReturnType<typeof buildSourceFingerprint>>;
    return {
      name: 'simagents-build-provenance', apply: 'build' as const,
      configResolved(value: import('vite').ResolvedConfig) { config = value; },
      async buildStart() { sources = await buildSourceFingerprint(repositoryRoot); },
      async writeBundle() {
        const current = await buildSourceFingerprint(repositoryRoot);
        if (current.hash !== sources.hash) throw new Error('Compilation inputs changed during the build.');
        const publicConfiguration = Object.fromEntries(['VITE_OFFICIAL_RELAY_URL', 'VITE_ADMISSION_URL', 'VITE_TURNSTILE_SITE_KEY'].map(key => [key, config.env[key] ?? null]));
        await writeFile(path.resolve(config.root, config.build.outDir, 'build-source.json'), JSON.stringify({ schemaVersion: 1, sourceHash: sources.hash, publicConfiguration }, null, 2) + '\n');
      },
    };
  })()],
  optimizeDeps: {
    include: ['uuid', 'seedrandom', 'zod'],
  },
  resolve: {
    alias: [{ find: '@simagents/engine', replacement: engineSrc }],
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
});
