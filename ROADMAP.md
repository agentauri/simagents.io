# SimAgents Roadmap

> Last updated: 2026-07-03

## Current Status

The active product path is **browser-local Sim Agents**:

- Vite SPA starts without a backend.
- The simulation engine runs in a Web Worker.
- Users configure a local roster and bring their own API keys.
- World state persists through versioned `localStorage` snapshots plus a bounded event ring.
- An optional stateless CORS proxy supports providers that do not allow direct browser calls.

The legacy server platform remains in the repository for `VITE_ENGINE_MODE=remote`, DB-backed research workflows, external-agent APIs, and experiment tooling.

## Browser Pivot Progress

| Phase | Area | Status |
|-------|------|--------|
| 0 | In-memory store and backend-agnostic handlers | Complete |
| 1a | Continuous-time engine foundations | Complete |
| 1b | Per-agent async loops and serialized execution | Complete |
| 2 | Browser LLM layer, BYOK keys, reasoning controls | Complete |
| 3 | Web Worker hosting and roster UI | Complete |
| 4 | `localStorage` persistence, resume, export/import | Complete |
| 5 | Stateless CORS proxy, schema drift fixes, docs v2 | Complete |
| 6 | Product hardening and public docs alignment | Mostly complete |

## What Works Now

### Local Product

- Browser-local simulation with no PostgreSQL, Redis, Docker, or Fastify requirement.
- Baseline agents run without API keys.
- Live LLM agents use browser-local BYOK keys stored in `simagents_api_keys`.
- Roster entries persist in `simagents_agent_roster`.
- Snapshots persist in `simagents_world_snapshot`; recent UI events persist in `simagents_event_ring`.
- Resume/new-world choice is visible at startup.
- Export/import moves a saved world between browsers or machines.
- Proxy-required providers can use the self-hosted artifact under `infra/cors-proxy/`.

### Remote/Research Surface

- Fastify routes, PostgreSQL, Redis, replay, analytics, external-agent APIs, and experiment runner remain available in remote mode.
- Research docs continue to distinguish `canonical_core`/deterministic-baseline claims from exploratory full-platform runs.
- DB-backed tests are meaningful only when local PostgreSQL/Redis are available.

## Current Verification Gates

Use these for browser-pivot work:

```bash
bun typecheck
(cd apps/web && bun run build)
(cd apps/server && bun test src/__tests__/engine/ src/__tests__/engine-memory/)
(cd apps/server && bun test src/__tests__/llm/prompt-builder.test.ts)
```

Optional browser smoke test against a running dev server:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

The smoke test covers baseline start, pause/resume, reload/resume, export/import, missing-proxy UI state, and mocked direct/proxied LLM requests.

## Known Limitations

1. **API keys are plain `localStorage` values.** XSS is the main threat. Future UI changes must avoid rendering untrusted HTML and should preserve the CSP/security guidance.
2. **RNG streams are not snapshotted.** Resume keeps world seed, clock, state, and engine metadata, but probabilistic sequences can diverge after reload.
3. **Local storage quota is finite.** Long verbose LLM runs can exceed browser quota; event-ring degradation and export are the current mitigation.
4. **Some pages are hidden in local mode.** Replay, analytics, and puzzle pages are still remote/server-oriented.
5. **Public docs are being realigned.** Older PRD/experiment docs still describe the full server-backed platform.
6. **Legacy server cleanup is deferred.** Admin key sync routes, DB-backed experiment handlers, and broad DB/Redis tests still belong to the remote/research surface.

## Next Work

1. Add CI coverage for the browser smoke path where a browser runtime is available.
2. Decide whether replay/analytics/puzzles should be ported to exported local snapshots or stay remote-only.
3. Archive or remove legacy `/api/llm/keys*` sync routes if remote mode no longer needs them.
4. Evaluate optional passphrase encryption for browser-local BYOK as local-device hardening.
5. Add deterministic local run bundles before treating browser-local exports as research artifacts.

## Historical Platform Phases

The repository still contains the earlier full-platform implementation:

- Phase 0: Kernel/MVP simulation
- Phase 1: Emergence observation
- Phase 2: Social complexity
- Phase 3: External agents
- Phase 4: credentials, gossip, reproduction, LLM optimization
- Phase 5: research platform
- Phase 6: employment system
- Phase 7: cooperative puzzle game
- Phase 8: OAuth/user authentication

Those systems are not all active in browser-local mode, but they remain useful as remote-mode/research assets or as code to selectively port.
