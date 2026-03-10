# Scientific Remediation Checklist

> Prioritized work needed to move SimAgents from a strong exploratory platform to a scientifically defensible experimental system.
>
> Status update: all `P0`, `P1`, and `P2` remediation items below were implemented in the current codebase on March 10, 2026.

## How to Use This Checklist

- `P0` items block strong research claims and should be completed before presenting the platform as reproducible or scientifically rigorous.
- `P1` items harden methodology and reduce confounders in comparative experiments.
- `P2` items improve publication-readiness, external trust, and long-term research operations.
- No scientific claim should be stronger than the determinism, metrics, and artifacts actually implemented in code.

---

## P0 - Research Claim Blockers

- [x] Unify the experiment runner with the full simulation loop.
  Done when headless experiments execute the same phases as the live engine, including scheduled shocks, optional subsystems, decay, spoilage, snapshots, and completion logic.
  Relevant code: `apps/server/src/experiments/runner.ts`, `apps/server/src/simulation/tick-engine.ts`

- [x] Remove unseeded randomness from simulation-affecting server paths.
  Replace `Math.random()` with the seeded RNG utilities, or explicitly disable those features in scientific experiment mode.
  Done when static search shows no simulation-critical `Math.random()` usage in actions, puzzle generation, or experiment-affecting logic.
  Relevant code: `apps/server/src/actions/handlers/forage.ts`, `apps/server/src/actions/handlers/buy.ts`, `apps/server/src/simulation/puzzle-engine.ts`

- [x] Fix correctness issues in experiment reporting.
  Remove hardcoded assumptions such as fixed initial population sizes, and compute all summary metrics from stored run data.
  Done when survival and aggregate metrics are derived from persisted experiment state only.
  Relevant code: `apps/server/src/experiments/runner.ts`, `apps/server/src/db/queries/experiments.ts`

- [x] Wire experiment DSL interventions into real execution.
  The schema already exposes scheduled events, but experiment definitions must reliably schedule and apply them during runs.
  Done when `events` or shocks declared in experiment configs are visible in persisted run metadata and in event logs.
  Relevant code: `apps/server/src/experiments/schema.ts`, `apps/server/src/simulation/shocks.ts`

- [x] Define explicit experiment profiles.
  Introduce at least two official profiles:
  `deterministic_baseline`: seeded, no external LLMs, no cache-induced sharing, no nonessential stochastic subsystems.
  `llm_exploratory`: allows stochastic providers, but is clearly labeled non-deterministic.
  Done when every run records which profile it used and docs stop treating both classes as equally reproducible.

- [x] Capture full provenance for every experiment run.
  Persist config, effective overrides, seed, model IDs, temperatures, cache settings, prompt mode, normalization flags, and code version.
  Done when each exported result bundle is sufficient to reconstruct how a run was executed.
  Relevant code: `apps/server/src/experiments/runner.ts`, `apps/server/src/scripts/run-ensemble.ts`

---

## P1 - Methodological Hardening

- [x] Separate descriptive telemetry from validated scientific metrics.
  Label each metric as one of: `descriptive`, `heuristic`, `validated`, or `experimental`.
  Done when dashboards and reports no longer present heuristic proxies as if they were validated scientific measures.
  Relevant code: `apps/server/src/db/queries/analytics.ts`

- [x] Replace heuristic significance flags with proper statistical testing.
  Remove or clearly relabel rules such as “>10% difference = statistically significant”.
  Done when significance is reported only from multi-run comparisons with explicit tests, alpha, correction method, and effect size.
  Relevant code: `apps/server/src/db/queries/analytics.ts`, `apps/server/src/analysis/experiment-analysis.ts`, `apps/server/src/scripts/compare-ensembles.ts`

- [x] Tighten metric definitions and null models.
  Revisit `cooperationIndex`, clustering proxies, emergence index, and norm-emergence logic so each metric has a precise operational definition and a defensible null comparison.
  Done when every core metric has a short specification with formula, interpretation, and failure modes.

- [x] Make snapshot artifacts scientifically useful.
  Persist more than the final snapshot per run, and store the exact metric time series actually used in reports.
  Done when survival, economy, and behavior analyses can be regenerated from saved artifacts without re-running the simulation.
  Relevant code: `apps/server/src/experiments/runner.ts`, `apps/server/src/db/queries/experiments.ts`

- [x] Add whole-run reproducibility tests.
  Baseline-only experiments with the same seed should produce identical final hashes and event traces.
  Done when CI includes deterministic run regression tests, not only seeded RNG unit tests.
  Relevant code: `apps/server/src/scripts/test-reproducibility.ts`

- [x] Rework LLM cache methodology for experiments.
  Current cache sharing across “similar” agents may suppress behavioral diversity and inflate convergence.
  Done when scientific profiles either disable LLM cache or use a documented cache policy that preserves the intended experimental unit.
  Relevant code: `apps/server/src/cache/llm-cache.ts`

- [x] Freeze LLM comparison settings.
  Cross-model comparisons must pin temperature, token budgets, prompt mode, safety mode, normalization, and fallback policy.
  Done when LLM comparison runs cannot silently vary along infrastructure dimensions.
  Relevant code: `apps/server/src/llm/adapters/base.ts`, `apps/server/src/llm/adapters/openai-api.ts`, `apps/server/src/llm/adapters/claude-api.ts`, `apps/server/src/llm/capability-normalizer.ts`

- [x] Define a canonical benchmark world.
  Create a minimal benchmark configuration with nonessential features disabled unless they are the independent variable.
  Done when most comparative studies can run in a stable “core world” rather than the full feature surface.

- [x] Promote literature-anchored validation before novel claims.
  Reproduce at least one known artificial-society result under controlled settings before claiming higher-level emergence.
  Done when the project can point to a replicated benchmark with documented acceptance criteria.

---

## P2 - Publication and Trust Readiness

- [x] Add a study template for preregistration-style experiment specs.
  Include hypothesis, variables, controls, sample size, exclusions, and primary metrics.

- [x] Export complete research bundles.
  Each bundle should include config, provenance, snapshots, comparison outputs, and raw per-run metrics in a stable directory structure.

- [x] Revise documentation to distinguish current capability from target methodology.
  Any statement about reproducibility, significance, or scientific rigor should match the current implementation, not the intended end state.
  Relevant docs: `docs/appendix/scientific-framework.md`, `docs/public/research-guide.md`, `docs/experiment-design-guide.md`

- [x] Add scale and stress validation for research mode.
  Establish tested operating envelopes for agent count, tick duration, queue latency, and provider reliability.

- [x] Add an internal “claim review” gate.
  No new scientific metric or public research claim should ship without:
  a formula,
  a null model,
  a validation note,
  and an artifact path showing how it was computed.

---

## Exit Criteria

SimAgents can credibly present itself as a scientifically rigorous experimental platform only when all `P0` items are complete and most `P1` items are complete.

Until then, the correct positioning is:

- a strong exploratory multi-agent research platform,
- with serious engineering foundations,
- but with scientific claims that must remain conservative.
