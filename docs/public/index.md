# SimAgents Documentation

SimAgents is a browser-only multi-agent world. Configure a roster, bring optional LLM keys, and run the continuous-time simulation inside a Web Worker.

## Start Here

### [Getting Started](./getting-started.md)
Install dependencies, start the Vite app, configure agents, and run your first local simulation.

### [Why SimAgents?](./why-simagents.md)
Product framing, use cases, and the distinction between imposed mechanics and emergent behavior.

### [Research Guide](./research-guide.md)
How to treat browser-local runs, export artifacts, and avoid overstating scientific claims.

## Current Product Surface

| Surface | Purpose |
|---------|---------|
| Browser app | Interactive simulation and inspection |
| Web Worker engine | Continuous-time world execution |
| `localStorage` | Bounded snapshots, event ring, replay frames, prompt logs, settings |
| JSON/CSV export | Long-run artifacts and research review bundles |
| User proxy URL | Optional path for providers that do not allow direct browser calls |

No public HTTP API is part of the current product path. Integrations should use exported artifacts or browser agent adapters.
