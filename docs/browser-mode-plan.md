# Browser-Only Mode — Migration Plan

> **Status:** Phase 0 + Phase 1 vertical spike COMPLETE (DB-free engine validated). Phase 1 proper next.
> **Decision date:** 2026-06-02
> **Goal:** Turn Sim Agents into a fully client-side application that runs entirely in the
> browser. The user opens a URL, pastes their own LLM API keys, and the whole simulation runs
> locally. **No application data is ever persisted server-side** — world state, events, keys,
> and settings live only in the browser (IndexedDB + localStorage).

## 1. Approved decisions

| Decision | Choice | Consequence |
|----------|--------|-------------|
| **Coexistence** | **Client-only pivot** | The Fastify/PostgreSQL/Redis/BullMQ backend is retired. Server-only features (multi-tenancy, scientific experiment runner, server-side analytics, prompt logging) are archived, not maintained. |
| **LLM providers** | **All providers, via a stateless CORS proxy** | Claude/OpenAI/Gemini call providers directly from the browser. The OpenAI-compatible providers (DeepSeek, Qwen, GLM, Grok, Kimi, MiniMax, Mistral) route through a minimal Cloudflare Worker that only forwards requests and adds CORS headers — it stores nothing and never retains keys. |
| **Storage** | **IndexedDB + localStorage** | World/agents/event-log → IndexedDB (async, hundreds of MB, survives event sourcing). Keys/settings → localStorage (already the case today). |

### The single remaining remote component

A **stateless CORS proxy** (Cloudflare Worker, ~50 LOC). It receives a request carrying the
user's API key in the `Authorization` header, forwards it to the real provider endpoint, and
returns the response with permissive CORS headers. It has **no database, no storage, no
logging of keys or payloads**. This preserves the "no server-side persistence" guarantee while
unlocking the non-CORS providers. CLI adapters (`claude-cli`, `codex-cli`, `gemini-cli`) are
dropped — they spawn local processes and cannot exist in a browser.

## 2. Why this is feasible (evidence from the codebase)

- **A DB-free engine already exists as proof.** `apps/server/src/evolution/runner.ts` runs a
  complete mini-simulation entirely in memory (`SimState`), no DB, no Redis. The pattern we need
  already lives in the repo.
- **Pure modules already exist.** `world/grid.ts` and `simulation/seasons.ts` have zero IO.
- **The frontend is already a passive, event-driven view.** Zustand stores consume event shapes
  via `useSSE`'s `processEvent`. If a local engine emits the *same event shapes*, the UI works
  unchanged.
- **Keys and config are already client-side.** `stores/apiKeys.ts`, `stores/promptStore.ts`, and
  `stores/config.ts` already persist to localStorage. The "bring your own key" flow is half-built.
- **`packages/shared` is Node-free** (only depends on `zod`) — usable in the browser as-is.
- **Redis/BullMQ are cleanly isolated** in `cache/` and `queue/` — replaceable behind the same
  function signatures.

### The one real obstacle

The simulation core imports the **24 Drizzle query modules** (`db/queries/*`, ~10K LOC)
**directly** — `tick-engine`, `orchestrator`, and every action handler do
`import { updateAgent } from '../../db/queries/agents'`. There is no repository abstraction.
Because we are pivoting (not running dual-mode), we exploit this coupling instead of fighting it:
**reimplement the needed query modules in-memory with identical export signatures**, so engine
code barely changes — only the implementation behind the same API swaps.

## 3. Scope: which query modules to port vs. drop

The engine's tick loop only needs a subset. Research/server features are dropped in client mode.

**PORT (in-memory + IndexedDB):**
`agents`, `world`, `events`, `inventory`, `memories`, `relationships`, `employment`,
`reproduction`, `knowledge`, `gossip`, `credentials`, `beliefs`, `roles`, `claims`, `puzzles`.

**DROP / archive (server/research only):**
`analytics` (3.4K LOC of complex SQL aggregation — not portable, not needed client-side),
`experiments`, `external-agents`, `tenant-agents`, `prompt-logs`, `llm-metrics`, `api-usage`.

> Anything dropped stays in git history and can be revived later behind an export/offline-analysis
> path if needed. Client-side analytics, if wanted, is rebuilt from the local event log.

## 4. Target architecture

```
┌─────────────────────────── Browser (static SPA) ────────────────────────────┐
│                                                                              │
│  React UI (existing, ~unchanged)                                             │
│    Zustand stores ◄── event messages ── Web Worker (engine host)             │
│    apiKeys / config / prompts (localStorage)                                 │
│                                          │                                   │
│  Web Worker:                             │                                   │
│    ├─ tick-engine ── orchestrator ── action handlers   (ported, Node-free)   │
│    ├─ in-memory store (Maps/arrays, mirrors needed tables)                   │
│    ├─ in-process pub/sub + scheduler (replaces Redis/BullMQ)                  │
│    ├─ browser LLM adapters (fetch; SDKs in browser mode)                      │
│    └─ IndexedDB persistence (snapshot + event log)                           │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                    │ (only for non-CORS providers)
                          ┌─────────▼──────────┐
                          │ Stateless CORS proxy │  (Cloudflare Worker, no storage)
                          └─────────┬──────────┘
                                    │
                        Provider APIs (Anthropic / OpenAI / Gemini / DeepSeek / …)
```

