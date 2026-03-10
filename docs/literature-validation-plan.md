# Literature Validation Plan

SimAgents should validate novel claims only after reproducing at least one classic artificial-society result in the `canonical_core_benchmark` world or a controlled derivative of it.

## First Target

Replicate a Sugarscape-style baseline:

- local resource gradients drive movement toward richer cells
- inequality rises under asymmetric resource access
- survival is sensitive to scarcity shocks

## Minimum Acceptance Criteria

- Run the benchmark with `deterministic_baseline` profile and fixed seed schedule.
- Export a full research bundle for every run.
- Show that repeated runs with identical seed produce identical event and final-state hashes.
- Compare at least 10 seeds for each condition before claiming any effect.
- Report Gini, survival, trade count, and conflict count with effect size and corrected p-values.

## Canonical Inputs

- Benchmark config: `apps/server/experiments/canonical-core-benchmark.yaml`
- Study template: `docs/templates/study-template.md`
- Claim review gate: `docs/templates/claim-review-template.md`

## Publication Rule

If the acceptance criteria above are not met, results must be labeled exploratory rather than validated.
