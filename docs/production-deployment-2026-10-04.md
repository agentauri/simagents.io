# Direct production deployment preparation — 2026-10-04

The user explicitly requested direct production deployment (`vai direttamente
in produzione`), bypassing staging. Deployment is authorized; paid provider
inference has not been authorized. The initial Free-only/USD 0 request was
subsequently revised to reuse the account's existing Paid plan, without a
downgrade, new subscription or authorization for additional usage charges.
The user kept complete retention at 24 hours.
This record does not claim that the original release gates have passed.

Reconciled 2026-10-22 against retained October 4 receipts. Deployed-state and
billing observations below are dated evidence, not a fresh live read. The
latest user decision explicitly denies paid provider calls. Resuming the goal
does not authorize the draft USD 5 campaign.

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
  ignored by Git. The deployed admission secrets came from
  `.tmp/production-private/admission-closed.json`, which omits `TURNSTILE_SECRET`.
  Admission therefore remained closed. Secret values must never appear in
  evidence or build output.
- Operational metric reads use a separate `METRICS_SECRET`, prepared in
  `.tmp/production-private/monitoring.json` and the two backend secret files.
  It differs from the signing secret, is not in the SPA, and was uploaded to
  both protected backends. The user designated himself (Matteo Scurati) as
  operator on 2026-10-22. An authorized notification destination, schedule and
  live billing signal are still required; the probe example does not establish them.

## Candidate and validation

The frozen candidate is
`5e6fb5b447beaad6f639c8f63e31b2e2c5888854f1a5e8f38b4cb3cd83e3325f`
at `088034f27d86ebb3f8df8fe2ca190a83cdb0d67f`, retained in
`.tmp/clean-candidate-5e6fb5b447be`. Its successful remote CI run is
[37208753220](https://github.com/agentauri/simagents.io/actions/runs/37208753220);
`.tmp/ci-088-artifact-match.json` records matching downloaded artifacts.
The final-candidate hour, native quota/disk pressure, browser and rollback
receipts are indexed in [the release status](byok-release-status.md).
All ordinary CI provider traffic is synthetic or blocked. New source changes
need a new clean candidate and may not inherit these gates automatically.

## Spending and retention decisions

Both protected backends and a technical Pages preview were deployed on
October 4. Admission was closed and the main SPA remained unchanged; no paid
provider inference occurred. The widget was created under the
[Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/).

The October 4 Dashboard read confirmed that this account already had Workers
Paid. At that time OAuth received HTTP 403 for subscriptions; its `standard`
setting alone was not used as billing evidence. The September 8–October 8
period showed approximately 23,880 Worker requests, 24,216 CPU milliseconds,
23,300 observability events and USD 0 additional billable usage. Three other
Workers and four queues remain unchanged. No downgrade or new subscription
is necessary or authorized.

The October 4 [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
review recorded 10 million requests and 30 million CPU milliseconds per month;
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
recorded one million requests and 400,000 GB-seconds. A single continuously
resident 128-MB coordinator is approximately 342,835 GB-seconds over 31 days,
before accounting for any additional objects or deployment overlap. This is
an estimate within the included duration allocation, not an invoice cap.
Paid automatically bills usage beyond its allocations. Per-subject limits,
edge limits and budget alerts do not guarantee zero account-wide overage.
Additional usage charges and paid provider calls remain unauthorized.

The previous persisted-counter implementation was unsuitable because SQLite Durable Objects expose
[30-day point-in-time recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
including stored key-value data; local alarm deletion does not certify
24-hour platform history erasure. The replacement keeps counters exclusively
in RAM under one constant object name, with no subject/IP fingerprint in
storage or object names. Local workerd verified zero durable keys during
activity and after cleanup. Real Cloudflare configuration/log evidence is
still required; the complete-retention criterion has not been relaxed.

## Rollback and remaining work

SPA production deployment recorded as unchanged after the October 4 drill:
`758e36b2-6014-4758-902c-c79cbd97c2e6`, immutable URL
`https://758e36b2.simagents-app.pages.dev`. Before replacing it, retain the
new candidate bundles, configuration and a tested compatible IndexedDB-v2
rollback build. The old production application's data-reader compatibility
has not been verified and must not be assumed.

The protected backend plus Pages preview rollback/restore completed in
99.55 seconds, with exact candidate code read back and the main SPA unchanged.
Receipt: `.tmp/cloud-rollback-5e6f-reviewed.json`. Six local EN/IT cases across
three browser engines separately checked the retained v2 data reader. This
does not establish compatibility of the old public main SPA.

Still open: genuine Turnstile verification and autonomous renewal, complete
platform retention review, all 11 real providers, full manual accessibility,
five-person usability, operational alarms/live billing, and public beta
and stable observations. Paid provider calls were explicitly denied. The
12-combination/48-attempt/USD 5 draft is not execution authority. A production
URL is not release certification.

## Retention solution under verification

SQLite counter persistence has been replaced with RAM-only state and a fixed
object name. The source does not store IP fingerprints, subjects or counters.
The 90-second cold-start barrier covers old rolling windows and leases;
five-second GC removes inactive entries. Local workerd passed real warmup and
expiry checks. The October 4 Cloudflare tests checked coordinated limits,
actual 15-minute token expiry and the namespace's `hasStoredData:false`.
Protected metrics use numeric/categorical RAM buckets with a 23-hour maximum.
Receipts: `.tmp/live-backend-validation-5e6f.json` and
`.tmp/cloud-quota-objects-readonly.json`. These observations do not prove full
platform log/backup retention or real Turnstile renewal; those requirements
remain open.
