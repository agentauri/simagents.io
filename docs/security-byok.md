# BYOK Security Notes

Provider keys stay in tab memory by default. The active browser origin remains the security boundary.

## Current Position

- The Web Worker receives active keys only when a local run starts. Key edits/locking stop the session and terminate the Worker holding its copy.
- Optional storage at `simagents_credential_vault_v1` encrypts the credential map with AES-256-GCM, using a fresh 16-byte salt and 12-byte IV per save and an authenticated format identifier. PBKDF2-SHA256 derives a non-extractable key with 600,000 iterations.
- Neither the passphrase nor derived key is persisted. Reload requires explicit unlock. The application cannot recover a forgotten passphrase.
- Legacy `simagents_api_keys` is detected without automatic loading. The user explicitly moves it to session memory or encrypts it. Failed validation/encryption/storage preserves the legacy value; a locked archive cannot be overwritten by migration.
- Encrypted saves are explicit. Removing a session key does not edit the saved archive; use an explicit encrypted save or remove the archive separately.
- Direct-CORS providers are called from the browser. Other providers use a user-configured HTTPS relay. The official relay is implemented but undeployed. It uses a fixed allowlist and separate signed access tokens. The admission service validates a Turnstile proof and issues 15-minute authorization without accounts. Tokens stay outside the provider vault; renewal does not recreate the world or invalidate model verification. The coordinator uses one constant Durable Object identifier and keeps subjects, daily HMAC address fingerprints and counters only in RAM. It never accesses durable storage or alarms, so these values are not added to SQLite/PITR history. A five-second timer removes expired minute windows and 90-second leases. A cold/restarted instance refuses new grants for 90 seconds so losing RAM cannot bypass prior limits. The SPA waits for readiness before requesting a proof and never automatically retries inference. Platform request/log retention still requires operational verification. No provider keys, prompts, responses or raw addresses are written to these records. Deployed Cloudflare settings still need validation. The app does not control retention by a user-supplied relay.

Encryption protects stored data while locked; it does not protect decrypted keys against malicious scripts running on the origin. JavaScript strings also cannot be guaranteed to be erased from browser-managed memory. The implementation clears references and terminates the credential-bearing Worker on lock.

## Implemented Guardrails

- `apps/web/index.html` defines a Content Security Policy that blocks objects and non-local workers, and permits external scripts/frames only from `https://challenges.cloudflare.com` for the explicit Turnstile flow. The widget is loaded only for an access attempt.
- React renders LLM and event text as text nodes; the app does not use `dangerouslySetInnerHTML`.
- `apps/web/src/utils/security.ts` sanitizes displayed LLM/event strings by stripping control characters and truncating long content.
- Provider keys are not written into snapshots, replay frames, prompt logs, or experiment exports.

The current audit command for dangerous HTML/script sinks is:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|eval\\(|new Function|document\\.write|DOMParser" apps/web/src apps/web/index.html packages/engine/src packages/shared/src
```

Run this check alongside the current test suite; an older audit is not a substitute for checking the current bundle.

## CSP Notes

The static meta CSP in `apps/web/index.html` uses:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-src 'none';
img-src 'self' data: blob:;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self';
worker-src 'self' blob:;
connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss:;
```

`connect-src` intentionally allows HTTPS because users can choose provider and proxy origins at runtime. Tightening this to a fixed allowlist would require a deployment-specific CSP generator or a runtime proxy-only mode.

`style-src 'unsafe-inline'` is retained for the current React/Vite UI. Do not add `script-src 'unsafe-inline'`.

## Verification

`credential-vault.test.ts` covers encrypted round trips, altered ciphertext, wrong passphrases, reload/lock, concurrent changes and failed migration writes. `credential-smoke.mjs` exercises real browser Web Crypto against the production bundle with synthetic keys. `byok-production-smoke.mjs` checks request/token limits, production rejection of baselines and Worker termination when locking after an error. These checks do not certify real provider/model availability or replace a security review.

## Review Checklist

Before merging any browser-local feature that displays model output, imported world data, proxy responses, or user-entered rich text:

1. Keep rendering as React text nodes.
2. Do not introduce `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`.
3. Use `sanitizeText`, `sanitizeReasoning`, or a stricter validator for visible untrusted strings.
4. Keep provider keys out of logs, snapshots, replay frames, prompt logs, and exports.
5. Re-run the audit command above and the browser smoke test.

## Optional local request diagnostics

Request capture is disabled by default and requires selection in the start dialog for each session. It stores prompt/request bodies and provider response text in IndexedDB on this device. Authentication headers and URLs are excluded, and known in-memory credentials (including relay tokens) are redacted before delivery to the browser UI. This is credential redaction, not a general detector of sensitive information in user-provided prompts or model output.

Capture is bounded to 100 completed simulation attempts per session and 16,384 characters per body. The inspector marks redacted/truncated records, keeps them distinct from reconstructed event summaries and exposes no code execution. Verification probes and experiment runs are not captured. Trace data shares the secondary storage budget; world exports do not include it. Starting a new world/reset clears prompt history; storage-pressure controls can explicitly remove secondary data. Full browser teardown can still interrupt a pending save.

## Public relay admission and renewal

The configured public relay uses a separate `POST /v1/session` admission endpoint. The server validates exact SPA origin, Turnstile hostname/action and proof timestamp using [Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/); each attempt must have a fresh proof. The browser requests renewal two minutes before expiry and sends its existing signed token to retain the subject. Admission contains only the proof and previous relay token, never a provider key or experiment content.

A challenge needing interaction, failed renewal or expiry blocks relay access in the engine Worker and pauses its world. Closing the challenge does not bypass the block. A successful token update authorizes subsequent requests but never resumes inference automatically. The user resumes explicitly. Access tokens do not enter the encrypted vault, browser storage or experiment exports.

The subject coordinator limits six simultaneous forwarding leases and 50 forwards per rolling minute. Native edge bindings are supplementary [location-local rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), not global subject counters. Issuance has coordinated fingerprint/subject limits. These are technical abuse controls, not personal identity or complete protection against distributed users. Cloudflare deployment, logging configuration, alarm expiry and multi-location behavior require real staging verification; all existing automated evidence is local and simulated.

## Published rates and reported consumption

Provider usage is optional and is never fabricated from text length. Metrics retain known reported input/output totals and their sample coverage. Gemini totals include reported thinking usage where the metadata establishes it; contradictory totals and unsupported/missing components cannot authorize a cost estimate. Cache activity blocks the simple uncached-rate estimate. Legacy combined totals remain readable, while absent splits/coverage remain unavailable.

The published-rate catalog binds exact requested model, endpoint/commercial route, currency, retrieval date, source and conditions. It is pricing documentation, not provider compatibility certification or an invoice. The UI's estimate covers only recorded decisions with complete eligible usage under one unchanged context and an applicable, non-stale rate. Unknown models/paths, mixed contexts, missing usage, stale prices and outside-tier inputs return unavailable, never an invented zero. Probes, failed/cancelled calls, fees/taxes and unreported components may still be charged separately.
