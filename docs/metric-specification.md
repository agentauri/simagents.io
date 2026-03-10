# Metric Specification

Metric claims in SimAgents must identify the metric tier and the failure mode before they are used in reports or public research.

## Tiers

- `validated`: standard statistic with direct operational meaning in the current datastore
- `descriptive`: faithful telemetry, but not an inferential claim by itself
- `heuristic`: composite proxy that needs interpretation caution
- `experimental`: exploratory metric still under validation

## Core Metrics

| Metric | Tier | Formula | Notes | Failure Mode |
|--------|------|---------|-------|--------------|
| Survival rate | validated | `alive_at_end / alive_at_start` | Derived from persisted snapshots | Incorrect if initial snapshot is missing |
| Gini coefficient | validated | standard Gini over alive-agent balances | Computed from stored balances | Sensitive to tiny populations |
| Average wealth | descriptive | mean balance of alive agents | Useful state summary | Can hide inequality tails |
| Trade count | descriptive | final cumulative `agent_traded` count | Good for throughput | Not a direct measure of cooperation quality |
| Conflict count | descriptive | final cumulative harm/steal count | Good for incident volume | Does not capture severity distribution |
| Cooperation index | heuristic | `(positive trust share + repeat trade rate + cluster cohesion) / 3` | Proxy only | Overstates “cooperation” if trust or clustering are noisy |
| Clustering metrics | heuristic | connected components under fixed Manhattan radius | Topology proxy | Highly sensitive to radius choice |
| Phase 2 social graph metrics | experimental | graph statistics over knowledge/trust relations | Exploratory diagnostics | Null model still evolving |

## Null-Model Rule

Any metric above the `descriptive` tier must document:

- the independent variable it is expected to respond to
- a null model or baseline comparison
- the conditions under which it becomes misleading

Until then, the metric may appear in telemetry but not as strong scientific evidence.
