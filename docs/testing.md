# Testing Matrix

Use browser-safe gates for normal SimAgents work.

## Required Static Gates

```bash
bun typecheck
(cd apps/web && bun run build)
node --check scripts/browser-smoke.mjs
```

Bundle safety check after the web build:

```bash
rg -n "fastify|postgres|redis|bullmq|drizzle|@server|/api/|EventSource" apps/web/dist
```

Passing state is no output.

## Browser Smoke

With a dev server running:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

The smoke gate should cover:

- start, pause, resume, reset
- import/export world
- BYOK and proxy config
- local analytics
- local replay
- local puzzles
- custom prompt apply/reset
- local prompt inspector
- small browser experiment run/export
- localStorage quota fallback behavior

## Focused Engine Tests

Prefer focused tests under `packages/engine` for:

- action handlers
- vitals and housekeeping
- persistence serialize/hydrate
- replay frame derivation
- puzzle selectors
- prompt log shaping
- browser experiment summaries

## Security Audit

Before merging any feature that displays model output, imported data, or proxy responses:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|eval\\(|new Function|document\\.write|DOMParser" apps/web/src apps/web/index.html packages/engine/src packages/shared/src
```

Expected result: no unsafe rendering sinks.
