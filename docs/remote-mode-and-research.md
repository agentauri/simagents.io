# Remote Mode and Research Boundary

Browser-local mode is the active product path. Remote mode remains in the repository for backend API development, external agents, DB-backed replay/analytics, and server-side research workflows.

## Mode Split

| Area | Browser-local product | Remote/research surface |
|------|-----------------------|-------------------------|
| Runtime | Vite SPA + Web Worker | Fastify server |
| State | In-memory engine + browser `localStorage` snapshots | PostgreSQL, Redis, BullMQ, server projections |
| Control | `apps/web/src/hooks/useWorldControl.ts` talks to the worker | `apps/web/src/hooks/useWorldControl.ts` calls `/api/world/*` |
| Realtime | Worker events via `postMessage` | SSE from the backend |
| Keys | BYOK keys in browser `localStorage` | Legacy admin-authed key APIs and server-side key services |
| Experiments | Interactive exploration only | Experiment DSL, batch runner, research bundles |
| Replay/analytics/puzzles pages | Hidden in local mode | Available in remote mode |

Use `VITE_ENGINE_MODE=local` unless a task explicitly needs the server surface.

Use `VITE_ENGINE_MODE=remote` when working on:

- external HTTP agent APIs
- replay endpoints and replay UI
- analytics endpoints and SQL aggregation
- cooperative puzzle routes and DB-backed puzzle views
- prompt inspector server logging
- experiment DSL, scenario APIs, research bundles, and claim-classed reports
- auth, tenancy, admin, queues, Redis pub/sub, and PostgreSQL migrations

## Web Routing Boundary

`apps/web/src/App.tsx` treats these modes as remote-only:

- `analytics`
- `replay`
- `puzzles`

When the app is running in local mode and one of those modes is selected, it returns to `simulation` if a world exists or `editor` otherwise. The prompt gallery remains visible in local mode, but server-backed prompt inspector tabs are hidden inside `PromptsPage`.

## Config Boundary

Local mode exposes:

- LLM API keys
- proxy URL
- agent roster
- local agent default values
- local needs decay values
- persistence/export/import state

Local mode does not fetch `/api/config`. When starting a local world, only supported local runtime overrides are passed to the worker:

- `agent`
- `needs`

Remote/server-era overrides such as `actions`, `economy`, `experiment`, `llmCache`, `cooperation`, and `spoilage` are ignored by the local worker path unless they are deliberately ported and exposed in the local UI.

## Server Routes

Remote/server route files live under `apps/server/src/routes/`:

| Route file | Surface |
|------------|---------|
| `config-api.ts` | Remote config/admin controls |
| `experiments-api.ts` | Server-side experiment runs and variants |
| `llm-cache.ts` | Server-side LLM cache controls |
| `llm-keys-api.ts` | Legacy admin-authed key sync APIs |
| `prompt-api.ts` | Server prompt sync and prompt management |
| `prompt-inspector-api.ts` | Server-side prompt logging/inspection |
| `puzzles-api.ts` | DB-backed puzzle views and results |
| `scenarios-api.ts` | Server-side scenario/shock APIs |
| `tenants.ts` | Multi-tenant/admin APIs |

Do not import these route handlers into browser-local code.

## Porting Rule

When porting a remote feature into local mode:

1. Move only browser-safe domain logic into `apps/server/src/engine/`, `apps/server/src/engine-memory/`, or `packages/shared/`.
2. Keep DB, Redis, filesystem, queue, and server auth dependencies behind remote-only files.
3. Add or update Vite aliases only for browser-safe modules.
4. Expose a local UI control only after the worker receives and applies the value through a typed local path.
5. Update `docs/testing.md` with the correct verification gate.

## Current Deferred Cleanup

- Archive or delete legacy `/api/llm/keys*` sync routes once remote mode no longer needs them.
- Decide whether replay/analytics/puzzles should be ported to exported local snapshots or stay remote-only.
- Keep research claim docs tied to the server-side experiment runner until the browser-local path has deterministic run bundles.
