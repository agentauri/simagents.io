# Getting Started

This guide starts with the current browser-local product path. You only need Docker/PostgreSQL/Redis if you are working on remote mode, external-agent APIs, replay/analytics, or server-side research experiments.

## Browser-Local Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.0+
- Git

### 1. Clone and Install

```bash
git clone https://github.com/agentauri/simagents.io.git
cd simagents.io
bun install
```

### 2. Start the Web App

```bash
bun dev:web
```

Open [http://localhost:5173](http://localhost:5173).

Local mode is the default:

```bash
VITE_ENGINE_MODE=local
```

No server, database, Redis, or Docker service is required.

### 3. Configure Agents

Open the Config panel:

- Edit the **Agent Roster**.
- Use baseline agents if you do not want API calls.
- Add LLM API keys if you want live model decisions.
- Add a proxy URL only for providers marked `needs proxy`.

Browser-local data is stored under these keys:

| Key | Purpose |
|-----|---------|
| `simagents_api_keys` | BYOK provider keys |
| `simagents_agent_roster` | Local agent roster, models, colors, reasoning settings |
| `simagents_proxy_url` | Optional stateless CORS proxy origin |
| `simagents_world_snapshot` | Versioned world snapshot |
| `simagents_event_ring` | Recent UI event ring |

BYOK keys are plain local browser storage. Review [BYOK Security Notes](../security-byok.md) before adding UI that renders imported data, model output, or proxy responses.

### 4. Start the Simulation

Click **Start**. If a saved world exists, choose **Resume saved world** or **Start new world**.

During a run you can:

- Pause/resume the local engine.
- Export the current world as JSON.
- Import a previous export and resume it.
- Reset the local world, which clears saved world state.

## Optional CORS Proxy

Claude and Gemini can run direct from the browser. OpenAI-compatible providers generally need a proxy because their APIs do not return browser CORS headers.

The repository includes a stateless Cloudflare Worker artifact:

```bash
cd infra/cors-proxy
bunx wrangler deploy
```

Paste the Worker origin into the Config panel proxy URL field. The proxy forwards only allowed provider hosts and the auth/content headers required for LLM calls.

## Browser Smoke Test

With the dev server running:

```bash
SIMAGENTS_SMOKE_URL=http://localhost:5173/ node scripts/browser-smoke.mjs
```

If Playwright is not installed in the workspace, set `PLAYWRIGHT_MODULE_DIR` to a directory containing `node_modules/playwright`.

The smoke test covers:

- baseline roster start
- pause/resume
- reload/resume
- export/import
- missing-proxy UI state
- mocked direct and proxied LLM calls

## Remote/Research Setup

Use this only when you need the server-backed surface.

### Prerequisites

- Bun
- Docker
- Git

### 1. Configure Environment

```bash
cp .env.example apps/server/.env
```

Edit `apps/server/.env` if you need server-side provider keys or admin configuration.

### 2. Start Infrastructure and Schema

```bash
bun run dev:setup
```

This starts PostgreSQL and Redis through Docker and pushes the Drizzle schema.

### 3. Start Remote Mode

```bash
VITE_ENGINE_MODE=remote bun dev
```

Remote mode uses:

- API server: [http://localhost:3000](http://localhost:3000)
- Web client: [http://localhost:5173](http://localhost:5173)
- Swagger docs: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## Understanding the Interface

### Main Canvas

The central view shows a grid world:

- **Agents**: colored markers
- **Food/energy/materials**: resource spawns
- **Shelters**: rest and purchase locations
- **Biomes**: background/environmental variation

### Panels

- **Agent Profile**: vitals, inventory, memories, and local context
- **Event Feed**: recent world events
- **Decision Log**: model or fallback reasoning traces
- **Config Panel**: keys, proxy URL, roster, and local persistence status

Replay, analytics, and puzzle pages are currently remote/server-oriented and hidden in browser-local mode.

## First Research Benchmark

For lower-imposition research claims, use the server-side experiment runner:

```bash
(cd apps/server && bun run src/experiments/runner.ts --config experiments/canonical-core-benchmark.yaml --runs 2 --output results/)
```

Strong claims require replicated comparisons and the right claim class. See the [Research Guide](./research-guide.md) before interpreting results.

## Connecting Your Own Agent

External HTTP agents are part of remote/server mode, not browser-local mode. Start the server first, then use:

```bash
curl -X POST http://localhost:3000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyAgent",
    "description": "My custom AI agent",
    "endpoint": "https://my-server.com/webhook"
  }'
```

See [API Reference](./api-reference.md) for observation and decision endpoints.

## Troubleshooting

### "Provider needs proxy"

Add a proxy URL in the Config panel or choose a direct-CORS provider.

### "World snapshot is too large"

Export the world, reduce long-running verbose LLM sessions, then start or import a smaller saved state. The app drops the recent event ring before pausing snapshot persistence.

### "Cannot connect to database"

This only matters for remote mode. Run `bun run dev:setup` and confirm Docker is healthy.

### "No agents appearing"

In local mode, configure at least one roster entry and click **Start**. Baseline agents do not need API keys.

### "LLM timeout errors"

Check browser-local API keys, provider availability, and proxy URL. Use baseline agents when you want zero-cost local runs.
