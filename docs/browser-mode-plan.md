# Backend Zero Architecture

SimAgents is a browser-only SPA. The product runtime is:

```text
apps/web  ->  Web Worker  ->  packages/engine
```

No HTTP control plane is required. The main-thread worker client is the public boundary for app features.

## Package Split

| Area | Location |
|------|----------|
| React app | `apps/web` |
| Worker host and client | `apps/web/src/engine-host` |
| Browser-local persistence services | `apps/web/src/services` |
| Simulation engine | `packages/engine/src/engine` |
| Action handlers | `packages/engine/src/actions` |
| In-memory world store and queries | `packages/engine/src/engine-memory` |
| Prompt construction and parsing | `packages/engine/src/llm` |
| Provider/model catalog | `packages/shared/src/llm-catalog.ts` |

The web app imports `@simagents/engine`. Vite does not alias into deleted backend paths.

## Worker API

Current worker-facing operations:

- `init`, `start`, `pause`, `resume`, `reset`
- `setSpeed`
- `snapshot`, `export`
- `setRuntimeConfig`
- `setCustomPrompt`
- `getReplayRange`, `getReplayFrame`, `getAgentTimeline`
- `getPuzzles`, `getPuzzleDetails`, `getPuzzleResults`, `getPuzzleStats`
- `runExperiment`, `cancelExperiment`, `getExperimentStatus`, `exportExperiment`
- `registerBrowserAgentAdapter`

Add browser features here rather than adding route-shaped abstractions.

## Persistence

All local persistence must be bounded and validated on read.

| Key | Contents |
|-----|----------|
| `simagents_credential_vault_v1` | Optional AES-GCM credential archive |
| `simagents_api_keys` | Legacy plaintext; explicit migration only, never automatically loaded |
| `simagents_session_limits_v1` | Request/time/token limits (no secrets) |
| `simagents_agent_roster` | Stable roster IDs, model/capabilities and connection references |
| `simagents_connections_v1` | Connection metadata and credential references; no keys |
| `simagents_proxy_url` | Optional user-provided proxy origin |
| `simagents_world_snapshot` | Versioned world snapshot |
| `simagents_event_ring` | Recent events |
| `simagents_custom_prompt` | Custom system prompt |
| `simagents_replay_frames_v1` | Derived replay frames |
| `simagents_prompt_logs_v1` | Bounded prompt inspector logs |
| `simagents_experiment_defs_v1` | Browser experiment definitions |
| `simagents_experiment_runs_v1` | Bounded run summaries |

Long runs should be exported as JSON or CSV.

## LLM Access

Users provide keys in browser memory, with optional passphrase-encrypted device storage. Every public roster entry requires BYOK credentials; the selected session request/time/token limits apply to outgoing inference. Direct-browser providers call their vendor API directly. Providers that do not allow browser calls require a user-supplied proxy URL.

Named profiles support Responses, compatible Chat Completions, Anthropic Messages and Gemini generateContent. Explicit model probes and first-page model listing are initiated by the user. Profile metadata is exported in snapshots without credentials; imported destinations are not automatically activated. Legacy provider-only metadata is converted to profiles; public sessions must verify the model before starting.

The official relay implementation lives in `apps/relay`. It has not been deployed; builds must explicitly configure its origin before enabling it. It owns no simulation state and has no content persistence.

## Removed Surfaces

These are not part of the current product architecture:

- backend route handlers
- database schemas and migrations
- queue workers
- tenancy, auth, and admin enforcement
- realtime HTTP streams
- production proxy deployment (implementation exists separately in `apps/relay`, but is undeployed)

Historical docs may mention older designs, but the simulation remains inside the browser app, `packages/engine`, and `packages/shared`; `apps/relay` is only a constrained provider transport.
