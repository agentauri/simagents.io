# Direct production deployment preparation — 2026-10-04

The user explicitly requested direct production deployment (`vai direttamente
in produzione`), bypassing staging. Deployment is authorized; paid provider
inference and an infrastructure-spend ceiling have not yet been authorized.
This record does not claim that the original release gates have passed.

## Destinations and configuration

- SPA: `https://app.simagents.io`, existing Cloudflare Pages project
  `simagents-app`, production branch `main`.
- Documentation: `https://doc.simagents.io`, existing project `simagents-docs`.
- Relay: `https://relay.simagents.io`, Worker `simagents-relay`.
- Admission: `https://admission.simagents.io/v1/session`, Worker
  `simagents-admission`, separate from forwarding.
- Account: `f7f02ae9a218a57974d176a3eaaaca90`; existing Wrangler OAuth works.
- Turnstile: one Free managed widget, public site key
  `0x4AAAAAAFNSn4rIOBb4XcTN`, restricted to `app.simagents.io`, no clearance
  cookie, server action `simagents-session`. No Enterprise option or plan
  upgrade was requested. Its creation receipt is `.tmp/production-widget-intent.json`.
- Exact SPA origin allowlist: `https://app.simagents.io`. Six coordinated
  simultaneous requests, 50 rolling forwards/minute/subject, four
  mints/minute, 900-second tokens and renewal at minute 13.
- Compiled relay/admission bundles are deployed without rebundling. Public
  build configuration is in CI; signing and Turnstile secrets are not.
- Private local secret references: `.tmp/production-private/relay.json` and
  `.tmp/production-private/admission.json`, directory 0700/files 0600,
  ignored by Git. Secret values must never appear in evidence or build output.

## Candidate and validation

The current production-configured candidate and verification receipts are in
`.tmp/production-candidate.log` and `.tmp/production-verification`. A clean
checkpoint and the exact remote CI artifact must replace the dirty local
candidate before deployment. Native zoom/browser reports on the earlier
unconfigured checkpoint are preliminary evidence, not transferable gates.
CI's admission runner now serves the same production SPA with synthetic
widget/upstream responses; no real provider traffic is permitted in CI.

## Spending and retention decisions

No Worker/Pages rollout or paid inference has yet occurred. Creating the
Turnstile Free widget adds no charge under the
[Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/).

Available OAuth can read Worker settings but receives HTTP 403 for account
subscriptions. `default_usage_model=standard` does not establish the active
billing plan. The [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
requires distinguishing Free from Paid; a Paid plan starts at USD 5/month and
can incur usage charges. A proposed SimAgents incremental infrastructure
budget is USD 10/month, subject to explicit authorization, plan verification
and operational monitoring. This is not a platform-enforced invoice cap.
No plan upgrade or spend has been performed.

Active application counters are deleted as minute windows/90-second leases
expire. However, SQLite Durable Objects expose
[30-day point-in-time recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
including stored key-value data; local alarm deletion does not certify
24-hour platform history erasure. The original 24-hour complete-retention
criterion remains open. Do not claim it is satisfied or silently relax it.

## Rollback and remaining work

Current SPA production deployment retained by Pages:
`758e36b2-6014-4758-902c-c79cbd97c2e6`, immutable URL
`https://758e36b2.simagents-app.pages.dev`. Before replacing it, retain the
new candidate bundles, configuration and a tested compatible IndexedDB-v2
rollback build. The old production application's data-reader compatibility
has not been verified and must not be assumed.

Deployment preparation still needs exact remote CI, final-candidate browser
and 60-minute evidence, real Cloudflare expiry/renewal/limits/retention
receipts, a compatible rollback drill and operational alarms/owner. The
12-combination/48-attempt/11-provider manifest remains unapproved and
unexecuted; its separate proposed inference budget is USD 5 with dedicated
keys, no retries/fallbacks and stop on the first failure. Human usability and
public-beta/stable criteria remain open. A production URL is not release
certification.
