# SimAgents Roadmap

> Last updated: 2026-07-07

## Current Status

SimAgents is a **browser-only** multi-agent simulation. There is no backend:

- Vite SPA starts without a server.
- The simulation engine runs entirely in a Web Worker.
- Users configure a local roster and bring their own API keys (BYOK).
- World state persists through versioned `localStorage` snapshots plus a bounded event ring.
- An optional user-configured CORS proxy supports providers that do not allow direct browser calls.

The former server platform (Fastify, PostgreSQL, Redis, external-agent APIs) has been
**removed** from the repository. There is no `apps/server`, no `VITE_ENGINE_MODE`, and no
remote engine path. See `docs/browser-mode-plan.md` for the authoritative architecture.

## Browser Pivot Progress

The pivot is complete. All runtime surfaces run locally.

| Phase | Area | Status |
|-------|------|--------|
| 0 | In-memory store and backend-agnostic handlers | Complete |
| 1a | Continuous-time engine foundations | Complete |
| 1b | Per-agent async loops and serialized execution | Complete |
| 2 | Browser LLM layer, BYOK keys, reasoning controls | Complete |
| 3 | Web Worker hosting and roster UI | Complete |
| 4 | `localStorage` persistence, resume, export/import | Complete |
| 5 | CORS proxy support, schema drift fixes, docs v2 | Complete |
| 6 | Backend removal, browser-only CI, release checklist | Complete |

## What Works Now

- Browser-local simulation with no PostgreSQL, Redis, Docker, or Fastify requirement.
- Baseline agents (random / rule / sugarscape / q-learning) run without API keys.
- Live LLM agents use browser-local BYOK keys stored in `simagents_api_keys`.
- Roster entries persist in `simagents_agent_roster`.
- Snapshots persist in `simagents_world_snapshot`; recent UI events persist in `simagents_event_ring`.
- Resume/new-world choice is visible at startup; export/import moves a saved world between machines.
- Proxy-required providers use the user-configured proxy URL in `simagents_proxy_url`.
- Analytics, time-travel replay, puzzle games, prompt editor/inspector, and browser experiments
  all run locally and are exercised by the browser smoke test.

## Verification Gates

From a clean checkout (see `docs/browser-only-release-checklist.md` and `docs/testing.md`):

```bash
bun run typecheck
bun run --filter @simagents/engine test
(cd apps/web && bun run build)
```

Bundle safety check (expects no output — no backend leakage in the built app):

```bash
rg -n "fastify|postgres|redis|bullmq|drizzle|@server|/api/|EventSource" apps/web/dist
```

Browser smoke test against a running dev server:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

The smoke test covers baseline start, pause/resume, reload/resume, export/import,
missing-proxy UI state, local analytics/replay/puzzles/prompt surfaces, browser
experiments, and mocked direct/proxied LLM requests. CI (`.github/workflows/ci.yml`)
runs typecheck, engine tests, web build, and the browser smoke on every PR.

## Known Limitations

1. **API keys are plain `localStorage` values.** XSS is the main threat. Future UI changes
   must avoid rendering untrusted HTML and should preserve the CSP/security guidance
   (`docs/security-byok.md`).
2. **RNG streams are not snapshotted.** Resume keeps world seed, clock, state, and engine
   metadata, but per-agent probabilistic sequences can diverge after reload.
3. **Local storage quota is finite.** Long verbose LLM runs can exceed browser quota;
   event-ring degradation and export are the current mitigation.
4. **Thin automated coverage.** Only the engine package has unit tests today; `apps/web`
   and `packages/shared` rely on typecheck plus the browser smoke test.

## Next Work

1. Collapse legacy `db/` and `cache/` naming shims in `packages/engine` into the
   `engine-memory` modules they re-export (deferred; touches many imports).
2. Snapshot per-agent RNG streams so resumed runs are deterministic.
3. Expand engine/action unit coverage (action handlers, executor, agent-runner, roster/LLM).
4. Evaluate optional passphrase encryption for browser-local BYOK as local-device hardening.
5. Produce deterministic local run bundles before treating browser-local exports as
   research artifacts.
