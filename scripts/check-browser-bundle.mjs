import { readdir, readFile } from 'node:fs/promises';
const root = new URL('../apps/web/dist/', import.meta.url);
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) await scan(new URL(`${entry.name}/`, directory));
    else if (/\.(?:js|html)$/.test(entry.name)) {
      const content = await readFile(path, 'utf8');
      // Vendor endpoints legitimately include /api/ (OpenRouter and Z.ai).
      if (/\b(?:fastify|postgres|redis|bullmq|drizzle)\b|@server|new EventSource|fetch\(\s*["']\/api\//.test(content)) {
        throw new Error(`Backend-only surface detected in ${path.pathname}`);
      }
    }
  }
}
await scan(root);
console.log('Browser bundle dependency/control-plane check passed.');
