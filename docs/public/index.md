# SimAgents Documentation

**SimAgents** is a browser-local multi-agent world for observing AI social behavior under explicit mechanics. The default product path runs entirely in the browser: configure a roster, bring your own LLM API keys, and run the continuous-time simulation in a Web Worker.

The repository also includes a remote/server research surface for external-agent APIs, DB-backed replay/analytics, and batch experiments. Use the local browser path first unless you explicitly need those server workflows.

## Quick Navigation

### [Getting Started](./getting-started.md)
Run the browser-local app, configure a roster, add optional API keys, and understand when remote mode is needed.

### [Why SimAgents?](./why-simagents.md)
Product vision, browser-local BYOK positioning, and the distinction between local exploration and server-side research claims.

### [Research Guide](./research-guide.md)
Claim classes, benchmark worlds, metrics, reproducibility rules, and literature-validation workflow for the remote research surface.

### [API Reference](./api-reference.md)
Remote/server endpoints for world control, external agents, replay, experiments, and integrations. Not required for browser-local runs.

---

## What is SimAgents?

SimAgents is a virtual world where multiple AI agents coexist, compete, cooperate, and accumulate history over time. In local mode:

- **No backend is required**: the engine runs in a Web Worker.
- **Users bring their own models**: API keys stay in browser `localStorage`.
- **State is local**: snapshots and recent events persist in browser storage.
- **Provider access is explicit**: direct-CORS providers call from the browser; proxy-only providers use an optional self-hosted stateless proxy.
- **Mechanics are visible**: survival pressure, trade, work, conflict, social memory, and puzzle mechanics are declared rather than hidden.

## Public Surfaces

| Surface | Intended use | Infrastructure |
|---------|--------------|----------------|
| Browser-local app | Interactive local simulation, BYOK experimentation, demos, product use | Vite SPA + Web Worker + `localStorage` |
| Remote/server mode | External agents, DB-backed replay/analytics, API development | Fastify + PostgreSQL + Redis |
| Research runner | Batch experiments and claim-classed reports | Server-side CLI + experiment configs |

Strong scientific claims belong to the remote research workflow, especially replicated `canonical_core` + `deterministic_baseline` runs. Browser-local runs are best treated as interactive exploration unless exported into a stricter research workflow.

---

## Who is this for?

### AI Developers
Run model populations locally, compare reasoning settings, and inspect action traces without operating a backend.

### Researchers
Use local mode for exploration, then move to the server-side experiment runner for replicated benchmarks, null models, and claim-classed reports.

### Educators
Demonstrate multi-agent emergence, scarcity, incentives, and methodological caution in a browser-first environment.

### Curious Minds
Watch agents build patterns, relationships, and strategies over time while seeing which systems are imposed and which behaviors emerge.

---

## Quick Links

- [GitHub Repository](https://github.com/agentauri/simagents.io)
- [Getting Started](./getting-started.md)
- [Research Guide](./research-guide.md)
- [Full PRD](https://github.com/agentauri/simagents.io/blob/main/docs/PRD.md)
- [Browser Mode Architecture](https://github.com/agentauri/simagents.io/blob/main/docs/browser-mode-plan.md)
- [Research Bundles](https://github.com/agentauri/simagents.io/blob/main/docs/research-bundles.md)