## 5. Phased plan

Each phase ends in a runnable, verifiable state. Phases 1–4 are the critical path.

### Phase 0 — Foundations & scoping
- Lock the port/drop module list (§3) and the browser-safe package boundary.
- Stand up the static build target (drop the `/api` dev proxy; SPA only).
- Fix the 5 stale `prompt-builder` tests as part of porting the prompt layer (they assert removed
  strings after the emergence rewrite in `30dbca0`).
- Decide engine package layout: move ported engine code into a browser-safe location
  (`packages/engine` or `apps/web/src/engine`) with **no Node imports**.

### Phase 1 spike — DONE ✅

A vertical slice proving the thesis lives in `apps/server/src/engine-memory/`:
- `store.ts` — in-memory store mirroring the needed tables (types from `db/schema`, no DB connection).
- `queries/{agents,world,inventory,events}.ts` — in-memory query modules, **signature-compatible** with `db/queries/*`.
- `bus.ts` — in-process pub/sub replacing `cache/pubsub` (Redis), emitting the SSE `WorldEvent` shape.
- `tick.ts` — slim COLLECT→APPLY→DECAY→REGEN→EMIT loop reusing the **real** `CONFIG` physics and **pure** `world/grid` utilities, with a rule-based (no-LLM) policy.
- Test `src/__tests__/engine-memory/spike.test.ts` (6/6 green): ticks advance, movement/gather/consume emerge, agents survive with food and starve without it, the bus delivers events, and **no `db/index`/`cache`/`queue` module is loaded**.

Verified: `bun typecheck` clean; the spike runs with Postgres/Redis down.

### Phase 1 — Make the engine Node-free & DB-swappable *(largest phase, IN PROGRESS)*

**Swap mechanism (decided & validated):** the engine keeps its relative `db/queries/*` and
`world/scent` imports unchanged. Those specifiers are redirected to the in-memory modules —
in tests via Bun `mock.module`, in the browser build via Vite `resolve.alias`. Validated:
`src/__tests__/engine-memory/real-handlers.test.ts` runs the **real, unchanged** `handleMove`,
`handleGather`, `handleConsume` against the in-memory store, and asserts the Node-only `postgres`
driver is never loaded. This proves real engine code is store-compatible.

**Done so far:**
- In-memory store extended to: agents, world, inventory, events, **memories + relationships**,
  **scents** (stigmergy; replaces the Redis scent keys with tick-aged in-memory entries).
- In-memory query modules (signature-compatible): `agents`, `world`, `inventory`, `events`,
  `memories`; plus in-memory `scent`.
- Real handlers move/gather/consume verified on memory (incl. the transitive scent→Redis path).

**Remaining Phase 1 checklist:**
- [x] In-memory query modules for the rest of the engine surface: `employment`, `reproduction`,
  `gossip`, `credentials`, `beliefs`, `roles`, `claims`, `knowledge`, `puzzles`, **`naming`**
  (10th — discovered via name-location) — all signature-compatible, full server typecheck clean.
- [x] **Exhaustively verified real handlers on memory** (27/27 engine-memory tests green,
  deterministic via seeded RNG, postgres/Redis never loaded):
  - base: move, gather, consume
  - extended: offer-job→accept-job, claim, issue-credential, spread-gossip, join-puzzle, harm
  - full: name-location, quit-job, cancel-job-offer, revoke-credential, share-info,
    spawn-offspring, steal, deceive, and the full puzzle team flow
    (form-team → join-team → share-fragment → leave-puzzle)
  - Probabilistic handlers (harm, steal) return `success:false` on a missed attempt — tests seed
    the RNG and assert outcome-agnostic invariants (item conservation, energy consumed).
- [ ] **BLOCKER — handlers that bypass the query modules with raw `db.execute(sql)` or import
  `db`/`ledger`/`cache` directly** must be refactored before the browser build (a no-op `db` stub
  would silently break persistence). Affected: `work`, `pay-worker`, `claim-escrow`,
  `fire-worker` (raw `db.execute` on `employments` — should call `employment.incrementTicksWorked`
  etc. which already exist), `submit-solution` (`ledger`), `inject-info` (`db` + `cache/pubsub`),
  `trade` (`db`). Refactor these to use query-module functions / the in-memory ledger+bus.
- [ ] In-memory infra: `cache/pubsub` (done as `bus`), `cache/projections`, `cache/llm-cache`,
  `queue` (BullMQ → in-process async with concurrency cap), in-memory `ledger`.
- [ ] Run the real **orchestrator** decision flow on memory (drop the BullMQ queue path; keep the
  baseline/external direct path).
- [ ] A browser-safe engine entrypoint (the tick loop) that drops server-only concerns
  (experiments, telemetry, role crystallization optional) — the spike `tick.ts` becomes this.
- [ ] Wire the actual Vite `resolve.alias` map so the redirection works in the real browser bundle
  (not just test mocks), then move the engine into `packages/engine`.

