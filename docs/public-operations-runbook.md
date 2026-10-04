# Staging, public beta and rollback

Status: preparation only. Routes, Cloudflare account, widget configuration, budget, owner, monitoring destinations and retained rollback versions are not yet approved or assigned. No deployment or infrastructure spending has occurred.

Before any rollout request, present the exact clean candidate: commit and verified build-source receipt; immutable SPA, relay/admission bundles; catalog and schema versions; staging/production HTTPS origins; Turnstile hostname/action/site-key configuration; private secret references; subject coordinator migration/bindings and rate namespaces; expected infrastructure cost and hard account controls; operator/on-call owner; observability/log/backup retention settings; previous compatible candidate and tested rollback commands. Secret values never belong to this artifact.

## Staging verification

Deploy SPA, admission and relay separately only after action-time authorization. Test the same artifacts that passed candidate CI. Validate TLS, exact CORS origins, genuine fresh/single-use Turnstile proofs, hostname/action binding, token TTL and authenticated subject-preserving renewal, blocked inference while interaction is needed, explicit resume, hostile destinations/redirects, body/deadline caps, six coordinated leases and 50 rolling forwards/minute across Cloudflare locations. Native edge rate bindings are supplementary, not global. Verify that counters and alarms remain atomic in the real runtime and review all platform logs/export/backups against the stated temporary-data retention ceiling.

Only technical aggregate monitoring is allowed: service availability, admission outcomes/renewals, safe error categories, abuse refusals, forwarded counts and latency distributions. Relay overhead and provider time must be separated only where actually measurable. Never capture keys, prompts, responses, user model names/endpoints, request bodies/headers, payload-bearing stacks or raw IPs in operational logs. Unknown measurements are unavailable, not successful checks.

Configure a named operator and tested alarms before opening: unavailable service, elevated 5xx, unusual request/admission growth, repeated renewal failures and infrastructure-spend anomaly. Define thresholds, interval, owner and authorized notification destination in the concrete deployment record. The code's disabled observability setting is not proof of operator/account logging configuration.

## Compatible rollback drill

Retain the previous SPA, relay, admission, catalog and schemas as immutable release assets. Confirm IndexedDB version 2 and imported snapshot formats can be read by the rollback build; an older v1-only storage reader cannot serve as rollback. If the current migration cannot be read by the intended rollback version, block publication rather than testing a destructive downgrade.

In staging, load representative existing/new worlds, replay/trace records, vault metadata and RNG/metric snapshots. Record the drill's start time, switch to the retained artifact/configuration set, validate health/admission/probe paths with simulated upstreams, and reopen data without loss or hidden retry. Finish within 15 real minutes. Record exact hashes, schema/read receipts, observations and elapsed time. Do not delete the source data to make rollback appear compatible.

## Public beta and stable

Open beta only after all original gates pass on the same candidate and deployment/opening authority is granted. Keep the beta label and conservative budgets; no invitation/account requirement is added. Infrastructure rollout, paid model checks and participant contact remain separate approvals.

Stable requires a separately reviewed beta exit record: public opening and observed timestamps at least seven days apart, at least 20 completed sessions from five distinct humans, zero open critical/high issues, compatible rollback passed, candidate identity and linked receipts. Do not infer humans from relay tokens/IP fingerprints or count automated fixtures as sessions. The release gate checker requires this record for stable versions; elapsed time alone is insufficient.

## User decisions and RAM coordinator (2026-10-04)

The user authorized direct production instead of staging, restricted infrastructure to Free/USD 0, and kept complete technical retention at 24 hours. No paid upgrade or relaxation of retention is authorized. The pending deployment must verify Free-plan eligibility.

The new coordinator keeps per-subject and daily address-fingerprint state only in memory, under one constant object ID. It does not read/write durable storage or alarms. After restart it blocks new grants for 90 real seconds; the client checks readiness before obtaining a fresh proof. This availability tradeoff preserves limits without recoverable SQLite history. GC runs every five seconds and never evicts active entries to free capacity. Validate restart behavior, zero stored data, 6/50/4 limits and platform logging on the real Free runtime before declaring the gate passed. The local workerd test uses real 91/97-second waits and checks zero SQLite keys both while counters are active and after GC.
