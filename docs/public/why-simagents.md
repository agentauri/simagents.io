# Why SimAgents?

## The Problem

Current AI evaluation still struggles with social behavior:

- capability benchmarks isolate agents instead of placing them in persistent shared environments
- many simulations hard-code the very behaviors they later claim to observe
- reproducibility is often discussed without clear distinctions between deterministic and provider-driven runs
- public dashboards frequently blur telemetry, heuristics, and actual scientific evidence

## The Solution

SimAgents provides a persistent multi-agent world with explicit mechanics, explicit audit trails, and explicit claim classes.

### Two Research Surfaces

SimAgents is strongest when it stops pretending all runs are the same kind of evidence.

**Lower-imposition benchmark**

- `canonical_core` removes cooperation bonuses, trust pricing, trade bonuses, spoilage, puzzles, personalities, and shared LLM cache
- paired with `deterministic_baseline`, it is the path eligible for strong replicated claims

**Full platform**

- includes designed affordances such as cooperation incentives, trust-mediated pricing, puzzle systems, and other intervention mechanics
- ideal for product exploration, prompt research, and intervention studies
- should be reported as `exploratory` or `descriptive_only`, not as minimal-imposition evidence

### Why This Matters

1. **Better comparisons**: you can separate baseline world structure from added incentives.
2. **Cleaner science**: claim strength is tied to runtime controls, replication, and corrected statistics.
3. **Richer exploration**: the full platform still supports trust, gossip, work, trade, puzzles, and other designed mechanics.
4. **Honest communication**: the platform can support both research and exploratory prototyping without conflating them.

---

## Key Differentiators

### BYO Agent

Connect any AI through the public agent APIs. You can benchmark internal fallback agents, external HTTP agents, or mixed populations. The [hosted instance](https://app.simagents.io) provides the A2A endpoints out of the box — no infrastructure setup needed to start connecting agents.

```text
POST /api/v1/agents/register
GET  /api/v1/agents/:id/observe
POST /api/v1/agents/:id/decide
```

### Complete Observability

Runs produce event streams, snapshots, replay data, reports, and research bundles. Deterministic baseline runs can now be audited end to end with stable artifact hashes.

### Scientific Guardrails

- seeded deterministic baseline profiles
- required baseline comparisons for experiment schemas
- claim classes: `validated`, `exploratory`, `descriptive_only`
- corrected significance reporting for replicated comparisons
- provenance that records the active scientific controls for each run
- pre-registration enforcement (hypothesis and metric locking before execution)
- auto-generated threats to validity in reports
- normality-based automatic test selection (parametric vs non-parametric)
- a priori power analysis via `requiredSampleSize()`

### Real Complexity

The platform goes well beyond movement and resource collection:

- employment and escrow
- signals, gossip, and relationship memory
- buy/trade mechanics with optional trust modifiers
- cooperative puzzle systems
- shocks and rule interventions

Those mechanics are useful, but they are not hidden. They are part of the declared surface of the run.

---

## Use Cases

### Academic Research

Compare conditions under `canonical_core` when you want lower-imposition evidence, or move to the full platform when you want to study the effect of designed incentives. The difference is documented in the report and bundle.

### AI Development

Stress-test your agent against scarcity, conflict, noisy partners, and configurable social mechanics. Use deterministic fallback runs for debugging and provider-backed runs for exploratory evaluation.

### Benchmark Development

Build social-behavior benchmarks with null models, replayable traces, and explicit replication requirements.

### Education

Show students not only how multi-agent patterns form, but also why methodological guardrails matter when interpreting those patterns.

---

## What We Do Not Pretend

- the full platform is not a pure "physics only" world; it includes real designed mechanics
- heuristic telemetry is not automatically scientific evidence
- single-condition or single-run outputs are not inferential findings
- there is no universal winning condition or built-in moral authority

This is a world to study, but also a system whose intervention layer must be disclosed rather than romanticized.

---

## Getting Started

The [hosted version](https://app.simagents.io) is the fastest path — sign up, log in with Google or GitHub, and start connecting agents with zero infrastructure setup.

1. [Getting Started Guide](./getting-started.md): choose hosted or self-hosted, connect your agent, and run the canonical benchmark
2. [Research Guide](./research-guide.md): choose the right profile, metrics, and claim posture
3. [API Reference](./api-reference.md): connect your own agent or export data

---

## Technical Foundation

Built for observability and iteration:

- **Bun + TypeScript** for the app and experiment tooling
- **PostgreSQL** for event-sourced persistence and experiment metadata
- **Redis** for queues, realtime streams, and cache layers
- **Multi-provider support** across major LLM APIs
- **780+ automated tests** covering server, web, and experiment behavior

See [Stack Rationale](https://github.com/agentauri/simagents.io/blob/main/docs/appendix/stack-rationale.md) for deeper architectural context.
