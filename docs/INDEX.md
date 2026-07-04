# Sim Agents Documentation

> Central navigation hub for all project documentation.

## Quick Links

| Document | Description |
|----------|-------------|
| [README](../README.md) | Browser-local quick start and project overview |
| [Browser Mode Architecture](browser-mode-plan.md) | Current local-mode architecture and migration notes |
| [BYOK Security Notes](security-byok.md) | Browser-local key storage, CSP, and XSS checklist |
| [Remote Mode and Research Boundary](remote-mode-and-research.md) | Server/research surface, routing split, and porting rules |
| [Testing Matrix](testing.md) | Browser-local, smoke, security, and remote test gates |
| [ROADMAP](../ROADMAP.md) | Current browser-pivot status and next work |
| [CLAUDE.md](../CLAUDE.md) | AI development assistant context |

---

## Public Documentation

User-facing documentation organized by audience:

| Document | Audience | Description |
|----------|----------|-------------|
| **[Overview](public/index.md)** | Everyone | Landing page and navigation |
| **[Why SimAgents?](public/why-simagents.md)** | Decision-makers | Vision, philosophy, use cases |
| **[Getting Started](public/getting-started.md)** | Developers | Browser-local setup, first simulation, remote-mode boundary |
| **[Research Guide](public/research-guide.md)** | Researchers | Experiment design, metrics, reproducibility |
| **[API Reference](public/api-reference.md)** | Developers | Remote/server API documentation |

---

## Getting Started

- **[README](../README.md)** - Browser-local quick start and project overview
- **[CONTRIBUTING](../CONTRIBUTING.md)** - How to contribute to the project
- **[CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md)** - Community guidelines

## Core Documentation

### Design & Architecture

- **[PRD.md](PRD.md)** - Product Requirements Document (v1.6.0)
  - Vision and philosophy (Sections 1-4)
  - System architecture (Section 5)
  - World model (Section 6)
  - Agent identity (Section 7)
  - Economy (Section 8)
  - Actions catalog (Section 9, 24)
  - Governance (Section 11)
  - Advanced features (Sections 34-40)
  - Employment System (Section 41)
  - Social Interactions & Cooperation (Section 42)
  - Cooperative Puzzle Game (Section 43)
  - User Authentication (Section 44)

### Technical Reference

- **[Browser Mode Architecture](browser-mode-plan.md)** - Browser-local runtime plan and current split
  - Web Worker engine hosting
  - BYOK provider routing
  - `localStorage` persistence and export/import
  - Remote/server boundary

- **[BYOK Security Notes](security-byok.md)** - Browser-local security posture
  - Plain `localStorage` key storage
  - CSP and XSS constraints
  - Optional passphrase-encryption tradeoffs
  - Review checklist for untrusted text

- **[Remote Mode and Research Boundary](remote-mode-and-research.md)** - Local vs remote ownership
  - Web routing split
  - Server route ownership
  - Config override boundary
  - Porting rule for remote features

- **[Testing Matrix](testing.md)** - Verification split
  - Browser-local gates
  - Browser smoke test
  - BYOK security audit
  - Remote/DB-backed suites

- **[Stack Rationale](appendix/stack-rationale.md)** - Technical decisions and trade-offs
  - Why Bun over Node.js
  - Why PostgreSQL as event store
  - Why SSE over WebSocket
  - Infrastructure choices

### Scientific Research

- **[Experiment Design Guide](experiment-design-guide.md)** - How to design and run experiments
  - Experiment DSL schema
  - Baseline agents (random, rule-based, Q-learning)
  - Shock system
  - Statistical analysis

- **[Scientific Framework](appendix/scientific-framework.md)** - Validation methodology
  - Core assumptions
  - Metrics specification
  - Reproducibility requirements
  - A/B testing framework

- **[Scientific Remediation Checklist](scientific-remediation-checklist.md)** - Priority roadmap for scientific hardening
  - P0 blockers for strong research claims
  - P1 methodological upgrades
  - P2 publication-readiness tasks

- **[Metric Specification](metric-specification.md)** - Metric tiers, formulas, and failure modes
  - Validated vs heuristic vs descriptive metrics
  - Null-model expectations

- **[Research Bundles](research-bundles.md)** - Export structure and claim-review workflow
  - Stable artifact layout
  - Provenance and bundle contents

- **[Literature Validation Plan](literature-validation-plan.md)** - Replication-first validation path
  - Canonical benchmark world
  - Acceptance criteria before novel claims

## Development Context

- **[CLAUDE.md](../CLAUDE.md)** - For AI coding assistants
  - Key files and structure
  - Common commands
  - Data models
  - API endpoints

- **[ROADMAP](../ROADMAP.md)** - Browser-pivot status
  - Current local product path
  - Verification gates
  - Remaining hardening and legacy separation work

---

## Document Relationships

```
README.md           ─── Browser-local quick start, links to docs
    │
    ├── ROADMAP.md      ─── Current status and next work
    │
    ├── CONTRIBUTING.md ─── How to contribute
    │
    └── docs/
        ├── INDEX.md        ─── This file (navigation hub)
        │
        ├── browser-mode-plan.md ─── Browser-local architecture
        ├── security-byok.md ─── Browser-local BYOK security notes
        ├── remote-mode-and-research.md ─── Local vs remote boundary
        ├── testing.md ─── Split verification gates
        ├── PRD.md          ─── Historical/full-platform design specifications
        │
        ├── experiment-design-guide.md ─── Research guide
        │
        ├── scientific-remediation-checklist.md ─── Scientific hardening roadmap
        ├── metric-specification.md ─── Metric tiers and formulas
        ├── research-bundles.md ─── Bundle layout and claim review
        ├── literature-validation-plan.md ─── Replication-first validation
        ├── templates/
        │   ├── study-template.md ─── Preregistration-style study spec
        │   └── claim-review-template.md ─── Internal claim review gate
        │
        ├── public/         ─── User-facing docs
        │   ├── index.md
        │   ├── why-simagents.md
        │   ├── getting-started.md
        │   ├── research-guide.md
        │   └── api-reference.md
        │
        └── appendix/
            ├── scientific-framework.md ─── Validation methodology
            └── stack-rationale.md      ─── Technical decisions
```

---

*Last updated: July 3, 2026*
