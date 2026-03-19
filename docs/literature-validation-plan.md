# Literature Validation Plan

SimAgents should validate novel claims only after reproducing at least one classic artificial-society result in `canonical_core` or in a controlled derivative of it.

## First Target

Replicate a Sugarscape-style baseline using `apps/server/experiments/sugarscape-replication.yaml`:

- local resource gradients drive movement toward richer cells
- inequality rises under asymmetric resource access
- survival is sensitive to scarcity shocks

## Experiment Design

The replication uses two conditions (variants):

| Condition | Agents | Purpose |
|-----------|--------|---------|
| `control` | 2x baseline_random + 2x baseline_rule | Null-hypothesis baseline |
| `sugarscape_treatment` | 2x baseline_random + 2x baseline_rule + 2x baseline_sugarscape | Treatment with Sugarscape agent |

Both conditions run under `deterministic_baseline` profile with `canonical_core` benchmark world, ensuring all cooperation incentives, spoilage, puzzles, and personalities are disabled.

## Minimum Acceptance Criteria

- Run the benchmark with `deterministic_baseline` profile and fixed seed schedule.
- Export a full research bundle for every run.
- Show that repeated runs with identical seed produce identical event and final-state hashes.
- Compare at least 10 seeds for each condition before claiming any effect.
- Report Gini, survival, cooperation index, trade count, and conflict count with effect size and corrected p-values.

## Validation Script

Run the automated validation:

```bash
cd apps/server
bun run src/scripts/validate-sugarscape.ts
```

Options:
- `--runs N` -- runs per condition (default: 2)
- `--seeds N` -- number of seeds for reproducibility check (default: 10)
- `--verbose` / `-v` -- detailed output

## Canonical Inputs

- Benchmark config: `apps/server/experiments/canonical-core-benchmark.yaml`
- Sugarscape config: `apps/server/experiments/sugarscape-replication.yaml`
- Validation script: `apps/server/src/scripts/validate-sugarscape.ts`
- Study template: `docs/templates/study-template.md`
- Claim review gate: `docs/templates/claim-review-template.md`

## Current Status

- [x] YAML config with 2 conditions (control vs treatment)
- [x] Validation script created
- [x] Claim class enforcement in runner
- [ ] Full validation run with 10+ seeds completed
- [ ] Results reviewed and documented

## Publication Rule

If the acceptance criteria above are not met, results must be labeled exploratory rather than validated. Until the Sugarscape path is replicated across repeated seed schedules with matching bundle hashes, it remains a partial literature-validation baseline rather than a validated replication.
