# Sim Agents

[![CI](https://github.com/agentauri/simagents.io/actions/workflows/ci.yml/badge.svg)](https://github.com/agentauri/simagents.io/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Browser-local multi-agent simulation for observing AI social behavior.

Sim Agents runs a continuous-time agent world directly in the browser. Users configure a roster, bring their own LLM API keys, and run the simulation inside a Web Worker. The local product path does not require Fastify, PostgreSQL, Redis, Docker, or server-side persistence.

The legacy backend still exists for `VITE_ENGINE_MODE=remote`, server API development, and research/experiment workflows. Treat browser-local mode as the primary product path unless you are explicitly working on remote mode.

## Current Architecture

| Layer | Current local mode |
|-------|--------------------|
| Runtime | Bun + TypeScript |
| Frontend | Vite + React + Zustand + HTML5 Canvas |
| Engine | Continuous-time Web Worker engine |
| Persistence | Browser `localStorage` snapshot + recent event ring |
| LLMs | BYOK provider calls, direct or via optional stateless CORS proxy |
| Remote/research | Fastify + PostgreSQL + Redis remain available in `remote` mode |

Local browser state uses:

- `simagents_api_keys`
- `simagents_agent_roster`
- `simagents_proxy_url`
- `simagents_world_snapshot`
- `simagents_event_ring`

## Getting Started

```bash
bun install
bun dev:web
```

Open [http://localhost:5173](http://localhost:5173). Configure the roster and API keys in the app. Baseline agents run without keys.

Some providers allow direct browser calls. Proxy-only providers require a self-hosted stateless CORS proxy; code and instructions live in [infra/cors-proxy](infra/cors-proxy).

BYOK keys are plain browser `localStorage` values. The app now ships a defensive CSP and keeps model text on React text-rendering paths; see [BYOK Security Notes](docs/security-byok.md) before adding new surfaces that display untrusted text.

## Remote/Research Mode

Use this path only when you need the legacy backend, external-agent APIs, DB-backed replay/analytics, or experiment runner workflows.

```bash
cp .env.example apps/server/.env
bun run dev:setup
bun dev
```

Remote mode uses:

- Fastify on `localhost:3000`
- PostgreSQL + Redis through Docker
- `VITE_ENGINE_MODE=remote` for the web client

## Verification

For browser-pivot work, do not run plain `bun test` from the repo root. Split browser-safe and DB-backed suites:

```bash
bun typecheck
(cd apps/web && bun run build)
(cd apps/server && bun test src/__tests__/engine/ src/__tests__/engine-memory/)
(cd apps/server && bun test src/__tests__/llm/prompt-builder.test.ts)
```

To run the browser smoke test against a running Vite dev server:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

## Documentation

| Document | Description |
|----------|-------------|
| [Browser Mode Architecture](docs/browser-mode-plan.md) | Current local-mode architecture |
| [BYOK Security Notes](docs/security-byok.md) | Browser-local key storage, CSP, and XSS checklist |
| [Remote Mode Boundary](docs/remote-mode-and-research.md) | Server/research surfaces and porting rules |
| [Testing Matrix](docs/testing.md) | Browser-local, smoke, security, and remote test gates |
| [Documentation Index](docs/INDEX.md) | Central navigation hub |
| [Roadmap](ROADMAP.md) | Current status and next work |
| [PRD](docs/PRD.md) | Historical and full-platform product requirements |
| [Experiment Design](docs/experiment-design-guide.md) | Server-side research experiment guide |
| [Scientific Framework](docs/appendix/scientific-framework.md) | Validation methodology |
| [Research Guide](docs/public/research-guide.md) | Claim posture and research workflow |
| [API Reference](docs/public/api-reference.md) | Remote/server API reference |

## License

[MIT](LICENSE)
