# Browser-Only Release Checklist

Prepared: July 6, 2026.

This checklist is for the first Backend Zero release candidate: SimAgents as a browser-only SPA with no product backend, no remote engine mode, and no product-owned proxy.

## Scope

Release scope:

- Vite React app in `apps/web`
- Browser-safe runtime in `packages/engine`
- Shared provider catalog in `packages/shared`
- Web Worker runtime boundary in `apps/web/src/engine-host`
- Bounded `localStorage` persistence with JSON/CSV exports for long runs

Out of scope:

- Fastify routes, REST API contracts, and remote SSE
- PostgreSQL, Redis, BullMQ, Drizzle migrations, and backend queues
- Product auth, tenancy, admin enforcement, and product-owned LLM proxy hosting
- Docker infrastructure for the removed backend

## Required Gates

Run these from a clean checkout before tagging:

```bash
bun typecheck
bun run --filter @simagents/engine test
(cd apps/web && bun run build)
node --check scripts/browser-smoke.mjs
```

After the web build, run the bundle safety check:

```bash
rg -n "fastify|postgres|redis|bullmq|drizzle|@server|/api/|EventSource" apps/web/dist
```

Passing state is no output.

For the full browser smoke, start the web app and run:

```bash
bun dev:web
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

CI must be green on `main` for:

- Lint & Typecheck
- Engine Tests
- Build Web
- Browser Smoke
- CI Success

## Manual QA

Before publishing a release, verify the app in a browser with an empty origin storage profile:

- start, pause, resume, speed change, and reset
- roster editing and baseline-agent run without provider keys
- optional BYOK keys and optional user proxy URL persistence
- world import/export and localStorage quota warning path
- local analytics render after a short run
- replay range/frame/timeline render from `simagents_replay_frames_v1`
- active, completed, and expired puzzles render without revealing unfinished answers
- custom prompt apply/reset and runtime config apply/discard
- prompt inspector log view, clear, and export behavior
- small browser experiment run plus JSON/CSV export
- browser agent adapter registration with a fallback/local adapter

## Release Notes Draft

### Added

- Browser-safe `@simagents/engine` package for the simulation runtime.
- Browser-local replay, puzzles, prompt inspection, experiments, and analytics.
- Versioned local persistence keys for replay frames, prompt logs, and experiment runs.
- Focused engine tests for vitals math, world snapshot persistence, and puzzle query behavior.
- CI browser smoke gate that runs against a local Vite server.

### Changed

- The web app now imports the engine package instead of any backend module path.
- Runtime config, custom prompts, BYOK keys, proxy URL, world state, and experiment outputs are local browser concerns.
- Documentation now treats backend/API plans as legacy context.

### Removed

- Backend application, backend CI jobs, server dependency automation, and backend route/API product surface.
- PostgreSQL/Redis/BullMQ/Drizzle runtime requirements.
- Remote engine mode, server-sent event client paths, product auth/tenancy/admin surfaces, and product-owned proxy infrastructure.

### Known Limits

- Durable state uses bounded `localStorage`; long experiments should be exported.
- Provider keys are browser-stored BYOK values. Users should prefer a proxy they control when a provider does not allow browser calls.
- Replay frames and prompt logs are capped to stay within browser quota.
- GitHub Actions may show Node 20 deprecation annotations for third-party action runtimes even though project jobs set `NODE_VERSION` to 24.

## Tagging

Do not create a tag or GitHub release until all required gates pass on `main` and manual QA has been checked off. Suggested tag shape for the first browser-only release is `browser-zero-YYYYMMDD` unless the project decides on semantic versioning first.
