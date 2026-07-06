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
| `simagents_api_keys` | BYOK provider keys |
| `simagents_agent_roster` | Roster, model, color, reasoning settings |
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

Users provide keys in the browser. Direct-browser providers call their vendor API directly. Providers that do not allow browser calls require a user-supplied proxy URL.

The app does not ship a proxy implementation as product infrastructure.

## Removed Surfaces

These are not part of the current product architecture:

- backend route handlers
- database schemas and migrations
- queue workers
- tenancy, auth, and admin enforcement
- realtime HTTP streams
- product-owned proxy deployment

Historical docs may mention older designs, but current implementation work should stay inside the browser app, `packages/engine`, and `packages/shared`.
