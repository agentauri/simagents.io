# Research Bundles

The batch runner now exports a stable research bundle per experiment directory.

## Bundle Layout

```text
results/<experiment>-<timestamp>/
  manifest.json
  report.json
  report.csv
  research-bundle.json
  runs/
    <condition>-run-1.json
    <condition>-run-2.json
```

## Guaranteed Contents

- experiment metadata and code version
- resolved scientific profile and benchmark world
- effective runtime configuration
- cache and prompt transformation settings
- resolved interventions
- per-run final metrics
- snapshot-derived survival and economic analyses
- event trace and final state hashes

## Operating Envelope

Research mode should be validated with deterministic baseline runs before scaling up to LLM comparisons.

- start with `canonical_core_benchmark.yaml`
- increase ticks before increasing feature surface
- treat any run with provider/network instability as exploratory
- use `apps/server/src/scripts/validate-research-mode.ts` to record throughput and artifact hashes across a small validation matrix

## Claim Review Gate

Before publishing a new scientific claim, fill out `docs/templates/claim-review-template.md` and link the exact research bundle used as evidence.
