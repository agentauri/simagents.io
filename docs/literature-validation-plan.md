# Literature Validation Plan

The browser-only app is suitable for exploratory replication work, but strong literature-aligned claims still require careful controls.

## Current Posture

- Browser runs can demonstrate mechanics and produce exportable traces.
- Single runs are not enough for inferential claims.
- Claims should name the exact imposed mechanics active during the run.
- Exported artifacts should include world JSON plus experiment JSON/CSV summaries.

## Minimal Validation Steps

1. Lock seed, roster, prompt, and runtime config.
2. Run matched baseline and treatment conditions.
3. Export world and experiment artifacts after each run.
4. Fill out a claim-review template.
5. Separate descriptive observations from inferential claims.

## Acceptance Criteria For Stronger Claims

- multiple replicated runs
- predeclared hypothesis and metric
- matched baseline condition
- documented exclusions and failures
- artifact bundle with stable files
- independent review of metric interpretation
