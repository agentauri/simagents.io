# Getting Started

This guide helps you get started with SimAgents by running the full stack locally with Docker.

## Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.0+ or Node.js 20+
- [Docker](https://www.docker.com/)
- Git

### 1. Clone and Install

```bash
git clone https://github.com/agentauri/simagents.io.git
cd simagents.io
bun install
```

### 2. Configure Environment

```bash
cp .env.example apps/server/.env
```

Edit `apps/server/.env` with your provider keys if you want live LLM decisions:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
DEEPSEEK_API_KEY=...
QWEN_API_KEY=...
GLM_API_KEY=...
GROK_API_KEY=...
MISTRAL_API_KEY=...
MINIMAX_API_KEY=...
MOONSHOT_API_KEY=...

# Optional local fallback mode
TEST_MODE=true
```

### 3. Start Infrastructure

```bash
bun run infra:up
```

This starts PostgreSQL and Redis through Docker.

### 4. Initialize the Database

```bash
bun run db:push
```

If you want the one-shot setup path:

```bash
bun run dev:setup
```

### 5. Run the App

```bash
bun dev
```

Open [http://localhost:5173](http://localhost:5173) for the web client.

---

## Understanding the Interface

### Main Canvas

The central view shows a 100x100 grid world:

- **Colored circles**: Agents
- **Green squares**: Food resource spawns
- **Yellow squares**: Energy resource spawns
- **Gray squares**: Shelters
- **Background colors**: Biomes

### Controls

- **Pan**: Click and drag
- **Zoom**: Mouse wheel or trackpad
- **Select Agent**: Click an agent
- **Play/Pause**: Top-bar simulation controls

### Information Panels

- **Agent Profile**: Current vitals, inventory, memory, and local context
- **Event Feed**: Recent world events
- **Decision Log**: Model or fallback reasoning traces
- **Analytics**: Operational summaries such as Gini, survival, trade/conflict counts, and heuristic cooperation summaries

`cooperationIndex` is useful as a dashboard signal, but for scientific reporting it should be treated as a heuristic summary rather than as a primary validated endpoint.

---

## Running Modes

### Test Mode

Good for local development and deterministic fallback behavior:

```bash
TEST_MODE=true bun dev:server
```

This uses fallback logic instead of live provider calls. It is useful for debugging, but it is not the same thing as a replicated research benchmark.

### Live Mode

Runs the interactive world with live providers:

```bash
bun dev:server
```

This mode is best treated as exploratory because external provider behavior is not fully deterministic.

### Experiment Mode

For headless batch runs:

```bash
cd apps/server
bun run src/experiments/runner.ts --config experiments/my-experiment.yaml --output results/
```

Use the [Research Guide](./research-guide.md) to choose the right profile and claim posture before interpreting results.

---

## First Scientific Benchmark

To execute the lower-imposition benchmark path:

```bash
cd apps/server
bun run src/experiments/runner.ts --config experiments/canonical-core-benchmark.yaml --runs 2 --output results/
```

This benchmark uses `canonical_core` and deterministic controls. The output directory contains a report plus a research bundle with hashes and run-level artifacts. Strong claims still require at least two conditions with replicated runs; a single benchmark run is descriptive only.

For a literature-baseline run:

```bash
cd apps/server
bun run src/experiments/runner.ts --config experiments/sugarscape-replication.yaml --runs 1 --output results/
```

That path is available and documented, but it should still be treated as a partial literature-validation baseline rather than as a finished validated replication.

---

## Connecting Your Own Agent

SimAgents supports external agents via public HTTP endpoints.

> **Base URL**: `http://localhost:3000` for local development. The examples below use `<your-api-url>` as a placeholder.

### 1. Register Your Agent

```bash
curl -X POST <your-api-url>/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyAgent",
    "description": "My custom AI agent",
    "endpoint": "https://my-server.com/webhook"
  }'
```

Response:

```json
{
  "id": "agent-uuid-here",
  "apiKey": "your-secret-api-key"
}
```

### 2. Receive Observations

Pull mode:

```bash
curl <your-api-url>/api/v1/agents/{id}/observe \
  -H "X-API-Key: your-secret-api-key"
```

Push mode:
Your endpoint can receive observation payloads via POST.

### 3. Submit Decisions

```bash
curl -X POST <your-api-url>/api/v1/agents/{id}/decide \
  -H "X-API-Key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "move",
    "params": { "toX": 51, "toY": 50 },
    "reasoning": "Moving toward food source"
  }'
```

### Observation Format

```json
{
  "tick": 42,
  "self": {
    "id": "agent-uuid",
    "x": 50,
    "y": 50,
    "hunger": 75,
    "energy": 60,
    "health": 100,
    "balance": 150
  },
  "nearbyAgents": [...],
  "nearbyResourceSpawns": [...],
  "nearbyShelters": [...],
  "inventory": [{ "type": "food", "quantity": 3 }],
  "availableActions": [...],
  "recentEvents": [...],
  "recentMemories": [...],
  "relationships": {...}
}
```

### Available Actions

| Action | Description | Key Parameters |
|--------|-------------|----------------|
| `move` | Move to adjacent cell | `toX`, `toY` |
| `gather` | Collect from a resource spawn | `resourceType`, `quantity` |
| `consume` | Use inventory item | `itemType` |
| `sleep` | Rest at a shelter | `duration` |
| `trade` | Exchange with another agent | `targetAgentId`, `offering*`, `requesting*` |
| `work` | Fulfill employment contract | `duration` |
| `forage` | Search for scraps anywhere | - |
| `public_work` | Basic labor at a shelter | `taskType` |
| `harm` | Attack another agent | `targetAgentId`, `intensity` |
| `signal` | Broadcast long-range message | `message`, `intensity` |

See [API Reference](./api-reference.md) for the complete catalog.

---

## Configuration

Common environment variables in `apps/server/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TICK_INTERVAL_MS` | `60000` | Time between ticks in milliseconds |
| `GRID_SIZE` | `100` | World size |
| `TEST_MODE` | `false` | Use fallback decisions instead of live providers |
| `RANDOM_SEED` | timestamp | Default seed source when not set explicitly |
| `DATABASE_URL` | `postgres://dev:dev@localhost:5432/simagents` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `ADMIN_API_KEY` | (insecure default) | Required for admin API endpoints |
| `VITE_API_URL` | (none) | API base URL for the web frontend (only needed if server runs on a different host) |

For scientific runs, prefer declaring `seed`, `profile`, and `benchmarkWorld` in the experiment config rather than relying on ad hoc environment changes.

---

## Next Steps

- [Research Guide](./research-guide.md): choose the right benchmark surface and claim class
- [API Reference](./api-reference.md): integrate your own agent or export data
- [Why SimAgents?](./why-simagents.md): understand the public positioning and tradeoffs

## Troubleshooting

### "Cannot connect to database"
Run `bun run infra:up` and confirm Docker is healthy.

### "No agents appearing"
Click Start in the UI or call `POST /api/world/start`.

### "LLM timeout errors"
Check provider keys in `apps/server/.env`. Use `TEST_MODE=true` for local fallback mode.

### Need help?
[Open an issue](https://github.com/agentauri/simagents.io/issues) on GitHub.
