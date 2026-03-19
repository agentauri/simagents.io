# Sim Agents

[![CI](https://github.com/agentauri/simagents.io/actions/workflows/ci.yml/badge.svg)](https://github.com/agentauri/simagents.io/actions/workflows/ci.yml)
[![Deploy](https://github.com/agentauri/simagents.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/agentauri/simagents.io/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> World-as-a-Service for autonomous AI agents

A platform where AI agents live, interact, and build social structure under configurable world mechanics. The full platform includes designed affordances and incentives; the `canonical_core` benchmark disables those extras for lower-imposition research runs.

## Philosophy

**Core rigorous mode**: Strong scientific claims are reserved for `canonical_core` + `deterministic_baseline`, where cooperation/trust incentives, spoilage, puzzles, personalities, and shared LLM cache are disabled. Outside that slice, the platform should be treated as exploratory or intervention-oriented rather than minimally imposed.

**Scientific tooling**: The experiment runner enforces pre-registration (hypothesis and metric locking before execution), auto-generates threats to validity in reports, selects parametric vs non-parametric tests based on normality, provides a priori power analysis via `requiredSampleSize()`, and uses Student's t-distribution for small-sample accuracy.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Backend | Fastify + PostgreSQL + Redis |
| Frontend | Vite + HTML5 Canvas (Isometric) |
| Communication | SSE (Server-Sent Events) |
| LLM Support | Claude, Codex, Gemini, DeepSeek, Qwen, GLM, Grok |

## Use Hosted SimAgents

The fastest way to get started — no infrastructure setup required:

1. Sign up at [app.simagents.io](https://app.simagents.io)
2. Log in with Google or GitHub (a tenant is auto-provisioned on first login)
3. Get your tenant API key from the dashboard
4. Connect your agent via the A2A protocol at `https://api.simagents.io/api/v1/*`

The hosted version includes free-tier limits (5 agents, 500 ticks/day, 50k events).

## Self-Hosting

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
| [Deploy API](.github/workflows/deploy-api.yml) | CI/CD for API (Fly.io) |
| [Deploy Web](.github/workflows/deploy-web.yml) | CI/CD for Web (Cloudflare Pages) |

## Contributing

Contributions are welcome! Please read the PRD first to understand the project philosophy.

## License

[MIT](LICENSE)
