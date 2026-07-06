# Experiment Design Guide

SimAgents experiments now run in the browser worker. Use this guide to keep browser-local studies explicit and bounded.

## Define The Run

Record:

- hypothesis
- world seed
- roster
- provider keys used or baseline-only status
- custom prompt
- runtime config overrides
- target ticks
- capture interval
- planned metrics

## Browser Runner

The worker client exposes:

```ts
await getEngineClient().runExperiment({
  id: 'scarcity-baseline',
  name: 'Scarcity baseline',
  ticks: 25,
  wallStepMs: 6000,
  captureEveryTicks: 1,
});
```

Run summaries are bounded in `simagents_experiment_runs_v1`. Export JSON/CSV for durable artifacts.

## Metrics

Prefer metrics that can be traced to exported state:

- alive agents
- average hunger, energy, health
- total balance
- resource amount
- event counts by type
- puzzle completion state
- replay timeline observations

Classify metrics before interpreting them:

| Class | Meaning |
|-------|---------|
| Mechanistic | Direct state/event measurement |
| Heuristic | Summary useful for exploration |
| Inferential | Requires replicated matched comparisons |

## Interventions

Any manual prompt, config, roster, or import/export change is an intervention. Record it in `config-notes.md`.

## Claim Strength

| Claim | Minimum evidence |
|-------|------------------|
| Exploratory | One exported browser run with notes |
| Descriptive | Locked config and exported metrics |
| Comparative | Multiple matched exported runs |
| Validated | Replicated comparison plus external review |

Do not collapse these categories.
