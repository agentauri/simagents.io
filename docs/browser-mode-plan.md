# Browser Mode Architecture v2

> **Status:** CURRENT architecture description for the browser-only product.
> This supersedes the old migration plan and its tick-engine assumption.

## Current Decisions

Sim Agents now ships a browser-local mode as the primary product:

- The app can run as a static Vite SPA with no Fastify, PostgreSQL, Redis, BullMQ, or server-side persistence.
- `VITE_ENGINE_MODE=local` is the default. `VITE_ENGINE_MODE=remote` keeps the legacy server path available for backend development and research workflows.
- Users bring their own LLM API keys. Keys are stored only in browser `localStorage`.
- The local engine persists world state through `localStorage` snapshots and a bounded event ring, not IndexedDB.
- The only deployable backend artifact in scope is the optional stateless CORS proxy in `infra/cors-proxy/`.

Local browser state uses these keys:

- `simagents_api_keys` - BYOK provider keys.
- `simagents_agent_roster` - selected agents, providers, models, reasoning settings, colors, and personalities.
- `simagents_proxy_url` - optional CORS proxy origin.
- `simagents_world_snapshot` - versioned local world snapshot.
- `simagents_event_ring` - bounded recent event ring for UI restore.

## Runtime Layout

```text
Browser SPA
  React UI + Zustand stores
    |
    | worker protocol
    v
  apps/web/src/engine-host/worker.ts
    |
    | Vite aliases server DB/cache imports to browser-safe memory modules
    v
  apps/server/src/engine/
  apps/server/src/engine-memory/
    |
    | fetch, direct or proxied
    v
  LLM provider APIs
```

The engine still lives under `apps/server/src/engine` to preserve the shared domain code. Browser hosting is handled by `apps/web/src/engine-host`, and `apps/web/vite.config.ts` aliases `db/queries/*`, `ledger`, `cache/*`, `world/scent`, `simulation/shocks`, `db/index`, and Node `crypto` to browser-safe replacements. This keeps action handlers and engine modules import-compatible while preventing PostgreSQL, Redis, BullMQ, and Node-only modules from entering the web bundle.

## Continuous-Time Engine

The browser engine is not the legacy fixed tick engine. It uses a tickless continuous-time model:

- `SimClock` owns `simTimeMs`, speed, pause state, and tick projection through `tickFromSimTime(simTimeMs)`.
- `TICK_MS` remains `60_000` for compatibility, so ticks are a derived reporting unit.
- A 250ms wall-clock interval advances simulation time by `wallDeltaMs * speed`.
- Each live agent has an independent async `AgentRunner` loop.
- Runners wait while paused, materialize vitals lazily, observe the world, ask a decision provider, then submit an action intent.
- `ActionExecutor` serializes action application so concurrent agent decisions cannot race the in-memory store.
- Successful actions set `busyUntil` from action durations such as move distance, gather, work, sleep, trade, consume, harm, steal, and default durations.
- Housekeeping runs when enough simulated time has elapsed and emits `minute_elapsed` events with `{ tick, simTimeMs }`.

Model latency is part of the simulation. Agents that spend longer waiting for provider decisions act less often while hunger, energy, resource regeneration, currency decay, reproduction checks, and other continuous processes keep moving. Speed and reasoning settings therefore become survival traits, not just UI preferences.

## LLM Catalog And Reasoning

Provider/model metadata lives in `packages/shared/src/llm-catalog.ts` and drives both UI configuration and request construction.

Providers are split by CORS mode:

- Direct: Claude and Gemini.
- Proxy: OpenAI, DeepSeek, Qwen, GLM, Grok, Mistral, MiniMax, and Kimi.

Reasoning controls are provider-specific:

- Effort levels for OpenAI and Grok.
- Token budgets for Claude and Gemini.
- Toggle fields for Qwen, GLM, and Kimi.
- Model-swap reasoning for DeepSeek and Mistral.
- No reasoning control for models that do not expose one.

`apps/server/src/engine/llm/request-builder.ts` is the source of truth for provider request shape. For proxied providers it builds:

```text
<proxy-url>/<provider-host>/<path>
```

## Persistence And Export

Local persistence is intentionally compact:

- The worker serializes snapshots with `apps/server/src/engine/persistence.ts`.
- The main thread owns `localStorage` writes in `apps/web/src/services/persistence.ts`.
- Snapshots include world state, agents, resources, shelters, inventory, events needed for agent observation, social/economic/puzzle state, engine metadata, and heartbeat metadata.
- The snapshot embeds only a capped event slice because LLM decision payloads can be large.
- The UI stores a separate recent event ring capped at 1000 events.
- On quota pressure, the event ring is dropped first and the world snapshot is retried.
- If the snapshot itself exceeds quota, persistence pauses and the UI reports the warning.
- Export downloads a JSON file containing the snapshot plus available events; import writes that file back into local storage for resume.

Known persistence tradeoff: snapshots store the world seed, but not exact per-agent RNG stream positions. After a reload, probabilistic choices can diverge from an uninterrupted run.

## CORS Proxy

The stateless proxy lives in `infra/cors-proxy/` and is code only. It is not deployed by this repo.

Privacy contract:

- No storage, KV, Durable Object, queue, cache, analytics, or retention.
- No logging of keys, prompts, payloads, responses, or request headers.
- Host allow-list only.
- Forward only `Authorization`, `x-api-key`, `anthropic-version`, and `content-type`.
- Add permissive CORS response headers and answer preflight with 204.

Allowed provider hosts:

- `api.openai.com`
- `api.deepseek.com`
- `dashscope-intl.aliyuncs.com`
- `api.z.ai`
- `api.x.ai`
- `api.mistral.ai`
- `api.minimax.io`
- `api.moonshot.ai`

Users self-host it with Wrangler and paste the Worker origin into the Config panel proxy URL field, which persists as `simagents_proxy_url`.

## Dropped From Browser Mode

These systems are not active in local browser mode:

- A2A external-agent registration and callbacks.
- Server-side experiments and scientific run orchestration.
- Server-side analytics and SQL aggregation.
- Prompt logging and server-side LLM cache.
- Multi-tenancy, admin API auth, Redis pub/sub, BullMQ queueing, and PostgreSQL projections.

The code remains in git and can still be used through remote mode or revived later for offline/export analysis.

## Remaining Known Limitations

- RNG streams restart from the world seed on resume, so random sequences can diverge after reload.
- Genesis generation remains server-oriented; local mode uses roster/world seeding.
- Replay, analytics, and puzzle pages are hidden in local mode. Prompt gallery remains available.
- The dev server has an `optimizeDeps` mitigation for worker-discovered npm deps (`uuid`, `seedrandom`, `zod`) to prevent the first simulation start from triggering Vite dep re-optimization and a full-page reload. Keep that comment and include list in `apps/web/vite.config.ts`.
- The local storage quota policy is compact by design; long, verbose LLM runs should be exported before the browser evicts data.
- Threat model for keys: API keys live in plain `localStorage`, so XSS is the primary risk. The app injects no untrusted HTML, `apps/web/index.html` defines a defensive CSP, and [BYOK Security Notes](security-byok.md) documents the review checklist. Optional at-rest encryption (Web Crypto + passphrase) remains future hardening, not XSS protection.
- Deferred cleanup: the legacy server still exposes the admin-authed `/api/llm/keys*` routes used by the old key-sync flow. They are inert in local mode (the browser no longer calls them) and should be removed together with the rest of the server archive pass.
