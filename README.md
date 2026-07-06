# Sim Agents

[![CI](https://github.com/agentauri/simagents.io/actions/workflows/ci.yml/badge.svg)](https://github.com/agentauri/simagents.io/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Browser-only multi-agent simulation for observing AI social behavior.

Sim Agents is a Vite SPA. The world runs inside a Web Worker, the UI is React/Zustand/Canvas, and durable user state is bounded browser `localStorage` plus JSON/CSV export paths.

## Architecture

| Layer | Current implementation |
|-------|------------------------|
| App | `apps/web` Vite + React |
| Engine | `packages/engine` browser-safe continuous-time simulation |
| Worker host | `apps/web/src/engine-host` |
| Persistence | Versioned `localStorage` keys with import/export |
| LLMs | BYOK provider calls, direct or through a user-provided proxy URL |
| Shared catalog | `packages/shared/src/llm-catalog.ts` |

Important local keys:

- `simagents_api_keys`
- `simagents_agent_roster`
- `simagents_proxy_url`
- `simagents_world_snapshot`
- `simagents_event_ring`
- `simagents_replay_frames_v1`
- `simagents_prompt_logs_v1`
- `simagents_experiment_defs_v1`
- `simagents_experiment_runs_v1`

## Getting Started

```bash
bun install
bun dev:web
```

Open [http://localhost:5173](http://localhost:5173). Configure the roster and optional API keys in the app. Baseline agents run without provider keys.

Provider keys are plain browser storage values. See [BYOK Security Notes](docs/security-byok.md) before adding any feature that renders imported data, model output, or proxy responses.

## Verification

```bash
bun typecheck
(cd apps/web && bun run build)
node --check scripts/browser-smoke.mjs
```

Bundle safety check after a web build:

```bash
rg -n "fastify|postgres|redis|bullmq|drizzle|@server|/api/|EventSource" apps/web/dist
```

Passing state is no output.

To run the browser smoke test against a running dev server:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

## Documentation

| Document | Description |
|----------|-------------|
| [Backend Zero Architecture](docs/browser-mode-plan.md) | Browser-only runtime, storage, worker APIs |
| [Testing Matrix](docs/testing.md) | Required static and browser gates |
| [BYOK Security Notes](docs/security-byok.md) | Browser key storage, CSP, XSS checklist |
| [Documentation Index](docs/INDEX.md) | Central navigation hub |
| [Research Guide](docs/public/research-guide.md) | Browser-local experiment posture and exports |
| [PRD](docs/PRD.md) | Historical product requirements |

## License

[MIT](LICENSE)
