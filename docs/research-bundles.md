# Research Bundles

Use browser exports as the source material for review bundles. A bundle should be small enough to inspect manually and explicit enough to reproduce the local setup.

## Recommended Layout

```text
bundle/
  README.md
  world-export.json
  experiment-run.json
  experiment-run.csv
  config-notes.md
  claim-review.md
```

## Required Notes

- app commit hash
- date and timezone
- world seed
- roster and provider settings
- custom prompt state
- runtime config overrides
- manual interventions
- known limitations

## Claim Review

Use `docs/templates/claim-review-template.md` before publishing a result. Mark browser-local single runs as exploratory unless they are part of a replicated comparison with locked settings.
