# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**Sim Agents** is now primarily a browser-local multi-agent simulation. The user opens the Vite app, configures a roster, brings their own LLM API keys, and runs a continuous-time agent world inside a Web Worker. No backend is required in local mode, and application data is stored in the browser only.

The legacy Fastify/PostgreSQL/Redis/BullMQ backend still exists for `VITE_ENGINE_MODE=remote`, research workflows, and server development. Treat browser-local mode as the active product path unless the task explicitly targets remote mode.

Key differentiators:

- **Browser-local BYOK:** LLM keys, roster, proxy URL, world snapshots, and event ring live in `localStorage`.
- **Continuous-time engine:** `simTimeMs` advances in a worker; each agent runs an async decision loop; action application is serialized.
- **Radical emergence:** The system validates physics and survival pressure, not morality or centralized social rules.
- **Provider catalog:** Shared model/reasoning metadata drives UI roster controls and provider request construction.

## Browser Mode (Local)

Run local mode:

```bash
bun dev:web
```

Open `http://localhost:5173`. No server, PostgreSQL, Redis, or Docker service is required for local mode.

Mode flag:

```bash
VITE_ENGINE_MODE=local   # default, Web Worker engine
VITE_ENGINE_MODE=remote  # legacy backend/SSE mode
```

Important browser storage keys:

- `simagents_api_keys`
- `simagents_agent_roster`
- `simagents_proxy_url`
- `simagents_world_snapshot`
- `simagents_event_ring`

Engine layout:

- `apps/web/src/engine-host/` hosts the worker and main-thread client.
- `apps/server/src/engine/` contains the browser-safe continuous-time engine.
- `apps/server/src/engine-memory/` replaces DB/cache/ledger/projection behavior for local mode.
- `apps/web/vite.config.ts` aliases legacy server imports to browser-safe memory/stub modules.
- `packages/shared/src/llm-catalog.ts` is the provider/model/reasoning catalog.
- `apps/server/src/engine/llm/request-builder.ts` builds direct and proxied provider requests.

CORS proxy:

- Code and self-hosting docs are in `infra/cors-proxy/`.
- The app reads the proxy origin from the Config panel and stores it in `simagents_proxy_url`.
- The proxy is stateless and allow-lists only catalog providers with `cors: 'proxy'`.

## Core Philosophy: IMPOSED vs EMERGENT

When implementing features, always distinguish:

**IMPOSED (Infrastructure):** Grid world, movement physics, event logging, agent identity, survival pressure, health system, resource distribution, biome geography, seasonal cycles, currency.

**EMERGENT (Agent-Created):** Movement patterns, trade conventions, reputation, trust, social structures, property conventions, laws, morality.

**Rule:** The system validates physics, not morality. Do not add central databases for reputation, crime tracking, or justice.

## Tech Stack

- **Runtime:** Bun + TypeScript
- **Local frontend:** React + Vite + TailwindCSS + Zustand + HTML5 Canvas + Web Worker
- **Local engine:** `apps/server/src/engine` plus `engine-memory`, bundled into the web app through Vite aliases
- **Remote backend:** Fastify + PostgreSQL (Drizzle ORM) + Redis + BullMQ
- **AI:** Claude, Gemini, OpenAI/Codex, DeepSeek, Qwen, GLM, Grok, Mistral, MiniMax, Kimi, plus baseline agents

## Commands

```bash
# Local browser mode
bun dev:web                      # Frontend only, local worker engine, localhost:5173

# Remote/server development
bun dev                          # Start all workspace dev scripts
bun dev:server                   # Backend only, localhost:3000
TEST_MODE=true bun dev:server    # Backend with fallback decisions

# Type checking and linting
bun typecheck                    # All workspaces
bun lint                         # All workspaces

# Build
bun build                        # All workspaces
(cd apps/web && bun run build)   # Web build

# Database and remote-mode infra
docker-compose up -d
bun run infra:up
bun run infra:down
bun run db:push
bun run dev:setup

# Per-agent evolution, server-side
bun run apps/server/src/evolution/orchestrator.ts --generations 10
bun run apps/server/src/evolution/orchestrator.ts --agent claude
bun run apps/server/src/evolution/orchestrator.ts --status
bun run apps/server/src/evolution/orchestrator.ts --seed 42
```

## Testing

Never run plain `bun test` from the repo root for browser-pivot work. The test suites must be split so browser-safe in-memory suites are not mixed with DB-backed suites.

The canonical split is documented in `docs/testing.md`. Run these exact verification commands when relevant:

```bash
bun typecheck

(cd apps/web && bun run build)
grep -l "PostgresError\\|ioredis\\|bullmq\\|drizzle" apps/web/dist/assets/*.js

(cd apps/server && bun test src/__tests__/engine/ src/__tests__/engine-memory/)
(cd apps/server && bun test src/__tests__/llm/prompt-builder.test.ts)

(cd apps/server && bun test src/__tests__/actions src/__tests__/agents src/__tests__/analytics src/__tests__/cache src/__tests__/crypto src/__tests__/db src/__tests__/experiments src/__tests__/integration src/__tests__/llm src/__tests__/queue src/__tests__/simulation src/__tests__/world)
```

Passing state for the bundle grep is no output.

If PostgreSQL, Redis, or Docker are unavailable in the sandbox, report the exact connection-only failures instead of treating the whole verification pass as ambiguous.

