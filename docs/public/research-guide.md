# Research Guide

This guide explains how to use SimAgents as a research platform without overstating what a run can prove.

## Research Posture

SimAgents now separates runtime capability from claim strength.

1. **Deterministic baseline first**: strong claims start from `canonical_core` plus `deterministic_baseline`.
2. **Explicit intervention layers**: the full platform includes designed incentives and must be labeled accordingly.
3. **Replicate before inferring**: inferential reporting requires at least two conditions with at least two runs per condition.
4. **Corrected statistics only**: significant findings should come from replicated comparisons with multiple-comparison correction.
5. **Bundle everything**: publish the config, seed schedule, claim class, and research bundle used as evidence.

---

## Choose the Right Surface

| Surface | Typical config | What it is for | What it is not for |
|---------|----------------|----------------|--------------------|
| Lower-imposition benchmark | `benchmarkWorld: canonical_core`, `profile: deterministic_baseline` | replicated comparative studies, baseline validation, literature-style controls | free-form LLM novelty claims |
| Exploratory platform | `profile: llm_exploratory` or other full-surface runs | prompt research, intervention studies, rich mechanic exploration | strong minimal-imposition claims |

Strong claims belong only to the first row, and only after replication.

---

## Designing Experiments

### Validated Path

Use this path when you want the run to be eligible for `validated` claim class:

```yaml
name: "canonical_trade_vs_conflict"
description: "Compare lower-imposition conditions under deterministic controls"
seed: 12345
profile: deterministic_baseline
benchmarkWorld: canonical_core

agents:
  - type: baseline_rule
    count: 6
  - type: baseline_random
    count: 6

duration: 300

metrics:
  - gini
  - survival_rate
  - trade_count
  - conflict_count
```

### Exploratory Path

Use this path when you want richer mechanics or live provider behavior:

```yaml
name: "trust_pricing_intervention"
description: "Observe how provider-backed agents respond to trust-mediated pricing"
seed: 12345
profile: llm_exploratory
benchmarkWorld: full_surface

agents:
  - type: claude
    count: 4
  - type: gemini
    count: 4
  - type: baseline_rule
    count: 4

duration: 300
```

This can still produce valuable data, but the output should be treated as exploratory unless the report says otherwise.

### Running Experiments

**Self-hosted** — run experiments via the CLI:

```bash
cd apps/server

# Validate config
bun run src/experiments/runner.ts --config experiments/my-experiment.yaml --dry-run

# Run once
bun run src/experiments/runner.ts --config experiments/my-experiment.yaml --output results/

# Run replicated batch
bun run src/experiments/runner.ts --config experiments/my-experiment.yaml --runs 5 --output results/
```

Experiments can also be submitted via the API:

```bash
# Seed a built-in experiment template
curl -X POST http://localhost:3000/api/experiments/seed/all \
  -H "X-Admin-Key: your-admin-key"

# Start an experiment
curl -X POST http://localhost:3000/api/experiments/{id}/start \
  -H "X-Admin-Key: your-admin-key"

# Get results
curl http://localhost:3000/api/experiments/{id}/results
```

