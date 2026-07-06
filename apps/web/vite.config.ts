import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const engineSrc = fileURLToPath(new URL('../../packages/engine/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
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