Uses `bun:test` with `describe`/`expect`:

```typescript
import { describe, expect, test } from 'bun:test';
```

## Initial Setup For Remote Mode

```bash
bun install
cp .env.example apps/server/.env
docker-compose up -d
(cd apps/server && bunx drizzle-kit push)
```

Local browser mode only needs `bun install` and `bun dev:web`.

## Project Structure

```text
apps/
  server/src/
    actions/handlers/       # Action implementations
    engine/                 # Browser-safe continuous-time engine
    engine-memory/          # In-memory store, query modules, bus, projections, ledger
    db/                     # Drizzle schema and remote-mode queries
    llm/                    # Legacy remote-mode LLM adapters and prompt code
    simulation/             # Legacy tick engine and server simulation utilities
    evolution/              # Server-side evolution workflows
    experiments/            # Server-side experiment DSL and runner
    routes/                 # Remote API route handlers
    world/                  # Grid/biome utilities
  web/src/
    engine-host/            # Worker host, client, browser stubs
    components/             # UI components
    stores/                 # Zustand stores and localStorage-backed state
    hooks/                  # Local and remote control hooks
packages/
  shared/                   # Shared types, schemas, constants, LLM catalog
infra/
  cors-proxy/               # Stateless Cloudflare Worker artifact
```

## Key Architecture Files

- `apps/web/src/engine-host/worker.ts` - Browser worker entrypoint
- `apps/web/src/engine-host/engine-client.ts` - Main-thread worker client
- `apps/web/vite.config.ts` - Browser-mode aliases and worker dep prebundle mitigation
- `apps/server/src/engine/engine.ts` - `SimEngine`, clock advancement, runner sync, housekeeping
- `apps/server/src/engine/agent-runner.ts` - Per-agent async decision loop
- `apps/server/src/engine/executor.ts` - Serialized action executor and action durations
- `apps/server/src/engine/persistence.ts` - Versioned snapshot serialize/hydrate
- `apps/server/src/engine/llm/request-builder.ts` - Provider request construction
- `apps/server/src/engine-memory/store.ts` - Browser-local in-memory store
- `apps/server/src/engine-memory/queries/` - DB-query-compatible memory modules
- `apps/web/src/services/persistence.ts` - localStorage snapshot/event-ring persistence
- `packages/shared/src/llm-catalog.ts` - Provider, model, CORS, and reasoning catalog
- `infra/cors-proxy/worker.js` - Optional stateless CORS proxy

Remote-mode files that still matter for backend work:

- `apps/server/src/index.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/simulation/tick-engine.ts`
- `apps/server/src/agents/orchestrator.ts`
- `apps/server/src/llm/prompt-builder.ts`
- `apps/server/src/analysis/experiment-analysis.ts`
- `apps/server/src/experiments/scientific-profile.ts`

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_ENGINE_MODE` | `local` | `local` uses the Web Worker engine; `remote` uses backend/SSE |
| `VITE_API_URL` | empty | Remote API base URL for backend mode |
| `TEST_MODE` | `false` | Remote mode fallback decisions instead of LLM calls |
| `TICK_INTERVAL_MS` | `60000` | Legacy remote tick interval |
| `GRID_SIZE` | `100` | World grid size |
| `DATABASE_URL` | `postgres://dev:dev@localhost:5432/simagents` | PostgreSQL connection for remote mode |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for remote mode |
| `RANDOM_SEED` | timestamp | Seed for reproducible server experiments |
| `ADMIN_API_KEY` | insecure dev default | Admin endpoints in remote mode |

See `apps/server/src/config/index.ts` for the full runtime configuration surface.

## API Authentication

Remote admin endpoints require the `X-Admin-Key` header:

```bash
curl -X POST http://localhost:3000/api/config \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"simulation": {"testMode": true}}'
```

Set `ADMIN_API_KEY` in production. The default is insecure and for development only.

## Adding New Actions

1. Create the handler in `apps/server/src/actions/handlers/`.
2. Add the type to `apps/server/src/actions/types.ts`.
3. Register it in the action dispatcher.
4. Keep handlers backend-agnostic. Put persistence and atomic cross-entity mutations in query modules or memory-compatible helpers, not raw DB/cache imports.
5. Add focused tests under `apps/server/src/__tests__/actions/` or `engine-memory/` depending on the behavior.

## Adding New LLM Providers

1. Add provider/model/reasoning metadata to `packages/shared/src/llm-catalog.ts`.
2. Update browser request construction in `apps/server/src/engine/llm/request-builder.ts`.
3. If the provider needs proxy CORS, add its exact host to `infra/cors-proxy/worker.js` and docs.
4. Keep shared schema/type unions aligned with the catalog and constants.

## Documentation

- `docs/browser-mode-plan.md` - Current browser-mode architecture
- `docs/PRD.md` - Product Requirements Document
- `docs/experiment-design-guide.md` - Research experiment guide
- `docs/literature-validation-plan.md` - Literature validation progress
- `docs/public/research-guide.md` - Research methodology guide
- `docs/public/api-reference.md` - API reference
- `ROADMAP.md` - Implementation progress

## Language Conventions

All project artifacts must be in English:

- **Code:** Variable names, function names, class names, comments, JSDoc/TSDoc
- **Commits:** Conventional Commits format, when commits are requested
- **Pull Requests:** English title and description
- **Documentation:** Markdown files, README, inline docs