See the [API Reference](./api-reference.md#experiments-api) for the full experiments API.

### Canonical Starting Point

```bash
cd apps/server
bun run src/experiments/runner.ts --config experiments/canonical-core-benchmark.yaml --runs 2 --output results/
```

Start here before scaling up to full-surface or provider-backed studies.

---

## Claim Classes

SimAgents reports every experiment with a claim posture:

- `validated`: replicated comparative evidence under `canonical_core` + `deterministic_baseline`
- `exploratory`: replicated comparative evidence with richer mechanics, provider stochasticity, or other non-validated controls
- `descriptive_only`: single-condition runs, under-replicated comparisons, or reports that do not satisfy inferential gates

In practice:

- one condition with many runs is still `descriptive_only`
- two conditions with one run each is still `descriptive_only`
- only replicated multi-condition comparisons can produce inferential findings

---

## Baseline Agents

Use baselines as controls, not as decoration.

### `baseline_random`

Uniform random action selection. This is the null model.

### `baseline_rule`

Hand-authored heuristics for survival and basic economy. Use it to test whether a richer policy actually beats simple procedural behavior.

### `baseline_qlearning`

Tabular reinforcement-learning baseline. Use when you want a non-LLM adaptive comparator.

**Note:** Q-learning state is automatically reset between experiment runs via `resetQLearningState()` in the runner. This ensures observation independence across runs so that learned Q-values from one run do not carry over and bias the next.

### `baseline_sugarscape`

The literature-baseline agent used by `apps/server/experiments/sugarscape-replication.yaml`. At the moment it is best treated as a controlled baseline and partial replication path, not as a fully validated literature reproduction.

---

## Intervention Mechanics

The following mechanics belong to the full platform surface. They are disabled in `canonical_core`.

### Cooperation Incentives

| Mechanic | Full-platform effect |
|----------|----------------------|
| Gather | Nearby agents can increase effective yield |
| Forage | Nearby agents can increase success rate |
| Public work | Nearby workers can increase pay |
| Solo penalties | Isolation can reduce efficiency or payout |
| Group gather | Rich spawns can require multiple agents to harvest fully |

### Market and Relationship Mechanics

| Mechanic | Full-platform effect |
|----------|----------------------|
| Trust-based pricing | Shelter prices can shift with trust |
| Trade bonuses | Trusted or repeated partners can receive better terms |
| Spoilage | Perishable items create urgency and trade pressure |
| Puzzle system | Agents can enter cooperative puzzle loops and focus-lock into them |

These are legitimate things to study. They simply should not be described as absent when they are active.

---

## Metric Tiers

Not every metric is the same kind of evidence.

### Validated or Strong Descriptive Metrics

| Metric | Tier | Notes |
|--------|------|-------|
| Survival rate | `validated` | Direct operational meaning from stored snapshots |
| Gini coefficient | `validated` | Standard inequality statistic over balances |
| Average wealth | `descriptive` | Useful state summary, but not an inferential claim by itself |
| Trade count | `descriptive` | Throughput measure, not a direct cooperation claim |
| Conflict count | `descriptive` | Incident volume, not severity or norm structure |
| Average hunger / energy | `descriptive` | Useful welfare summaries for condition comparisons |

### Heuristic and Experimental Metrics

| Metric | Tier | Notes |
|--------|------|-------|
| Cooperation index | `heuristic` | Composite proxy from the analytics registry; use carefully |
| Clustering / trust-network density | `heuristic` | Sensitive to radius and graph definitions |
| Emergence index / norm emergence | `experimental` | Exploratory diagnostics, not claim-safe endpoints |

Use heuristic metrics to generate hypotheses, not to carry the strongest part of a claim by themselves.

---

## Reproducibility

### What Is Reproducible

Whole-run determinism is enforced for the deterministic baseline path:

- seeded execution
- canonicalized event-trace hashing
- final-state hashing
- research bundle export with per-run artifacts

### Scientific Controls for Reproducibility

Two controls are applied automatically to prevent systematic bias between runs:

**Agent processing-order shuffle.** Each tick, the alive agent list is shuffled using a deterministic (seeded) Fisher-Yates algorithm before any decisions are processed. Without this, the first agent processed each tick would be able to consume resources before others, creating a systematic advantage correlated with database insertion order. See `orchestrator.ts`.

**Q-learning state reset.** Between experiment runs, all tabular Q-learning state is cleared via `resetQLearningState()`. This ensures that each run begins with a clean Q-table, preserving observation independence across the run population. See `runner.ts`.

### What Is Not Fully Reproducible

Provider-backed LLM runs can still be valuable, but they are not deterministic in the same sense:

- provider responses can vary
- latency and upstream behavior can change
- identical seeds do not imply identical trajectories

### Research Bundles

Each experiment directory can include:

```text
results/<experiment>-<timestamp>/
  manifest.json
  report.json
  report.csv
  research-bundle.json
  runs/
    <condition>-run-1.json
```

The bundle captures the resolved profile, benchmark world, runtime config, scientific controls, final metrics, and artifact hashes.

---

## Statistical Guidance

### Minimum Standard for Inferential Reporting

1. Use at least two conditions.
2. Run each condition at least twice.
3. Prefer 5-10 runs per condition before treating null results as persuasive.
4. Report effect size, not only p-values.
5. Use corrected p-values when testing multiple metrics.

The runner now reports corrected findings using Holm-Bonferroni when the replication gate is satisfied.

### Practical Workflow

1. Dry-run the config.
2. Run `canonical-core-benchmark.yaml` to confirm the environment is stable.
3. Execute your replicated study.
4. Inspect `report.claimClass` before interpreting `significantFindings`.
5. Archive the research bundle used for the claim.

---

## Statistical Infrastructure

The analysis module (`experiment-analysis.ts`) provides a complete statistical toolkit. All functions listed below are exported and available for use in custom analysis scripts.

### Normality Testing

```typescript
import { normalityTest } from '../analysis/experiment-analysis';

const result = normalityTest(values);
// result: { statistic: number, pValue: number, isNormal: boolean }
```

The `normalityTest()` function uses two strategies depending on sample size:

- **n >= 20:** Jarque-Bera statistic, which tests whether sample skewness and kurtosis are consistent with a normal distribution.
- **n < 20:** Skewness z-test combined with an excess-kurtosis z-test (Bonferroni-corrected for both), which has better small-sample properties than Jarque-Bera.

Normality at alpha = 0.05 is reported via the `isNormal` boolean.

### Automatic Test Selection

```typescript
import { autoSelectTest } from '../analysis/experiment-analysis';

const result = autoSelectTest(group1, group2);
// result: { test: StatisticalTest, testUsed: 'welch-t' | 'mann-whitney-u', reason: string } | null
```

`autoSelectTest()` runs `normalityTest()` on both groups and selects the appropriate comparison:

- If both groups pass normality: **Welch's t-test** (parametric).
- If either group fails normality: **Mann-Whitney U** (non-parametric).
- If either group has fewer than 3 observations: returns `null` (not enough data).

The `reason` field provides a human-readable explanation of the selection logic, including the p-values from each normality test.

### A Priori Power Analysis

```typescript
import { requiredSampleSize } from '../analysis/experiment-analysis';

const n = requiredSampleSize(0.5);        // medium effect, 80% power, alpha 0.05 -> 63
const n2 = requiredSampleSize(0.8, 0.90); // large effect, 90% power -> 34
```

`requiredSampleSize(effectSize, power?, alpha?)` estimates the minimum number of runs per condition needed to detect a given Cohen's d effect size. Use this before running experiments to ensure adequate statistical power. The formula is based on the two-sample z-approximation: `n = 2 * ((z_alpha + z_beta) / d)^2`.

| Target effect | Power 0.80 | Power 0.90 |
|---------------|------------|------------|
| Small (0.2)   | ~394       | ~526       |
| Medium (0.5)  | ~63        | ~85        |
| Large (0.8)   | ~25        | ~34        |

### Proper t-Distribution

The following functions implement exact Student's t-distribution computation using the regularized incomplete beta function:

- **`studentTCDF(t, df)`** -- Cumulative distribution function of the t-distribution. Replaces the previous normal CDF approximation. Accurate at all sample sizes, including small n.
- **`studentTInverse(p, df)`** -- Inverse CDF (quantile function) using bisection. Used to derive critical values for confidence intervals.

These are used internally by `tTest()` and `confidenceInterval()`:

- **`tTest()`** now computes p-values from the Student's t-distribution CDF instead of a normal approximation. This gives accurate p-values for small samples where the normal approximation underestimates tail probabilities.
- **`confidenceInterval()`** now uses `studentTInverse()` to obtain t-distribution critical values rather than fixed z-scores (1.96, 2.576, etc.). This produces properly wider intervals when sample size is small.

### Mann-Whitney U Fix

The `mannWhitneyU()` function previously contained a bug where `find()` on the combined array would return the same element reference for all duplicates with equal values, causing incorrect rank assignments. The function now iterates over the combined array by index and assigns averaged ranks correctly for tied values using a Map keyed by object identity.

### Additional Tests in metric-validator.ts

The metric validation module provides three additional non-parametric tests:

| Test | Function | Description |
|------|----------|-------------|
| Permutation test | `permutationTest(group1, group2)` | 10,000 permutations with seeded RNG. Makes minimal distributional assumptions. |
| Chi-squared test | `chiSquaredTest(observed, expected)` | Tests categorical distributions. Uses Wilson-Hilferty approximation for p-values. |
| Kolmogorov-Smirnov test | `kolmogorovSmirnovTest(group1, group2)` | Two-sample KS test comparing empirical distribution functions. |

These are available for custom analysis and are also used by the comprehensive comparison function `comprehensiveStatisticalComparison()`, which runs all tests in parallel and generates a combined recommendation.

---

## Pre-Registration

Experiment YAML configs support a `preRegistration` field that enables hypothesis registration and enforcement at report time.

### Schema

```yaml
name: "my-experiment"
hypothesis: "Agents with access to trade will achieve higher survival rates"

preRegistration:
  hypothesis: "Agents with access to trade will achieve higher survival rates"
  primaryMetrics: ["Survival Rate", "Gini Coefficient"]
  registeredAt: "2026-03-16T00:00:00Z"

agents:
  # ...
```

### What the Runner Enforces

When a `preRegistration` block is present, the runner performs the following checks at report generation time:

1. **Hypothesis consistency.** If the top-level `hypothesis` field differs from the pre-registered `hypothesis`, a deviation is recorded. This catches post-hoc hypothesis changes.

2. **Primary metrics presence.** Each metric listed in `primaryMetrics` is checked against the report output. Missing metrics generate deviations.

3. **Post-hoc finding flagging.** Any significant finding on a metric that is not listed in `primaryMetrics` is flagged as exploratory/post-hoc, not confirmatory. This is recorded in the deviations array.

### Report Output

The report includes a `preRegistration` object:

```json
{
  "preRegistration": {
    "registered": true,
    "hypothesis": "Agents with access to trade will achieve higher survival rates",
    "primaryMetrics": ["Survival Rate", "Gini Coefficient"],
    "registeredAt": "2026-03-16T00:00:00Z",
    "deviations": [
      "Significant finding on non-pre-registered metric \"Trade Count\". This should be reported as exploratory/post-hoc, not confirmatory."
    ]
  }
}
```

If no `preRegistration` block is present, the report will contain `registered: false` with empty arrays.

---

## Threats to Validity

Every experiment report includes an auto-generated `threatsToValidity` array. This is produced by `generateThreatsToValidity()` in the runner and covers the following categories:

### Internal Validity

- **Small sample size.** Flagged when any condition has fewer than 5 runs. The warning recommends using `requiredSampleSize()` for a priori power analysis.
- **LLM non-determinism.** Flagged when any run uses LLM-backed agents. Even with fixed seeds, provider-side stochasticity means results are not fully reproducible.
- **Cache effects.** Flagged when LLM cache was enabled. Cached decisions may mask behavioral variability and reduce observation independence.
- **Cooperation/trust confounders.** Flagged when cooperation incentives, trust-based pricing, or trade bonuses were active. These designed affordances can confound emergent behavior claims.

### External Validity

- **Short experiment duration.** Flagged when the experiment ran for fewer than 100 ticks. Emergent patterns may need longer runs to stabilize.

### Construct Validity

- **Low statistical power.** Flagged when any metric comparison has achieved power below 0.80. Non-significant results may reflect insufficient power rather than true null effects.

### Reproducibility

- **Hash inconsistencies.** Flagged when runs sharing the same seed produce different event-trace hashes, indicating non-deterministic execution paths.

### Descriptive Limitations

- **Descriptive-only classification.** Flagged when the experiment produced only descriptive results (single condition or insufficient replication), as a reminder that no comparative claims can be made.

These threats appear in both the JSON report (`report.threatsToValidity`) and the CSV export. They are informational and do not block report generation. Review them before making any scientific claims based on the experiment results.

---

## Shock Injection

Shocks are useful when the study is explicitly about intervention or resilience.

### Economic Shock

```yaml
shocks:
  - tick: 500
    type: economic
    params:
      currencyChange: -0.5
```

### Disaster Shock

```yaml
shocks:
  - tick: 500
    type: disaster
    params:
      type: drought
      severity: 0.7
      duration: 100
      region: [40, 40, 60, 60]
```

### Rule Shock

```yaml
shocks:
  - tick: 500
    type: rule
    params:
      modify: gather_rate
      factor: 0.5
```

If shocks materially alter the world, the resulting claim is usually exploratory unless the intervention itself is the object of the study.

---

## Publishing Checklist

When publishing or sharing findings, include:

1. the exact experiment config
2. the seed schedule
3. the software version or commit hash
4. the model versions used, if any
5. the metric definitions used
6. the report `claimClass`
7. the linked research bundle

Before making a strong claim, fill out the internal claim-review template and attach the bundle that supports it.

---

## Known Limitations

1. Provider-backed LLM runs remain non-deterministic.
2. `cooperationIndex` is a heuristic summary, not a primary validated endpoint.
3. Full-platform mechanics can shape outcomes substantially; that is a feature, but it must be disclosed.
4. Literature validation through the Sugarscape path is available but not yet a completed validated replication program.

---

## Further Reading

- [Scientific Framework](https://github.com/agentauri/simagents.io/blob/main/docs/appendix/scientific-framework.md)
- [Experiment Design Guide](https://github.com/agentauri/simagents.io/blob/main/docs/experiment-design-guide.md)
- [Metric Specification](https://github.com/agentauri/simagents.io/blob/main/docs/metric-specification.md)
- [Research Bundles](https://github.com/agentauri/simagents.io/blob/main/docs/research-bundles.md)
