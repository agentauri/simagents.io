# Staging, public beta and rollback

Status: preparation only. Direct production deployment, the existing Cloudflare account, production origins and one Free Turnstile widget are authorized/prepared in the [production dossier](production-deployment-2026-10-04.md). The user chose reuse of the existing Paid subscription without a new subscription or downgrade; additional usage charges remain unauthorized. An operator, monitoring destinations and a cloud-tested compatible rollback are still required. No Worker/Pages rollout has occurred.

Before any rollout request, present the exact clean candidate: commit and verified build-source receipt; immutable SPA, relay/admission bundles; catalog and schema versions; staging/production HTTPS origins; Turnstile hostname/action/site-key configuration; private secret references; subject coordinator migration/bindings and rate namespaces; expected infrastructure cost and hard account controls; operator/on-call owner; observability/log/backup retention settings; previous compatible candidate and tested rollback commands. Secret values never belong to this artifact.

## Staging verification

The user explicitly bypassed staging and authorized direct production. Backend validation and a rollback drill remain mandatory evidence; bypassing a staging destination does not make them pass. Deploy SPA, admission and relay separately using the same artifacts that passed candidate CI. Validate TLS, exact CORS origins, genuine fresh/single-use Turnstile proofs, hostname/action binding, token TTL and authenticated subject-preserving renewal, blocked inference while interaction is needed, explicit resume, hostile destinations/redirects, body/deadline caps, six coordinated leases and 50 rolling forwards/minute across Cloudflare locations. Native edge rate bindings are supplementary, not global. Verify the RAM coordinator's serialization, 90-second restart barrier and zero durable state in the real runtime; review all platform logs/export/backups against the temporary-data retention ceiling.

Only technical aggregate monitoring is allowed: service availability, admission outcomes/renewals, safe error categories, abuse refusals, forwarded counts and latency distributions. Relay overhead and provider time must be separated only where actually measurable. Never capture keys, prompts, responses, user model names/endpoints, request bodies/headers, payload-bearing stacks or raw IPs in operational logs. Unknown measurements are unavailable, not successful checks.

Configure a named operator and tested alarms before opening: unavailable service, elevated 5xx, unusual request/admission growth, repeated renewal failures and infrastructure-spend anomaly. Define thresholds, interval, owner and authorized notification destination in the concrete deployment record. The code's disabled observability setting is not proof of operator/account logging configuration.

## Operational instrumentation

The relay exposes numeric `Server-Timing` intervals: `upstream_http` covers
the outbound HTTP exchange, including network and bounded response-body
transfer; `relay_overhead` covers the remaining critical path, including
validation, coordinated admission and lease release. Provider internal
processing time cannot be inferred and remains unavailable. Neither header
contains a model, endpoint, key, subject or response content.

Relay and admission publish only validated numeric/categorical samples to
the same constant RAM coordinator. Five-minute bins retain at most 23 hours
and are pruned by the existing cleanup timer. No metric enters SQLite,
alarms, logs or a content analytics binding. Initial admission, authenticated
renewal, warming, antiabuse refusal, safe error classes and the two latency
components remain distinguishable. Histogram p95 values are bucket upper
bounds, not exact percentiles. Reads do not call a provider or Siteverify.

`GET /v1/metrics` requires a dedicated `METRICS_SECRET` of at least32
characters that differs from `AUTH_SECRET`. The admission read also requires
the configured SPA Origin. This is an operational credential; it adds no
user account or invitation. Configure it in both backends from a protected
local secret reference after assigning the operator. Never place it in the
SPA or a public config. Ordinary relay tokens and provider keys cannot read
metrics. Observability/content logging stays disabled.

Coverage is the current coordinator instance and successfully recorded
samples. Eviction/restart clears history; failed metric publication must not
be interpreted as zero traffic or a passed availability check. Combine these
observations with Cloudflare's aggregate invocation/availability counters
and alert on unavailable/stale signals. No account-wide billing cap is
implied by these counters.

`scripts/monitor-services.mjs` performs a one-shot provider-free health,
readiness and authorized aggregate read. It projects only allowed technical
fields, rejects redirects, bounds bodies/time and never logs raw errors or
responses. `docs/monitoring-config.example.json` is a proposal with no owner
or notification destination. Tests cover availability, 5xx, traffic,
renewals, both latency components, spend and unavailable billing signals.
An optional local billing snapshot must be fresh and contain only
`additionalUsageUsd` and `observedAt`; no live billing integration has been
established. A missing source is unavailable, never zero. The script does
not send notifications: the authorized destination, scheduled execution,
delivery test and real billing source are still release prerequisites.

## Compatible rollback drill

Retain the previous SPA, relay, admission, catalog and schemas as immutable release assets. Confirm IndexedDB version 2 and imported snapshot formats can be read by the rollback build; an older v1-only storage reader cannot serve as rollback. If the current migration cannot be read by the intended rollback version, block publication rather than testing a destructive downgrade.

In staging, load representative existing/new worlds, replay/trace records, vault metadata and RNG/metric snapshots. Record the drill's start time, switch to the retained artifact/configuration set, validate health/admission/probe paths with simulated upstreams, and reopen data without loss or hidden retry. Finish within 15 real minutes. Record exact hashes, schema/read receipts, observations and elapsed time. Do not delete the source data to make rollback appear compatible.

`scripts/rollback-data-smoke.ts` verifies both retained artifact inventories,
switches SPA bundles on one loopback origin, and checks byte-exact v2
records/accounting and encrypted vault on reload. It then explicitly unlocks,
probes and resumes with a one-request budget, reads captured responses and
replay, and switches back. Unrelated archives must remain byte-exact; replay's
latest current-tick snapshot may update only after explicit resume and must
retain its existing event identities/content. Reports distinguish this local
reader check from an actual Cloudflare rollback. Environment inputs are
`SIMAGENTS_ROLLBACK_CURRENT` and `SIMAGENTS_ROLLBACK_PREVIOUS`, each containing
`spa/`, `relay/worker.js` and `admission/worker.js` plus a clean SPA manifest.

## Public beta and stable

Open beta only after all original gates pass on the same candidate and deployment/opening authority is granted. Keep the beta label and conservative budgets; no invitation/account requirement is added. Infrastructure rollout, paid model checks and participant contact remain separate approvals.

Stable requires a separately reviewed beta exit record: public opening and observed timestamps at least seven days apart, at least 20 completed sessions from five distinct humans, zero open critical/high issues, compatible rollback passed, candidate identity and linked receipts. Do not infer humans from relay tokens/IP fingerprints or count automated fixtures as sessions. The release gate checker requires this record for stable versions; elapsed time alone is insufficient.

## User decisions and RAM coordinator (2026-10-04)

The user authorized direct production instead of staging, initially requested Free/USD 0, and then chose reuse of the existing Workers Paid account after Dashboard verification. No upgrade, downgrade, additional usage charge or relaxation of complete 24-hour technical retention is authorized. Included allocations and budget alerts are not hard account spending limits; establish the operational spending controls before public opening.

The new coordinator keeps per-subject and daily address-fingerprint state only in memory, under one constant object ID. It does not read/write durable storage or alarms. After restart it blocks new grants for 90 real seconds; the client checks readiness before obtaining a fresh proof. This availability tradeoff preserves limits without recoverable SQLite history. GC runs every five seconds and never evicts active entries to free capacity. Validate restart behavior, zero stored data, 6/50/4 limits and platform logging on the real production runtime before declaring the gate passed. The local workerd test uses real 91/97-second waits and checks zero SQLite keys both while counters are active and after GC.
