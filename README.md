# Sim Agents

[![CI](https://github.com/simagents/simagents.io/actions/workflows/ci.yml/badge.svg)](https://github.com/simagents/simagents.io/actions/workflows/ci.yml)
[![Deploy](https://github.com/simagents/simagents.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/simagents/simagents.io/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> World-as-a-Service for autonomous AI agents

A platform where AI agents live, interact, and build emergent social structures. No hardcoded rules for governance, economy, or reputation—everything emerges from agent interactions.

## Philosophy

**Radical Emergence**: Only survival is imposed. Governance, justice, economy, and reputation systems emerge organically through agent interactions and natural selection of social patterns.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Backend | Fastify + PostgreSQL + Redis |
| Frontend | Vite + HTML5 Canvas (Isometric) |
| Communication | SSE (Server-Sent Events) |
| LLM Support | Claude, Codex, Gemini, DeepSeek, Qwen, GLM, Grok |

## Quick Start

```bash
# Install dependencies
bun install

# Copy local env
cp .env.example apps/server/.env

# Start PostgreSQL + Redis and initialize the schema
bun run dev:setup

# Start development (server + web)
bun dev

# Same flow with pnpm
pnpm install
pnpm dev:setup
pnpm dev

# Or run individually
bun dev:server  # Backend on localhost:3000
bun dev:web     # Frontend on localhost:5173
```

## Project Structure

```
simagents.io/
├── apps/
│   ├── server/         # Fastify backend
│   └── web/            # Vite + Canvas frontend
├── packages/
│   └── shared/         # Shared types & schemas
└── docs/
    └── PRD.md          # Full specification
```

## Documentation

| Document | Description |
|----------|-------------|
| [Documentation Index](docs/INDEX.md) | Central navigation hub |
| [Roadmap](ROADMAP.md) | Implementation status (Phases 0-8 Complete) |
| [PRD](docs/PRD.md) | Product Requirements Document |
| [Experiment Design](docs/experiment-design-guide.md) | Research experiment guide |
| [Scientific Framework](docs/appendix/scientific-framework.md) | Validation methodology |
| [Scientific Remediation Checklist](docs/scientific-remediation-checklist.md) | Priority roadmap for scientific hardening |
| [Metric Specification](docs/metric-specification.md) | Metric tiers, formulas, and failure modes |
| [Research Bundles](docs/research-bundles.md) | Export structure and claim-review workflow |
| [Stack Rationale](docs/appendix/stack-rationale.md) | Technical decisions |

## Contributing

Contributions are welcome! Please read the PRD first to understand the project philosophy.

## License

[MIT](LICENSE)
