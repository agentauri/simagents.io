# CLAUDE.md

This file provides guidance to AI coding assistants when working with this repository.

## Project Overview

Sim Agents is a browser-only multi-agent simulation. The user opens the Vite app, configures a roster, brings optional LLM API keys, and runs a continuous-time agent world inside a Web Worker. Application state is stored in bounded browser `localStorage`; long artifacts are exported as JSON or CSV.

There is no product backend path. Do not add route handlers, database clients, queues, auth enforcement, tenancy, or server-side control flows unless the user explicitly asks for a separate experimental artifact.

## Core Philosophy

Always distinguish:

- **Imposed infrastructure:** grid world, movement physics, event logging, identity, survival pressure, health, resources, biomes, seasonal cycles, currency.
- **Emergent behavior:** movement patterns, trade conventions, reputation, trust, social structures, property conventions, laws, morality.

Rule: validate physics, not morality. Do not add centralized reputation, crime tracking, or justice systems.

## Architecture

```text
apps/web/
  src/engine-host/        # Worker entrypoint and main-thread client
  src/services/           # localStorage persistence, replay, prompt logs, experiments
  src/stores/             # Zustand state
  src/components/         # UI
packages/engine/
  src/actions/            # Action handlers and types
  src/engine/             # SimEngine, runner, executor, persistence
  src/engine-memory/      # Browser-local store, queries, bus, projections
  src/llm/                # Prompt construction and response parsing
  src/config/             # Runtime config and worker overrides
packages/shared/
  src/llm-catalog.ts      # Provider/model/reasoning catalog
```

## Commands

```bash
bun dev:web
bun typecheck
bun lint
bun build
(cd apps/web && bun run build)
node --check scripts/browser-smoke.mjs
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

Bundle safety check after build:

```bash
rg -n "fastify|postgres|redis|bullmq|drizzle|@server|/api/|EventSource" apps/web/dist
```

Passing state is no output.

## Local Storage Keys

- `simagents_api_keys`
- `simagents_agent_roster`
- `simagents_proxy_url`
- `simagents_world_snapshot`
- `simagents_event_ring`
- `simagents_custom_prompt`
- `simagents_replay_frames_v1`
- `simagents_prompt_logs_v1`
- `simagents_experiment_defs_v1`
- `simagents_experiment_runs_v1`

All new keys must be versioned, validated on read, bounded by byte/count budget, and clearable/exportable where user data could become large.

## Worker Interfaces

The main-thread client in `apps/web/src/engine-host/engine-client.ts` is the public control boundary. Add browser features there instead of inventing HTTP-shaped interfaces.

Current worker capabilities include:

- world init/start/pause/resume/reset/snapshot/export
- runtime config and custom prompt application
- local replay range/frame/agent timeline
- local puzzle list/details/results/stats
- local prompt log consumption
- browser experiment run/cancel/status/export
- browser agent adapter registration

## Adding Actions

1. Add or update the handler in `packages/engine/src/actions/handlers/`.
2. Add the action type in `packages/engine/src/actions/types.ts`.
3. Register it in the action dispatcher.
4. Keep cross-entity mutations in browser-local query modules or engine helpers.
5. Add focused tests under `packages/engine` when the behavior is shared or stateful.

## Adding LLM Providers

1. Update `packages/shared/src/llm-catalog.ts`.
2. Update request construction in `packages/engine/src/engine/llm/request-builder.ts`.
3. If the provider cannot be called directly from the browser, mark it proxy-only and rely on the user-configured proxy URL.
4. Keep keys out of logs, snapshots, replay frames, prompt logs, and exports.

## Documentation

- `docs/browser-mode-plan.md` - current browser-only architecture
- `docs/testing.md` - verification gates
- `docs/security-byok.md` - browser key storage and XSS posture
- `docs/public/research-guide.md` - browser experiment posture
- `docs/PRD.md` - historical requirements

All project artifacts should be in English.