#### Original Phase 1 description
- Build an **in-memory store**: `Map`s keyed by id for entities + append array for events, typed
  from Drizzle's inferred row types so shapes match exactly.
- Reimplement the §3 "PORT" query modules against the in-memory store, **preserving every export
  name and signature** (async, same return shapes).
- Replace infrastructure:
  - `cache/pubsub` → in-process `EventEmitter`.
  - `cache/projections` → in-memory snapshots.
  - `cache/llm-cache` → optional in-memory / IndexedDB decision cache.
  - `queue` (BullMQ) → in-process async runner with a concurrency cap; reuse the orchestrator's
    existing non-queue path used for baseline/external agents.
  - `world/scent.ts` Redis TTL → in-memory `Map` with tick-based decay.
- Remove Node-only escape hatches from the engine path (CLI adapters, `fs` in evolution, direct
  `process.env`).
- **Verification:** a Bun/Node harness runs N ticks with zero DB/Redis and produces a coherent
  world. This harness becomes the engine's first real unit-test suite (closes the tick-engine /
  orchestrator / actions coverage gap noted in the project audit).

### Phase 2 — Browser LLM layer
- `BrowserLLMAdapter` base: copy of `adapters/base.ts` with Redis cache + OpenTelemetry stripped;
  optional client-side decision cache.
- Key manager bridged to `stores/apiKeys.ts` (localStorage) instead of `process.env`.
- Claude / OpenAI / Gemini: browser mode — Anthropic SDK with `dangerouslyAllowBrowser` +
  `anthropic-dangerous-direct-browser-access` header (or raw fetch); OpenAI
  `dangerouslyAllowBrowser`; Gemini REST.
- The 8 fetch adapters: make base URL proxy-aware (direct vs. routed through the CORS proxy).
- Drop the 3 CLI adapters from the browser registry.
- Rewrite the 5 stale prompt tests against the ported, pure prompt-builder.

### Phase 3 — Persistence (IndexedDB)
- IndexedDB layout: object stores for world/agents/inventory/social + an append-only event log.
- Hydrate on boot; snapshot on interval and on pause; bounded event-log pruning policy.
- World export/import (JSON download/upload) for sharing and offline analysis — replaces what the
  dropped server analytics offered.

### Phase 4 — Web Worker integration
- Host the engine in a Web Worker so ticks + LLM awaits never block the canvas.
- Worker ↔ main-thread protocol that **emits the same event shapes** the SSE stream used, so the
  existing Zustand `processEvent` consumes them unchanged.
- Replace `useWorldControl` REST calls (start/pause/resume/reset) with Worker commands; retire
  `useSSE`'s network path.

### Phase 5 — CORS proxy
- Minimal stateless Cloudflare Worker: forward + CORS headers, no storage, no key retention.
- Proxy URL configurable in settings; per-provider routing table (direct vs. proxied).
- Document self-hosting the proxy (it is the only deployable backend artifact).

### Phase 6 — Onboarding & UX for local-only mode
- First-run flow: enter keys, choose providers/models, configure the world.
- Clear "everything runs locally; data never leaves your browser (except direct LLM calls)"
  messaging.
- Cost/usage estimate + client-side rate limiting (the user now pays per call directly).

### Phase 7 — Cleanup, security, deploy
- Archive server-only code out of the active build (`apps/server` Fastify routes, Drizzle,
  middleware, multi-tenancy, experiment runner) — preserved in git, removed from the shipped app.
- Static deploy (Cloudflare Pages / Netlify / GitHub Pages).
- Update `README.md`, `CLAUDE.md`, and docs to describe the client-only architecture.
- Security: document the threat model (keys in localStorage ⇒ XSS is the main risk; strict CSP,
  no untrusted HTML injection). Optional: encrypt keys at rest with Web Crypto + a passphrase.

## 6. Key risks & mitigations

| Risk | Mitigation |
|------|------------|
| `analytics.ts` SQL too complex to port | Dropped in client mode; rebuild lightweight metrics from the local event log if needed. |
| IndexedDB quota / unbounded event growth | Event-log pruning + capped retention + export-to-file. |
| Provider changes/blocks CORS | The stateless proxy is the universal fallback. |
| Single JS thread for large worlds | Web Worker + capped agent-decision concurrency; document world-size limits. |
| API keys in localStorage (XSS) | Strict CSP, no `innerHTML` of untrusted data, optional Web Crypto encryption at rest. |
| Direct API spend by users | Cost estimate UI, client rate limiting, optional decision cache. |
| Loss of scientific/experiment tooling | Out of scope for client mode by decision; preserved in git; can return as an offline analyzer over exported logs. |

## 7. Definition of done

- Opening the deployed static URL with valid keys runs a full multi-agent simulation in the
  browser, with world state and the event log persisted across reloads via IndexedDB.
- No PostgreSQL/Redis/BullMQ/Fastify is required to run the app.
- All supported providers work (CORS-friendly directly; others via the stateless proxy).
- The engine has a real unit-test suite (the DB-free harness from Phase 1).
- `bun typecheck` is clean; the shipped bundle contains no Node-only imports.
