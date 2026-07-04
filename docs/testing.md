# Testing Matrix

Do not run plain `bun test` from the repository root for browser-pivot work. The repository contains both browser-safe local-engine suites and DB/Redis-backed server suites.

## Browser-Local Gates

Use these for product work in local mode:

```bash
bun typecheck
(cd apps/web && bun run build)
(cd apps/server && bun test src/__tests__/engine/ src/__tests__/engine-memory/)
(cd apps/server && bun test src/__tests__/llm/prompt-builder.test.ts)
```

After a web build, check that the browser bundle did not pull server infrastructure into local mode:

```bash
grep -l "PostgresError\\|ioredis\\|bullmq\\|drizzle" apps/web/dist/assets/*.js
```

Passing state for that grep is no output.

## Browser Smoke

With `bun dev:web` running:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

The smoke covers:

- baseline start/pause
- reload/resume
- export/import
- supported local config overrides
- missing-proxy UI state
- mocked direct LLM request
- mocked proxied LLM request

## Security Audit

For BYOK or model-output UI work, run:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|eval\\(|new Function|document\\.write|DOMParser" apps/web/src apps/web/index.html apps/server/src packages/shared/src
```

Expected result is no matches unless the change is deliberately introducing a reviewed, sanitized HTML path.

## Remote/Research Gates

Use DB/Redis-backed suites only when working on remote mode, experiments, queues, analytics, replay, tenancy, or server routes:

```bash
(cd apps/server && bun test src/__tests__/actions src/__tests__/agents src/__tests__/analytics src/__tests__/cache src/__tests__/crypto src/__tests__/db src/__tests__/experiments src/__tests__/integration src/__tests__/llm src/__tests__/queue src/__tests__/simulation src/__tests__/world)
```

If PostgreSQL, Redis, Docker, or networked services are unavailable, report the exact connection failure. Do not collapse connection-only failures into an ambiguous test failure.
