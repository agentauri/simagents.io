import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const serverSrc = fileURLToPath(new URL('../server/src', import.meta.url));
const webSrc = fileURLToPath(new URL('./src', import.meta.url));

const queryModules = [
  'agents',
  'beliefs',
  'claims',
  'credentials',
  'employment',
  'events',
  'gossip',
  'inventory',
  'knowledge',
  'memories',
  'naming',
  'puzzles',
  'reproduction',
  'roles',
  'world',
] as const;

const serverFile = (path: string) => `${serverSrc}/${path}.ts`;
const webFile = (path: string) => `${webSrc}/${path}.ts`;
const relativeServerImport = (path: string) =>
  new RegExp(`^(?:\\.\\.\\/)+${path.replace(/\//g, '\\/')}$`);

const engineAliases = [
  ...queryModules.flatMap((moduleName) => {
    const source = `db/queries/${moduleName}`;
    const target = `engine-memory/queries/${moduleName}`;
    return [
      { find: serverFile(source), replacement: serverFile(target) },
      { find: relativeServerImport(source), replacement: serverFile(target) },
    ];
  }),
  { find: serverFile('ledger/index'), replacement: serverFile('engine-memory/ledger') },
  { find: `${serverSrc}/ledger`, replacement: serverFile('engine-memory/ledger') },
  { find: relativeServerImport('ledger'), replacement: serverFile('engine-memory/ledger') },
  { find: relativeServerImport('ledger/index'), replacement: serverFile('engine-memory/ledger') },
  { find: serverFile('cache/projections'), replacement: serverFile('engine-memory/projections') },
  { find: relativeServerImport('cache/projections'), replacement: serverFile('engine-memory/projections') },
  { find: serverFile('cache/pubsub'), replacement: serverFile('engine-memory/bus') },
  { find: relativeServerImport('cache/pubsub'), replacement: serverFile('engine-memory/bus') },
  { find: `${serverSrc}/cache`, replacement: webFile('engine-host/stubs/cache') },
  { find: serverFile('cache/index'), replacement: webFile('engine-host/stubs/cache') },
  { find: relativeServerImport('cache'), replacement: webFile('engine-host/stubs/cache') },
  { find: relativeServerImport('cache/index'), replacement: webFile('engine-host/stubs/cache') },
  { find: serverFile('world/scent'), replacement: serverFile('engine-memory/scent') },
  { find: relativeServerImport('world/scent'), replacement: serverFile('engine-memory/scent') },
  { find: serverFile('simulation/shocks'), replacement: webFile('engine-host/stubs/shocks') },
  { find: relativeServerImport('simulation/shocks'), replacement: webFile('engine-host/stubs/shocks') },
  // Regression insurance: no registered handler imports the raw db client,
  // but if one ever does, the bundle must never pull the real Postgres pool.
  { find: serverFile('db/index'), replacement: webFile('engine-host/stubs/db') },
  { find: `${serverSrc}/db`, replacement: webFile('engine-host/stubs/db') },
  { find: relativeServerImport('db'), replacement: webFile('engine-host/stubs/db') },
  { find: relativeServerImport('db/index'), replacement: webFile('engine-host/stubs/db') },
  { find: 'crypto', replacement: webFile('engine-host/stubs/crypto') },
];

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // The browser engine is first loaded from a Worker. Prebundle the npm deps
    // reachable only through that graph so Vite does not discover them on first
    // simulation start and force a full-page reload.
    include: ['uuid', 'seedrandom', 'zod'],
  },
  resolve: {
    alias: [
      { find: '@server', replacement: serverSrc },
      ...engineAliases,
    ],
  },
  server: {
    port: 5173,
    host: true, // Allow external connections (for remote testing)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
});
