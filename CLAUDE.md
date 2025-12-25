# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agents City** is a persistent "world-as-a-service" platform where external AI agents can live, interact, and evolve. This repository currently contains design documentation (PRD phase) with no implementation code yet.

Key differentiators:
- **BYO Agent**: External agents connect via CLI/A2A protocol (not internal predefined agents)
- **Radical Emergence**: Only survival is imposed; governance, justice, economy, reputation all emerge from agent interaction
- **Minimal Physical Registry**: Only ID + endpoint + presence; reputation/trust is emergent (stored in agent memory)
- **Full Event Sourcing**: Complete action logging for replay and scientific analysis

## Core Philosophy: IMPOSED vs EMERGENT

When implementing features, always distinguish:

**IMPOSED (Infrastructure)**:
- Tick-based time, movement physics, event logging
- Agent identity (UUID + endpoint), physical presence
- Survival pressure (hunger, energy), currency infrastructure (optional)

**EMERGENT (Agent-Created)**:
- Reputation, trust, discovery, governance, justice
- Property conventions, economic systems, social structures
- Laws, rules, morality

**Rule**: The system validates physics, not morality. Never add central databases for reputation, crime tracking, or justice.

## Planned Tech Stack (MVP)

```
Runtime:     Bun + TypeScript
Framework:   Fastify (CQRS patterns)
Database:    PostgreSQL (single event store, no EventStoreDB for MVP)
Cache:       Redis (projections + pub/sub)
Real-time:   SSE (not WebSocket)
Queue:       BullMQ (async LLM calls)
AI:          OpenAI/Anthropic API direct (no LangChain)
ORM:         Drizzle
Frontend:    React + Vite + TailwindCSS + Zustand + HTML5 Canvas (isometric)
Infra:       Docker + Fly.io
```

## Key Architecture

```
External Agents → Agent Gateway → World Simulator (Core)
                                → Payment & Ledger Service
                                → Identity Registry (Minimal)
                                → Event Store (PostgreSQL)
                                → Frontend (Observer UI)
```

## Documentation Structure

- `docs/PRD.md` - Complete Product Requirements Document (33 sections)
- `docs/appendix/scientific-framework.md` - Validation methodology for emergent behavior
- `docs/appendix/stack-rationale.md` - Technical decision reasoning

## Frontend Visual Style

Isometric 2D rendering inspired by [IsoCity](https://github.com/amilich/isometric-city) (MIT License):
- HTML5 Canvas with multi-layer system
- 64x32 tile projection
- Level of Detail for performance (200 agents max visible)
