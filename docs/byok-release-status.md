# BYOK release implementation status

Updated 2026-10-22. **The five-block release objective is incomplete.** This
review reconciles the retained 2026-10-04 receipts; it is not a fresh claim
about today's deployed configuration, billing, dependencies or provider availability.
Historical sections below apply only to their stated checkpoint. The October
22 continuation adds action-matrix verification, accessible configuration
controls and documentation corrections. Promotion requires fresh evidence on
its own clean candidate; the October 4 receipts do not certify these changes.

## Candidate and preserved evidence

The retained October 4 candidate is
`5e6fb5b447beaad6f639c8f63e31b2e2c5888854f1a5e8f38b4cb3cd83e3325f`,
commit `088034f27d86ebb3f8df8fe2ca190a83cdb0d67f`. Its manifest was reverified
before this continuation's edits. The evidence archive is
`.tmp/release-evidence-5e6f-completed.tar.gz`, 72,583,622 bytes, SHA-256
`108f3f60b349ba6c976b14427ac78f34e2448923d369b30c6613a2883612a9d1`;
the archive checksum was reverified on 2026-10-22. These ignored local files
must be retained with the frozen artifacts; a clean clone alone does not
contain the evidence. New candidate identities require their own evidence.

| Original block | Proven scope on the frozen candidate | Remaining release requirements |
| --- | --- | --- |
| 1. Responsive, accessible EN/IT UI | Three-engine public matrices, desktop/tablet/390px, EN/IT and native 200% zoom; 816 automated A/AA reports with zero violations | Complete manual keyboard, pointer and accessibility review; resolve any blocking findings. Automated checks do not establish full accessibility. |
| 2. Correctness, storage and duration | Snapshot/action regressions, indexed transactional storage; native Firefox quota denial in EN/IT, isolated physical disk pressure, and a real 60-minute/20-agent run with restored counters | Complete review of every action's effects/costs/events. The 2026-10-22 matrix expansion is local work, not transferred evidence for the frozen candidate. |
| 3. Public relay and 11 providers | Protected Cloudflare backends, hostile-origin/target and token guards, real 15-minute expiry, coordinated 6/50/4 limits, `hasStoredData:false` | Genuine Turnstile hostname/action/single-use checks, autonomous SPA renewal, full platform retention verification, and all 11 real providers. Admission was deliberately closed. |
| 4. CI and exact candidate | [Remote run 37208753220](https://github.com/agentauri/simagents.io/actions/runs/37208753220) passed; downloaded SPA/relay/admission matched frozen bytes; documentation links/assets checked | Changed source requires a fresh clean candidate and remote CI; no blanket transfer of the old security/browser evidence. |
| 5. Usability and operations | Six local EN/IT data-reader rollback cases; actual protected backend plus Pages preview rollback/restore in 99.55 seconds; user designated himself as operator/study organizer on October 22 | Five new people, EN/IT and two mobile sessions, at least 4/5 unaided; authorized alarm destination, schedule/delivery and live billing signal; public beta and stable exit evidence. |

The hour report is `.tmp/soak-5e6f-reviewed.json`: 3,600,233.8 ms wall time,
1x simulation, 20 living agents, 1,200 world actions and 1,201 synthetic
HTTP calls, with **zero paid provider calls**. UI p95 was 16.3 ms on an
Apple M4 Max / 64 GiB / Chromium 151 reference machine. There were 359 native
RSS samples and 61 invariant checks. The final five-window memory slope was
913,899.52 bytes/minute and net rise 20,463,616 bytes: within the frozen
1 MiB/minute and 32 MiB thresholds, not zero growth. Controlled needs and
preconditioning are recorded separately from the elapsed hour. Native quota
and disk reports are `.tmp/native-quota-5e6f-1024-{en,it}/report.json` and
`.tmp/physical-space-evidence-5e6f.json`; the disk test used an isolated volume,
not the user's main disk.

Cloud rollback evidence is `.tmp/cloud-rollback-5e6f-reviewed.json` plus
`.tmp/cloud-rollback-5e6f/chromium-en/report.json`. It tested protected production
backends and the technical Pages preview alias, using synthetic upstreams;
**the main SPA was not replaced and the public beta was not opened**. The
compatible retained reader is candidate `07e6a25c48a8e6f6272e01c0175aa047c48a6f67266918ab02797721cc693f08`.
This does not certify the old public production SPA as an IndexedDB-v2 reader.

## Authorization and external inputs

The user authorized direct production deployment, bypassing staging, and
subsequently chose reuse of the existing Workers Paid subscription without a
downgrade, new subscription or additional usage charges. The October 4 billing
observation covers its recorded cycle only; included allocations are not a
hard cap or proof of today's bill. Complete technical retention within 24 hours
remains required. See the [deployment dossier](production-deployment-2026-10-04.md).

The latest provider decision is **“Non autorizzo chiamate pagate”**. The proposed
48-call/USD 5 campaign is unexecuted and must not be treated as an outstanding
approval granted by resuming the goal. All 11 provider certifications remain
unverified. On 2026-10-22 the user designated himself (Matteo Scurati) as
operational owner and study organizer. Dedicated key references, availability
for genuine anti-bot verification, an authorized alarm channel, and concrete
arrangements for the five-person study are still missing. No participant messages or alarm
notifications have been sent. Stable also requires seven real public-beta days,
20 completed sessions from five distinct humans, no open critical/high issue
and verified compatible rollback. Calendar time since these receipts does not
count as beta time.

Basecamp discovery on 2026-10-22 returned `auth_required` because the CLI could
not find credentials in the keyring; no project updates were obtained or sent.

## Local verification continuation — 2026-10-22

The registry-derived matrix now requires explicit success effects, actor
energy/hunger/health/balance deltas and exact decision/result event sequences
for all 33 actions. Depleted-resource cases check both zero-cost rejection
and actions that need no additional funds. Dead actors and invalid references
also check events/invariants; malformed attempts check the configured penalty.
Five seeded unfavorable outcomes check charged failed purchases/attacks/theft
and completed searches/wrong answers without rewards. Eight repeated
settlements check that contracts, refunds and puzzle awards cannot pay twice.
The team fixture now includes the existing member's stake; exhaustion is
materialized before measuring an action's own cost.

All 201 matrix cases pass. The complete local suite passes 442 tests (314
engine, 80 web, 32 relay, 16 admission), plus ESLint and TypeScript. Logs are
`.tmp/action-matrix-resume.log` and `.tmp/resume-{tests,lint,typecheck}-20261022.log`.
The first pass changed tests and release documentation/configuration. A later
whole-suite run exposed a wall-clock-only comparison flake in the repeated
settlement checks: every executor attempt materializes vitals and refreshes
the actor's `updatedAt`. That comparison now excludes only this actor audit
timestamp, while retaining every balance, contract, ledger and other entity
field. The corrected full suite passes; the failed log is preserved locally.

## Direct accessibility review and corrections — 2026-10-22

Direct Chrome keyboard/accessibility-tree review found ambiguous repeated
key controls and color presets named only by hex code, with selection conveyed
only by a border. Key groups and show/hide/enable/disable/clear controls now
identify their provider. Palette controls identify the color and agent,
measure 44 by 44 CSS pixels, expose pressed state and show a checkmark.
English Start instructions now name the actual control; Italian provider
availability labels no longer contain untranslated `no key`/`needs proxy`.

The local revised build passed 18 automated A/AA checks across EN/IT and
1440/768/390 px, EN/IT browser vault save/reload/unlock/lock/migration checks,
and the Italian mobile public UI flow (19 surfaces, no violations or page
errors), all with external provider traffic blocked. The public UI regression
now exercises named show/hide controls and keyboard palette selection/state,
visible selection indication, input update and 44-pixel dimensions. Build,
bundle guard, 442 tests, TypeScript and ESLint pass locally.

Native Chrome review verified provider-specific visibility state, keyboard
color selection, focus restoration, Italian labels/document language and no
390-pixel overflow. Evidence: `.tmp/accessibility-review-20261022/review.json`
and `mobile-it-controls.png` in that directory. A first ambiguous group/input
label was found by the existing vault test and corrected; its failed log is
retained. This scoped agent review is not a VoiceOver/human session, complete
running-world accessibility acceptance or fresh native-200-percent coverage.
The review build is explicitly dirty and separate from the configured clean
production candidate. Fresh exact-candidate CI and duration evidence remain
required. No provider charge, infrastructure rollout or notification was
performed during these corrections.

## Security refresh after remote CI — 2026-10-22

Checkpoint `844c890fc297c3db5e8cb5bc69a105dc7074907f` was committed and pushed.
[CI run 39809317580](https://github.com/agentauri/simagents.io/actions/runs/39809317580)
failed the application and documentation audits against newly reviewed
advisories; dependent build/browser jobs were skipped and the summary failed.
This run is failed evidence, not candidate certification.

The replacement pins Vite 6.4.4 and source-map-js 1.2.2 for the application.
Documentation overrides now select compression 1.8.2, follow-redirects 1.16.1,
launch-editor 2.14.2, source-map-js 1.2.2, proxy-addr 2.0.8, shell-quote 1.11.0
and Tinypool 2.1.2. The private bounded braces fork remains in use. Bun types
are pinned to the previously locked 1.4.2 in all three consumers, preventing
unrelated `latest` updates during lockfile resolution.

The separate local Cloudflare runtime fixture also required sharp 0.35.5
for the reviewed librsvg issue; its own lockfile and audit were updated.

Patch references: [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[Vite/launch-editor advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm),
[compression advisory](https://github.com/advisories/GHSA-vc2v-76pw-4v95),
[follow-redirects advisory](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8),
[proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv),
[Tinypool 2.1.2 release](https://github.com/tinylibs/tinypool/releases/tag/v2.1.2),
and [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

Local locked audits now report zero high/critical findings (341 application
package names; 40 moderate documentation findings remain). Application and
documentation builds and 442 tests pass. The Tinypool major override also
passed actual two-worker task execution and inherited constructor/run-option
isolation checks; this does not assert that the normal documentation build
uses its optional threaded renderer. Security logs and the worker check are
retained in `.tmp/accessibility-review-20261022/`. The next clean commit still
requires its own successful remote CI, candidate artifacts and release gates.

## Puzzle import conservation correction — 2026-10-22

Further snapshot review found that recorded puzzle awards were validated
individually but could sum above their prize pool, including finite terms
whose sum overflowed. The pre-fix regression failed for both cases.
Validation now rejects excess/nonfinite totals before hydration, permits only
bounded floating-point roundoff, and permits no positive award from a zero
pool. Tests also accept and restore exact and decimal split-award boundaries.

The public UI regression now imports both an invalid envelope and a structurally
valid snapshot with excessive puzzle awards. It checks the live world, the
committed `world:current` record and IndexedDB byte accounting remain unchanged,
with no inference. Chromium EN and WebKit IT each passed the complete 390px
flow (19 surfaces) locally. All 446 workspace tests (318 engine, 80 web, 32
relay, 16 admission), TypeScript, lint and the public build pass. Evidence is
`.tmp/snapshot-prize-review-20261022/`, with red/green unit logs at
`.tmp/snapshot-prize-{before,tests}-20261022.log`.

The downloaded `b01acbe` candidate `3aa447e3025fd9528e610da8f008d02f06129579a548123af668ab536d2b7c4f`
is retained in `.tmp/ci-candidate-b01acbe` as preceding evidence. It cannot
certify the corrected validator. A fresh clean candidate, remote CI and
60-minute run are required; no duration run was started on the superseded
artifact. No schema layout/version, provider call or infrastructure setting
was changed by this correction.

## Suspend-aware duration and benchmark correction — 2026-10-22

The clean `de9b561` / `9efb2089d5a5a7f91a45bf252bd58067c5766172a1f11be431475e6110df7c14`
[CI run 39812827333](https://github.com/agentauri/simagents.io/actions/runs/39812827333)
passed all eight required jobs. Review of the downloaded reports confirmed
36 complete browser/language/size/100%-200% cases, 64 candidate-bound reports
and 816 automated A/AA scans with zero violations. Twelve external documentation
links were available; the four edit links redirected to authentication and had
verified local source targets. Fresh native Firefox quota refusal in EN/IT,
isolated filesystem ENOSPC and six local data-reader rollback cases passed.
These remain scoped evidence, not human usability or live-provider certification.

The subsequent hour run **did not pass continuous real-time acceptance**.
It measured 3,600,237 ms of browser active time across 10,739,200 ms of calendar
time; power history confirmed system sleep, and snapshot gaps reached
2,757,914 ms. Its 1,200 synthetic actions, restored counters, p95 22.6 ms and
native RSS statistics are partial observations only. The original report is
preserved, with the rejecting review at `.tmp/soak-de9-continuity-review.json`.
No hour gate is promoted from that run.

This exposed a product duration bug: RequestBudget used only performance.now(),
which can stop during system suspend. Production now combines calendar and
monotonic elapsed time, never refunds observed duration on clock rollback,
checks expiry before admission and polls idle expiry at most once per second.
Four regressions cover suspension, queued requests, calendar rollback and
idle expiry. The previous implementation fails three of these tests.

Benchmark protocol 2 uses a native continuous clock that includes suspend,
checks it against uptime and browser active time, and rejects suspension,
missing samples or bad clock calibration. A full run also requires the exact
clean source commit; dirty pilot builds cannot become hour evidence. Six clock
checks, including an actual native adapter read, pass. They run in ordinary CI.
A new 60-second pilot passed on macOS with continuous/native timing; it does
not satisfy the 60-minute gate. All 450 workspace tests, TypeScript, ESLint and
the public build passed locally. Evidence is in `.tmp/continuous-clock-pilot-20261022/`
and `.tmp/soak/2026-10-22T20-21-58-369Z-pilot/`.

Clock references: [browser sleep behavior](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#ticking_during_sleep)
and [Apple continuous clock](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time).
A fresh candidate/CI and a genuinely uninterrupted one-hour window are still
required. Paid provider calls remain denied; no production rollout occurred.

## Narrow native-zoom configuration correction — 2026-10-22

The `ffbeb37` / `7dac04709a07259845536de456859e03c219c72fb5295ef11260e2e71b4a4310`
[CI run 39849299381](https://github.com/agentauri/simagents.io/actions/runs/39849299381)
passed all eight jobs, including native clock tests on Linux. Its six local
reader trials and native EN/IT quota/isolated ENOSPC cases also passed, but
these do not close the still-unexecuted continuous real-hour gate.

Visual inspection of its 390px/200% screenshots found the brand overlapping
Tools and the configuration close control partly outside the 195-CSS-pixel
viewport. A targeted native probe reproduced the close rectangle ending at
202.63 CSS pixels. The configuration title now wraps with a nonshrinking
44px close control; the decorative brand truncates within its own space.
Persistence footer states (saving, paused, not saved, saved simulation minute)
and the empty section indicator now use the EN/IT catalog.

The revised local build passes the complete narrow 200% public flow in all
three engines. Chrome/WebKit pointer checks also pass; the close rectangle
ends at 179 CSS pixels, leaving the whole 44x44 target visible. The regression
checks the real DOM geometry and activates the control (native keyboard for
the documented Firefox zoom automation limitation). Evidence is in
`.tmp/config-close-review-20261022/` and `.tmp/config-close-pointer-review-20261022/`;
`.tmp/config-close-before-20261022.json` retains the original failing geometry.
450 workspace tests, lint and the public TypeScript/build check passed. The
fix is also backported to the isolated rollback source.

These are scoped visual/keyboard/automated checks, not complete manual
accessibility or five-person usability acceptance. The replacement clean
candidate still needs exact remote CI, an uninterrupted awake-Mac hour,
genuine anti-bot/provider verification and the other original release gates.
No provider charge, production rollout or notification occurred.

## Bounded CI browser setup — 2026-10-22

The `af9c4e0` candidate `34af5a8f14cafb1070ba3b29a28a8040468648598c862c388c04c8ee10b98f2a`
passed six local reader trials, native quota denial in EN/IT and isolated
filesystem ENOSPC with preserved world/accounting. Chromium, Firefox,
documentation, build, types and unit jobs passed remotely, but the whole
[run 39854418278](https://github.com/agentauri/simagents.io/actions/runs/39854418278)
was not green: WebKit setup remained active on an Azure Ubuntu mirror index
fetch for more than 25 minutes. The active log was inspected in GitHub after
the logs-download endpoint returned BlobNotFound; neither condition was
reported as a terminal job failure. Diagnostic: `.tmp/webkit-af9-live-log.txt`.

Browser runners now configure 30-second APT connection/data timeouts, two
package retries and the official Ubuntu archive in the runner's mirror list.
Setup is bounded separately: two minutes for runner configuration and ten
minutes for browser installation. Repository signatures and all three browser
suites remain required; no provider inference is retried. Workflow YAML and
both shell blocks passed parsing checks. The source change starts a replacement
exact-commit CI; the superseded run is not certified by its successful subset.
These settings affect temporary CI runners, not the user's Mac or production.

APT semantics: [Ubuntu apt.conf](https://manpages.ubuntu.com/manpages/noble/man5/apt.conf.5.html).
The continuous-hour, genuine provider/admission, human usability, operational
and beta requirements remain open. Paid provider calls remain denied.

## Deterministic imported-world pause check — 2026-10-22

The replacement run on `7288fd7` passed WebKit installation, then failed its
768px English data-reader check while waiting for Pause. The saved screenshot
and trace show the one-request synthetic session already stopped at its
request limit: its response completed before the test observed the transient
running control. Candidate `dc5826e14d6eb4aebd82cd194222108ee68fabc286ddf06b40cb74474229dd0a`
is retained; this failed run does not satisfy the CI gate.

The test now holds the first resumed synthetic request pending, observes that
request with a bounded wait, pauses through the real UI and then releases the
cancelled route. It still requires exactly three attempts total (probe,
initial decision, cancelled resumed request), unchanged public-reader counts
and no unhandled errors. WebKit 768px EN, Chromium 390px EN and Firefox 768px
IT passed locally against the retained artifact with all other upstreams
blocked. Evidence is `.tmp/public-data-pending-20261022/`; the failed remote
trace is under `.tmp/ci-evidence-7288fd7/webkit/`. No product behavior or budget
limit was changed. Fresh exact-commit CI remains required.

## Pinned browser image after package-download timeout — 2026-10-22

Run `39859456047` on `42989f3` passed docs, types/lint, unit tests and the build,
but all three browser jobs timed out during APT setup before running their
suites. Logs show continuing, slow package downloads from the official Ubuntu
archive (119 MB and 181 new packages); this is not another product test result.
The required-job summary correctly failed. Complete job logs are retained as
`.tmp/ci-429-{chromium,firefox,webkit}.log`.

Browser jobs now use the official Playwright 1.62.1 Noble image, pinned by its
verified OCI digest, on an Ubuntu 24.04 host. The matching npm package remains
pinned at 1.62.1. Each job must launch its bundled browser successfully before
testing; no APT or browser downloads are needed inside the job. Bash remains
explicit for existing scripts, and Chromium uses shared host IPC as recommended
by Playwright. All three engines and their original acceptance checks remain
required. The image manifest and its amd64/arm64 variants were verified against
Microsoft's registry; this is preparation, not a passing remote execution.

References: [official image contents and configuration](https://playwright.dev/docs/docker)
and [CI image support](https://playwright.dev/docs/ci).
Candidate `47b1eb78269277eaef647efb888ea7c8b2f4ebd6cc9ae5b2602e3d3e8ffbc8f8`
and its six local rollback-reader cases, EN/IT native quota refusal and isolated
ENOSPC reports remain retained, without promotion to a successful CI candidate.
The continuous-hour and external release requirements remain open.

The first image-based run (`39861275215`, `159c8a6`) pulled and initialized the
container successfully, then stopped in `setup-bun`: the minimal image lacks
`unzip`. Its complete WebKit job log is `.tmp/ci-159-webkit.log`. Browser jobs
now install the official `@oven/bun-linux-x64` npm binary at the existing
`BUN_VERSION`, with lifecycle scripts disabled, and verify its actual version
before adding its directory to the job PATH. The registry package layout was
checked (`bin/bun`); this avoids introducing OS package installation. Other
jobs retain their existing Bun action. See [Bun installation](https://bun.sh/docs/installation).
Remote verification remains required; neither failed run is a CI pass.

## Historical implementation checkpoints


The sections below preserve the implementation history. Their pending-work,
no-deployment and test-count statements describe those earlier checkpoints;
the candidate-specific table above supersedes them for the retained October 4
artifact. Source changes and newly observed external state must be reviewed
before any further promotion.

## Implemented and covered by regression tests

- Engine lifecycle: initialized/running/paused/stopped/error. Seeding and hydration do not create runners or call providers. Pausing aborts in-flight decisions; resuming explicitly starts fresh runners. Old decisions and queued ticks cannot act after reset.
- Single mutation queue for actions, runner vitals and heartbeat; serialized wall ticks. Worker commands carry request/session identity, correlated responses and timeouts. Timeout outcomes are not retried.
- Action schemas check finite numbers, positive quantities, integer coordinates, bounds, enums and required fields before handlers run. Undefined agent updates preserve existing values. Failed attempts apply their declared costs and events.
- Sleep restores energy over the requested simulation duration and wakes the agent; vitals deaths emit once, including deaths discovered outside heartbeat.
- Employment: completed work remains payable; upfront accounting, per-tick payment, escrow claims, returns, quitting, firing and offer expiry have conservation/idempotency regressions.
- Puzzles: shared fragments are observable; focus restrictions apply; refunds reduce the pool; leaving does not clear other owners' fragments; expiry releases focus; recorded awards drive result amounts; leader weighting cannot inflate the winner pool.
- Reproduction: roster entries and agents retain stable connection identity; births inherit the parent's provider; color mutation intensity is honored; population slots include pending births; dead parents terminate gestation. Separate per-offspring system prompts are explicitly rejected instead of silently ignored.
- Memory: bounded memories per agent, active discovery, bounded knowledge/relationships, dead-owner cleanup, and negative trust decaying toward neutral.
- Custom prompts reach emergent decisions. Snapshot configuration retains runtime overrides/custom prompts. Worker validation precedes hydration and browser import saving; nested row identity, metadata and nonfinite-value regressions protect existing state.
- Experiments yield for cancellation, fail incomplete targets, restore world/configuration and keep experiment events/replay frames out of the live session feed.
- Provider failures stop the session and surface an error; missing roster connections never turn into a baseline. Truncated JSON is rejected rather than repaired. Browser visibility loss pauses without automatic resume.

## BYOK security and budget implementation (2026-09-17)

- New credentials stay in memory. Optional Web Crypto storage uses AES-256-GCM, random salt/IV and PBKDF2-SHA256 (600,000 iterations). The passphrase is never persisted. Unlock is explicit after reload; wrong passphrases and corrupted ciphertext do not overwrite session keys.
- Legacy plaintext keys are detected without being loaded. Explicit migration supports session-only or encrypted storage. Validation/encryption/write failures preserve legacy data. Locked archives and concurrent changes cannot be silently overwritten.
- Credential edits and locking pause/save the current world and terminate the Worker that holds credential copies. Clearing a session key does not silently edit the encrypted archive; the UI explains explicit encrypted saves/removal.
- Public startup requires a model and credentials for every roster entry, and an HTTPS relay URL where currently necessary. This preflight checks configuration, **not live credential or model validity**. Baselines and browser adapters require `VITE_INTERNAL_TESTS=true` in a development build and are rejected by the production Worker.
- Before start, users review/change mandatory request, wall-duration and output-token limits. Defaults are 100 requests, 900 seconds and 1024 output tokens. Default provider connections admit at most two simultaneous requests, spaced at 30/minute; all connections additionally share six slots and a 50/minute pacing limit. Attempts consume the local budget even when they fail; no automatic retry occurs. Duration includes pauses. These are local session controls, not a provider invoice guarantee.
- The request counter is visible. Budget exhaustion pauses the world and requires explicitly starting a new session. Provider responses are bounded in size; authentication, quota, rate-limit, unavailable-model, format and network errors have concrete messages without raw provider payloads.
- Request construction no longer silently swaps models or raises the selected token cap. Reasoning settings for unknown models are rejected until their capabilities can be configured. OpenAI's completion cap includes reasoning tokens as documented in the [official API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
- Production WebKit regression fixed: the dynamically imported LLM chunk imported the Worker entry back, reinstalling its command handler with an empty session. The provider now stays in the Worker entry bundle; production-browser tests cover commands after provider/budget errors.
- Bun is pinned to 1.2.14 in package metadata, `.bun-version` and CI. `bun.lock` is no longer ignored, has been reconciled with current manifests, and passes frozen installation. CI is configured for production credential/BYOK smoke in Chromium and WebKit; remote CI has not been run.

## Connection profiles and protocol adapters (2026-09-17)

- `ProviderDefinition`, `ConnectionProfile` and `ModelCapabilities` are now separate contracts. Profiles hold stable IDs, protocol/endpoint/transport and a credential reference; model parameters stay with the roster entry. Credentials remain in the existing memory/encrypted vault. New agents and offspring keep both roster identity and connection identity, with a compatibility path for older snapshots.
- Protocol adapters cover OpenAI Responses, compatible Chat Completions, Anthropic Messages and Gemini generateContent. New OpenAI profiles propose Responses; provider-only legacy settings retain Chat Completions. Both OpenAI formats request `store: false`; this is not a claim about provider retention policy.
- Optional structured JSON uses a closed envelope (`action`, `paramsJson`, `reasoning`); the application decodes and validates action parameters locally. Text JSON remains available. Gemini thought blocks are excluded from action parsing. Gemini 3 levels and Gemini 2.5 budgets have distinct wire fields.
- OpenRouter was added without model fallback lists or automatic routing aliases; requests disable provider fallback and require declared parameters. Z.ai now defaults to the general endpoint; Coding Plan is an explicit profile variant. Qwen supports an explicit Beijing variant and editable regional/workspace endpoints.
- Configuration supports independent credentials for multiple profiles, custom model IDs, model capability controls and explicit first-page model listing. No inference occurs while configuring. A model list is not a verification result.
- For explicit profiles, the UI requires a successful one-request model probe before starting. Verification is tab-local and keyed to the profile, model, parameters, token limit and credential revision. Errors are shown as unavailable; unchanged successful configurations show verified in this tab. Editing or locking credentials cancels pending main-thread probes/listings as well as terminating the simulation Worker. All testing so far used synthetic responses, not live keys.
- Profile-based simulations use per-profile concurrency/rate limits. Snapshots include profile/roster metadata without credentials. Imported profile metadata is validated but is not automatically activated or allowed to overwrite configured destinations; the user must configure matching profiles and verify them.
- The earlier legacy provider-only compatibility path has now been closed for public startup; see the migration section below.

Protocol sources checked during implementation: [OpenAI Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection), [Z.ai general API](https://docs.z.ai/guides/llm/glm-5.1), [Alibaba regions/endpoints](https://www.alibabacloud.com/help/en/model-studio/regions). These establish protocol shapes and documented presets, not live model certification.

## Official relay and legacy closure (2026-09-17)

- A separate `apps/relay` Cloudflare Worker is implemented with three operations: readiness, model listing and text inference. It uses an exact destination/protocol/path allowlist, rejects redirects and unsupported/hostile payloads, bounds input/output size, enforces deadlines and limits isolate concurrency. No content/key logging, cache or persistence was added.
- CORS is not authentication: forwarding requires a short-lived HMAC-signed access token bound to the SPA origin and an opaque subject. Rate bindings apply to blinded technical identifiers. At this historical checkpoint beta token issuance used an explicit operator CLI step; the autonomous admission flow supersedes it below. Production tokens have not been issued. Public self-service admission/renewal remains future work.
- The SPA has an official-relay transport with separate provider/relay credential references. It is disabled unless the build supplies an operator-configured relay origin. Imported or modified relay URLs cannot silently change that trusted origin. Keys and relay tokens are excluded from profile exports and can use the existing encrypted vault.
- Legacy provider-only settings are converted to profiles when their existing destinations are valid. Stable roster IDs, exact model/parameters, credential references, legacy OpenAI Chat Completions and saved user-relay URLs are retained. Provider-only records use current catalog endpoints because historical roster records did not save endpoint URLs; older Z.ai users must review the general/Coding Plan choice before verification. The old roster is backed up before migration; invalid/unwritable metadata stays preserved and blocked. Missing/invalid relay settings require correction, not a silent switch to direct access.
- Public startup no longer accepts the legacy bypass: all LLM agents require a configured profile and an explicit model probe. Internal fixture builds retain their test-only path. Old agent snapshots acquire the separate roster/profile identities when resumed.
- The relay handler, SPA transport and migration are tested locally. The service has **not** been deployed, tested in Cloudflare's runtime or used against live providers. See [relay operations and limits](../apps/relay/README.md) for deployment prerequisites, local-vs-global limit semantics and rollback.

## Verification completed

```sh
bun run typecheck
bun run test
bun run --filter web build
PLAYWRIGHT_MODULE_DIR=/path/to/playwright SIMAGENTS_SMOKE_URL=http://127.0.0.1:5184/ node scripts/browser-smoke.mjs
PLAYWRIGHT_MODULE_DIR=/path/to/playwright SIMAGENTS_SMOKE_URL=http://127.0.0.1:5184/ SIMAGENTS_SMOKE_BROWSER=webkit node scripts/browser-smoke.mjs
```

- 64 engine tests, 24 web/Worker tests and 19 relay tests (107 total) pass.
- Production bundle builds. Existing large-chunk and outdated Browserslist-data warnings remain.
- Chromium and WebKit desktop smoke passed against the local development server: start/pause, analytics, replay, puzzle statistics, custom prompts, experiments, reload, export/import and resume. Anthropic and OpenAI requests were intercepted with synthetic credentials/responses. Unmatched external traffic is blocked by the harness.
- Root `test` and the CI test job include engine, web/Worker and relay suites.
- `official-relay-smoke.ts` passes in Chromium and WebKit using a production fixture, the real relay handler and simulated providers/rate bindings. CI includes it; no real deployment or paid inference is involved.
- `connection-profile-smoke.mjs` passes against the production bundle in Chromium and WebKit: four protocols plus OpenRouter, zero inference during setup/listing, exactly one explicit probe, invalidation after capability changes, a one-request simulation budget and credential-free profile metadata in exports. CI includes this script; remote CI has not been run.
- `credential-smoke.mjs` and `byok-production-smoke.mjs` pass against the production preview in Chromium and WebKit, with synthetic credentials/responses and unmatched external traffic blocked. The latter verifies the one-request cap, exact token cap, invalid-limit startup blocking, production baseline rejection and credential locking after budget exhaustion.

Fixtures establish local behavior, not live provider/model compatibility. Browser smoke uses explicit internal baseline fixtures as well as mocked LLMs; it does not certify the still-planned complete onboarding experience or live provider compatibility.

## Current release gates (authoritative; older checkpoints below are historical)

The public beta is **blocked**. `docs/release-gates.json` records missing evidence and the release workflow rejects publication until every required gate refers to the exact candidate commit. No deployment, provider expenditure or user recruitment is authorized by this checkpoint.

- Correctness: the runtime-registry matrix now covers all 33 actions with success, strict invalid input, dead actors, queued cancellation, resource exhaustion and applicable missing references. Domain/referential snapshot validation is implemented. Broader concurrency/stress and exhaustive timing/economy combinations remain open. RNG persistence, cumulative metrics, onboarding and scenarios are already implemented; they are not outstanding implementation tasks.
- Storage: individual replay/trace/experiment records and transactional byte accounting are implemented. Replay and inspector now use lightweight descriptors, indexed queries and single-item reads; the replay SDK uses durable history without creating a Worker. The Worker retains only 32 resident replay frames. The 60-minute/20-agent real-time browser soak, denied-quota tests, memory plateau, UI p95 and broader retention/read performance gates remain open.
- UI: responsive session controls/tools, persistent language selection and a typed partial EN/IT catalog are implemented. Complete catalogs/error codes, all simulation surfaces, keyboard/canvas alternatives and 200% zoom remain open. Selected ready/setup/configuration surfaces pass automated A/AA checks; this is not whole-product certification. A passing setup dialog at 390 px does not certify the main toolbar or whole page.
- Relay: public Turnstile admission, coordinated subject quotas, autonomous renewal, Worker credential refresh and Cloudflare runtime evidence remain open. Current signed-token relay tests do not satisfy public admission.
- Providers: all 11 real provider certifications, the preauthorized call manifest and sourced price catalog remain open. Browser probes using fixtures certify no real model.
- CI: lint, strict documentation build, dependency audits, artifact reuse and candidate hashes are implemented. The complete browser matrix and remote CI on an exact committed candidate remain open.
- Operations: five new participants, staging, monitoring, named operator, rollback within 15 minutes, public beta and stable-promotion evidence remain open.

**Rollback blocker:** the previous application opens IndexedDB version 1; this checkpoint upgrades it to version 2. That previous binary cannot open the new database. Do not publish this migration until a tested rollback candidate can read version 2 and its indexed collections. The release evidence gate explicitly includes this requirement.

## P2: atomic world persistence (2026-09-17)

- World snapshots and their bounded event ring now commit together in IndexedDB (`simagents-app-data`, `world:current`). Failed writes preserve the previous record; starting a new world no longer deletes the previous save before initialization succeeds. Explicit reset still clears the current save.
- Legacy localStorage world/event data is validated by the Worker without inference, inserted only if no destination exists, and removed only after commit. Malformed legacy data is preserved and reported in the start dialog. Imports await durable storage before reporting success.
- The data store enforces a 50 MiB serialized payload budget transactionally across tabs, with a 5 MiB primary-data reserve when secondary writers adopt it. This is an application budget, not a browser quota guarantee. No quota-triggered eviction occurs. Failed autosaves expose an export of the latest in-memory world; pending or failed saves request a browser unload warning. Pause waits for snapshot persistence to settle; storage failures remain visible separately from simulation state.
- Verified: five IndexedDB transaction/budget tests and a pause/write-order regression; web suite 30 passing tests. Chromium and WebKit production smoke cover migration equality, reload without inference and corrupt-data preservation. Chromium full-feature smoke covers pause/reload/resume/export/import plus existing browser features. Frozen Bun installation and production bundle check pass.
- At this first checkpoint, still pending in P2 (see the next checkpoint for updates): replay, prompt traces and experiment migration; durable replay after reload and gap indicators; global storage accounting for these remaining localStorage records; actual request trace capture; RNG stream state/cumulative metrics; onboarding, responsive layout, accessibility and complete EN/IT coverage. Existing replay/trace/experiment retention limits still apply until those stores migrate. This slice does not complete P2 or authorize release.

## P2: secondary data and durable replay (2026-09-17)

- Replay frames, reconstructed prompt summaries, experiment definitions and runs now use IndexedDB. Legacy migrations validate before writing, preserve malformed/conflicting source data, and delete matching legacy sources only after commit. Array updates run inside a single transaction, so concurrent writers do not lose appends. The prior count/size-based silent evictions have been removed.
- Secondary writes share the 50 MiB application budget and stop at 45 MiB total usage to reserve capacity for the world. Storage failure or an excessive pending queue pauses automatic collection with a visible notice and explicit retry/removal controls. Removing secondary data preserves the world. Pause waits for pending world and secondary writes; unload warns about pending writes. Browser quota and teardown guarantees remain browser-dependent.
- Replay can open from Ready after reload, without starting a simulation or making provider calls. It displays tick zero, counts missing ticks within the saved range and steps through actual stored frames. Exact lookups reject missing frames rather than substituting another tick. New frames include world identity; legacy frames without it are explicitly marked unverified. Frame event lists remain bounded and are not a complete event archive.
- The prompt inspector labels reconstructed summaries; new summaries no longer invent a default system prompt. Only canonical decision events are recorded and duplicate event IDs are suppressed. Ordinary action failures do not imply model fallback. Saved agents can be selected after reload. At this checkpoint actual opt-in request/response capture was still pending; see the next checkpoint.
- Experiment export reads a saved run before contacting a Worker. Import/reset await secondary cleanup. The start modal now constrains its height and scrolls its content while keeping buttons visible, fixing the saved-world WebKit overflow found in this verification.
- Verified: 38 web tests, production build, complete mocked-provider browser smoke in Chromium/WebKit and production BYOK smoke including reload replay in both browsers. No live provider call, deployment or remote CI run. The 60-minute/20-agent storage and responsiveness soak remains outstanding; collection arrays currently rewrite per append and require that performance gate before promotion.
- Remaining P2 after the secondary-data checkpoint: actual request capture (implemented below), cumulative metrics/Gini, RNG stream state, onboarding/scenarios, EN/IT, full responsive and accessibility verification. The existing mobile toolbar release blocker is not resolved by the modal fix.

## P2: opt-in actual request capture (2026-09-17)

- The start dialog offers per-session capture, off by default. Consent is consumed by initialization, not included in snapshots and not restored after reload. Normal simulation requests may be captured; verification probes and experiment runs are excluded.
- Traces contain stable request/session IDs, world and agent identity, decision tick, protocol, requested model, HTTP status, duration and success/failure/abort outcome. The request body is the JSON serialized for fetch; response text is captured before JSON parsing, including invalid JSON. URLs and authentication headers never enter the trace schema. Known session keys and relay tokens are redacted before truncation and Worker delivery.
- Up to 100 completed attempts per session, with 16,384 characters per request and response body. Redaction/truncation are visible. Response transport limits still apply: oversized bodies may be unavailable rather than captured. Traces use the shared secondary-data budget; collector errors cannot change decisions or cause retries.
- The inspector separates captured request/response bodies from reconstructed summaries. Multiple records for one agent/tick have stable selection identity. Stored traces are available after reload and are separate from world snapshot exports; copying their body in the inspector intentionally shares the captured content.
- Verified: 69 engine tests and 39 web tests; production build and bundle check; Chromium/WebKit production smoke comparing the persisted body to the intercepted request, excluding the probe, checking absent credentials/default-off consent, and opening the saved trace in the inspector after reload. All inference was mocked; no provider certification, payment, deployment or remote CI run.
- Still open at the trace checkpoint: cumulative metrics/Gini (implemented below), RNG stream state, onboarding/scenarios, EN/IT, responsive/accessibility matrix and long-session performance, plus the operational and live-provider release gates tracked above.

## P2: cumulative metrics and zero-balance Gini (2026-09-17)

- The engine accumulates event totals, action attempts/failures, per-agent action/latency/token/fallback counters and death causes at event insertion, before the bounded event log discards rows. Canonical decision events and `action_failed` count once; result/lifecycle events do not add another action. Failed world attempts retain their decision telemetry without becoming model fallbacks.
- Optional versioned metrics are included in world snapshots, deep-validated before hydration and restored without replaying them into their own totals. Legacy worlds reconstruct only their retained events and keep an explicit incomplete-history flag permanently. No missing totals are invented.
- Agent profiles and behavior analytics now read engine counters rather than recounting the UI feed. Model-group averages are weighted by their actual sample/action counts. Attempts per simulated minute use elapsed simulation time since the first recorded action (minimum one-minute window), including subsequent inactivity. These are action-attempt counters, not provider billing/request totals.
- Gini uses all living agents' nonnegative balances, including zeros; empty and all-zero populations return zero. Temporal charts use a separate bounded 120-tick aggregate window, display its latest 30 recorded ticks and label maximum decision latency correctly. Lifetime event totals and experiment event deltas no longer depend on retained log length. Other/unspecified death causes remain visible.
- Verified: 74 engine tests and 42 web tests, including >10,000 events, repeated hydration, legacy coverage, malformed metric imports, same-action result deduplication, zero-balance inequality and declining rate during inactivity. Production build/bundle checks pass; full Chromium/WebKit mocked browser paths verify persisted counters through reload/import/export. No live provider request, deployment or remote CI.
- Remaining at the metrics checkpoint: RNG stream persistence (implemented below), onboarding/scenarios, English/Italian, responsive/accessibility work, long-session performance and the P3 operational/live-provider release gates. Per-agent counters cover recorded world actions; aborted requests with no action are tracked separately by request budgets/traces.

## P2: random stream persistence (2026-09-18)

- World snapshots now include versioned seedrandom ARC4 state for the global mechanics stream and independent per-agent decision streams. New worlds initialize the mechanics stream from the effective world seed. Recreating runners after pause/failure reuses each stream rather than rewinding it; stopped runners cannot consume it further. Dead-agent streams are pruned and world reset clears the registry.
- Import validates generator indices, the complete 256-byte permutation and unique stream identities before replacing any current state. Hydration restores streams without drawing numbers. Older snapshots start a seeded sequence with an explicit incomplete-history flag, preserved on subsequent saves and explained in the resume dialog.
- The guarantee is continuation of recorded pseudorandom streams, not deterministic playback of an entire world: pending decisions, remote model responses, network scheduling, UUID generation and timestamps are not replayed. No inference runs during hydrate or validation. Existing internal isolated RNG helpers remain independent of the persisted browser-agent registry.
- Verified: 81 engine tests, 42 web tests, typecheck/build and browser bundle check; mocked Chromium/WebKit full-feature persistence flows and production BYOK smoke. Tests compare subsequent world/agent draws exactly after JSON serialization/hydration, reject malformed state without mutation and verify stopped-runner protection. No live provider calls or deployment.
- Remaining at the RNG checkpoint: onboarding/scenarios (implemented below), English/Italian, responsive layout/accessibility, long-session performance and the remaining P3 verification/operational/live-provider gates.

## P2: guided BYOK setup and editable scenarios (2026-09-24)

- Ready mode now offers a visible setup entry point: connect a provider, configure/verify agents and models, choose starting conditions, then review limits. Only the connection being edited shows its credential fields. Existing advanced configuration and direct Start/Resume remain accessible; saved settings are reused and closing setup does not start a session.
- Connection saving/navigation makes no inference requests. The journey explains BYOK, in-memory credentials, optional encrypted storage, the direct/relay recipient, provider charges and shared local budgets. It uses the existing verification receipts and BYOK preflight; token-limit changes require explicit re-verification before review/start.
- Three documented presets (survival, trade/work and puzzle collaboration) change starting needs, balance, needs decay and cooperation settings only. The changed values and suggested observations are visible, starting values remain editable, and no action or social outcome is scripted. Existing custom prompts and unrelated settings remain intact. Presets apply to new worlds; resumed worlds restore their saved configuration.
- The dialog uses one scrollable content area and persistent controls, with a four-step progress list, keyboard focus containment, Escape handling and focus restoration. The confirmation dialog also gained dialog semantics and focus containment. Desktop/390px screenshots were inspected; the setup panel itself has no horizontal overflow. This does not resolve or certify all existing simulation-toolbar/mobile surfaces.
- Verified: 45 web tests, including all three presets seeding their advertised values without inference; typecheck/build/bundle checks; production setup smoke on desktop Chromium and 390px Chromium/WebKit; existing production BYOK smoke in Chromium/WebKit. The new smoke covers no-key/unverified gates, explicit requests, editable presets, token-limit re-verification, keyboard focus and bounded simulation startup. CI includes the new setup script; remote CI was not run.
- Remaining product work: complete EN/IT coverage, simulation layout/mobile/accessibility across Firefox/tablet/200% zoom, long-session performance and the P3 usability/operational/live-provider release gates. No live provider call, payment or deployment was made.

## Local implementation checkpoint (2026-09-26)

- Preserved the existing uncommitted P0–P2 work. No commit, push or deployment was performed.
- ESLint now runs with zero-warning enforcement over application/shared/engine/relay TypeScript. TypeScript handles undefined names; unused-variable and explicit-any style rules are deferred. Fixed switch scoping, empty parameter types and unnecessary mutable bindings; the control-character security regex has one documented intentional exception.
- IndexedDB schema 2 stores secondary items independently, with collection/world-tick/agent-tick indices and bounded page reads. Each append updates only its own record and a transactional byte counter. The one-time upgrade recalculates legacy byte counts. Collection migration verifies copied payloads before replacing the source with a marker in the same transaction; destination conflicts abort and preserve the source. The 50 MiB budget and 45 MiB secondary threshold remain.
- Regression coverage includes legacy database upgrade, UTF-8 byte accounting, conflicting migration destinations, rollback of failed writes, cross-connection budget contention and paginated record replacement/removal. Existing replay, trace, credential and experiment tests remain active.
- CI downloads the build job's public SPA artifact and verifies its manifest before testing; fixture relay builds remain explicitly separate. Added Firefox to public smoke scripts, documentation build/audit, artifact retention, and failure on skipped/cancelled required jobs.
- `scripts/release-candidate.mjs` records commit/dirty state and hashes for bundle assets, relay, provider definitions, snapshot/storage schemas and lockfile. Local manifests explicitly report dirty state and are not immutable release commits. `--verify` detects changed assets. Release evidence validation is an additional publication block, not a substitute for reviewing linked evidence or deployment approval.
- Documentation now builds with broken Markdown/internal links treated as errors. Fixed the invalid site URL, missing social-card reference, obsolete API footer and links outside the documentation source tree. The public security summary now describes memory-only keys and optional encryption accurately. External GitHub link availability is not certified by the static build.

### Verification recorded for this checkpoint

- 151 tests passed: 81 engine, 19 relay, 51 web. Lint, TypeScript, production build and browser-only bundle checks passed. The final trace-index metadata change also passed the nine secondary-data regressions and TypeScript/build checks.
- Production BYOK, credential-vault, five protocol-profile fixtures and 390 px setup tests passed in Chromium, Firefox and WebKit during this checkpoint, with external provider traffic blocked. These are selected flows, not the complete EN/IT/device/zoom release matrix.
- npm advisory checks reported no high/critical findings for the locked app or documentation dependencies after remediation. The documentation audit still reports 17 moderate findings; this is not a zero-vulnerability claim. The static documentation build passed with strict internal/Markdown links.
- A tampered SPA asset was rejected by candidate verification; missing release evidence was rejected by the publication gate. Workflow YAML parsed locally. Remote GitHub Actions were not run.
- Local artifacts/logs are under `.tmp/` and `apps/web/dist/candidate.json`; they are ignored build outputs, not a committed release. No 60-minute soak, real provider call, Cloudflare deployment or participant study was executed.

## Goal resumed: correctness, bounded reads and session controls (2026-10-04)

- The goal is active and all five release blocks remain required. No paid provider calls, deployment, commit/push or recruitment were performed. Basecamp skill discovery/read was attempted; the installed CLI reported missing keyring credentials, so no Basecamp project state was changed.
- Added explicit schemas for persisted entities and runtime overrides, cross-reference checks, collection identity/key uniqueness, coordinates, escrow/work bounds, game/team consistency, metadata ownership, monotonic IDs and RNG ownership. Invalid imports are checked before hydration resets state. Restoring entity date columns no longer converts arbitrary model/user payload keys named `createdAt` or `updatedAt`.
- Added a runtime-derived matrix for 33 actions (188 cases) and 25 domain/RNG preservation cases. Real handlers are exercised with deterministic randomness; free actions explicitly document their resource prerequisites. Fixed puzzle re-entry creating duplicate participants and preventing subsequent refunds; banned participation cannot be bypassed by rejoining.
- Indexed descriptors/subject queries let replay and the inspector read only needed bodies. Existing v2 records receive a transactional metadata backfill. The SDK reads durable replay, reports missing trailing ticks, rejects missing frames and de-duplicates timeline events; the Worker keeps only 32 resident frames. The complete archive remains on disk.
- Imports reject malformed event rings, duplicates, unsafe/nonfinite payloads and unknown actor references. A validated import drains the previous session before storage commit and retires its Worker only after success. Rejected commits leave the previous engine paused for explicit recovery; secondary cleanup failures are visible and do not undo an already committed primary save.
- Added a compact header with permanent Start/Pause/Resume, textual state, speed and consumption. Secondary features remain in a native keyboard-accessible tools drawer. Tablet/mobile share a single active panel; the desktop sidebar closes with its hidden content inert. Language changes persist independently of world/model/RNG configuration. The partial catalog and reviewed JSX migration do not yet translate every product string.
- Removed the mobile zoom prohibition, nested filter controls and unnamed switches; improved targets/contrast in configuration and stabilized dialog focus when callback identities change. Ready, initial setup and configuration passed automated WCAG A/AA checks in Chromium at 1440/768/390 px. Header geometry/focus/language persistence, production BYOK and 390 px guided setup passed in Chromium, Firefox and WebKit. Other surfaces and real 200% zoom remain open.
- Added `scripts/ui-string-inventory.mjs`, `scripts/localize-product-text.mjs`, header/accessibility smoke scripts and reusable tool navigation. The inventory is a review aid, not a guarantee that no product strings remain. Model output and user prompt content are excluded from conversion. Candidate identity also hashes the new domain schema and translation catalog; CI uses Node 24.11.1 and includes the new smoke paths.
- Next work: finish EN/IT including structured errors/dynamic labels, finish keyboard/entity navigation and the complete browser matrix, implement public admission/token renewal and coordinated quotas, then freeze the candidate for the real-time soak and prepare the separately authorized external gates.

### Resumed checkpoint evidence

- 374 tests passed (295 engine, 19 relay, 60 web). This includes all registry-matrix cases, snapshot preservation, import ordering/failure handling, indexed read isolation, missing replay tails and SDK history beyond the resident window. Lint, TypeScript, build/bundle integrity and the application high/critical advisory check passed locally.
- The internal full-feature browser smoke passed in Chromium: baseline pause/reload/resume/export/import, analytics, puzzles, prompt editor/inspector, experiments/cancellation and mocked direct/proxy protocol flows. Production BYOK passed in Chromium/Firefox/WebKit after the final import/replay changes, including keyboard close of the social graph. Header geometry/language and selected initial accessibility checks are described above; their scope remains limited.
- The local candidate is still dirty. `apps/web/dist/candidate.json` records bundle/source hashes; no immutable commit or remote CI is certified. Progress artifacts and browser reports are under `.tmp/`. All provider traffic in these checks was simulated or blocked.
- The original external boundaries remain: no Cloudflare deployment/runtime proof, no real 11-provider compatibility run, no 60-minute soak, no participant study or beta/stable evidence has been executed. Continue the active goal; do not mark any full release gate passed from these partial checks.

## EN/IT catalog and structured UI errors (2026-10-04)

- Extended the typed catalog to cover reviewed static JSX/attributes, configuration labels/help text, scenario descriptions, dynamic presentation labels, action/event names and parameterized UI messages. Metadata labels are localized at presentation; user names, model IDs, prompts, request/response bodies and experiment settings remain original.
- Worker errors now carry a shared content-free code/parameter envelope. The SPA localizes provider/budget/import/storage/vault/preflight errors; a visible stopped-session message follows language changes without issuing inference. The Worker no longer imports React or SPA catalogs through preflight validation. Unknown failures do not forward their message or stack through the error envelope.
- Added catalog key/placeholder parity, world/custom-prompt/RNG preservation and safe error transport tests. 378 tests passed locally (295 engine, 19 relay, 64 web), with lint/typecheck/build checks. Default English product labels continue to drive existing flows.
- Public BYOK, vault, five protocol-profile fixtures and mobile guided setup passed in EN/IT on Chromium, Firefox and WebKit. Automated A/AA checks passed for ready/setup/configuration at 1440/768/390 px in both languages on all three browsers. The ordinary CI smoke matrix now includes both languages.
- This closes the reviewed catalog work, not the complete UI gate: keyboard/entity/canvas alternatives, dynamic/technical-vocabulary audit across all running/secondary pages, real 200% zoom, a full public feature matrix and the reference-device performance/soak still require evidence. Provider traffic was blocked or simulated; no real provider certification, deployment or remote CI was performed.

## Keyboard, admission and candidate continuation (2026-10-04)

- Added native agent/resource selection on desktop and a resource list on mobile/tablet, plus keyboard pan/zoom/reset on both canvases. Keyboard zoom uses the same bounds as pointer controls. Resource selection no longer changes the React hook order. The production keyboard fixture passed all 18 browser/language/viewport combinations (Chromium, Firefox, WebKit; EN/IT; 1440×900, 768×1024, 390×844), with no page overflow or unhandled browser errors. Full keyboard navigation of secondary screens and real browser 200% zoom remain open.
- Added a separate admission Worker with `POST /v1/session`: strict bounded JSON, exact HTTPS origin/hostname and `simagents-session` action binding, Siteverify on every proof, 15-minute access and authenticated renewal retaining the same subject. Overall deadlines cover client bodies, coordinators and Siteverify; network failures have safe codes and no automatic retries. Deployment and genuine Turnstile/runtime evidence remain pending.
- Added a Durable Object subject coordinator: six concurrent leases, 50 forwards per rolling minute, issuance limits, opaque subjects/daily HMAC address fingerprints, alarm deletion within 24 hours. A stale alarm cannot erase newly created counters. Local fixtures establish behavior, not Cloudflare multi-location certification. Relay releases have a separate bounded deadline and lease expiry recovers an unavailable coordinator.
- Fixed global SPA budget slot release. The Worker now accepts a session-scoped token update only for its existing relay destination. Queued inference reads the token after budget admission; token updates preserve world snapshots and never enter exports. This checkpoint introduced the Worker-side update; the following continuation implements the SPA widget and autonomous session controller. The earlier manual token UI was never certified as autonomous public access.
- 397 tests passed locally (297 engine, 22 relay, 14 admission, 64 web), with lint, TypeScript and all workspace builds. All network traffic in tests was blocked or simulated. The dirty candidate `c1641356634ddd7e284d6a2daf8159aca3b4da955f8ea77dfce0237ff8fea233` includes admission, relay, web, catalog, schemas and lockfile; it is a local checkpoint, not a release commit.
- CI archives admission alongside relay/web and verifies all hashes after downloading the artifacts. Release requires one exact successful CI run on the same commit and consumes its artifacts rather than rebuilding the SPA. Evidence must identify the same candidate ID for every gate. Verified release packages are retained as release assets; CI evidence retention is 90 days. YAML/syntax and local fail-closed gate checks passed; this workflow has not run remotely.
- Next: finish the SPA admission/renewal flow, complete keyboard/zoom/feature checks, then prepare compatibility/pricing manifests and freeze a candidate for the real-time soak. Genuine provider, Cloudflare, remote CI, human usability, staging/rollback and beta/stable gates remain open. No paid calls, deployment, participant messages, commits or pushes were executed.

## Autonomous SPA access continuation (2026-10-04)

- Public relay selection now requires the complete operator build configuration (relay origin, separate admission origin and public Turnstile site key). The operator-issued-token field has been removed. Direct/provider and user-relay paths remain explicit. The managed widget is loaded only for an access attempt, with product language, action binding and automatic retry/refresh disabled.
- Added a memory-only authorization controller outside the provider vault and credential revision. It requests renewal at minute 13 using a fresh proof and previous token, deduplicates attempts, bounds admission responses, cancels stale attempts and rejects malformed/oversized responses. Failed/expired access does not silently mint a new subject or retry inference. Denied renewal can be recovered only by an explicit new access attempt.
- Interactive verification, failure and expiry block authorization in the engine Worker and pause/drain the live world. Closing the dialog cannot unblock startup/resume; a valid token update for the same destination clears the block while leaving the world paused. The header shows relay state, and its Tools menu provides explicit access recovery. Model receipts, experiment settings and world/RNG snapshots are preserved across successful renewal.
- Relay errors now use shared content-free codes, localized in EN/IT. Token expiry advises renewal and explicit resume, not a new paid model probe. Dialog focus excludes inert background roots, is contained through the challenge, and restores to an available control even when the original button is gone or disabled.
- 406 tests passed locally (298 engine, 22 relay, 14 admission, 72 web); lint, typecheck, full builds, bundle checks and candidate integrity passed. The dirty unconfigured production checkpoint is `70fbfbe00b442b2ac5b86bca6409dfb37aa9e93aceb5d161ed46efc531c9f8fa`. It is not an immutable release candidate or an operational public relay build.
- The separate configured admission fixture passed all 18 browser/language/viewport combinations, including initial admission, silent/interactive renewal of a running world, blocked resume after dismissal, explicit recovery, actual Worker token replacement, retained model verification/world and secret-free storage/export. Its 36 scoped automated A/AA checks (interactive and failed dialogs) found no violations. Reports/screenshots are in `.tmp/admission-browser`. The fixture uses actual local handlers with synthetic Turnstile/provider traffic and simulated authorization timers; it does not certify the publishable artifact or satisfy the genuine Cloudflare/60-minute gates.
- CI includes the admission fixture matrix and archived accessibility evidence. README, security notes and relay/admission documentation now describe autonomous access and temporary technical counters; historical manual-token instructions have been superseded. No real Turnstile solve, Cloudflare deployment/runtime evidence, paid inference, real-provider certification, commit/push, participant study or soak was executed.
- Next: complete whole-product keyboard/200% zoom and feature evidence, prepare compatibility/pricing manifests and the real-time soak harness, then freeze an exact configured candidate before separately authorized external validation. All five full release blocks remain subject to their original exit criteria.

## Public UI, keyboard and native zoom continuation (2026-10-04)

- Added a persistent session header on analytics, puzzles, gallery/inspector and replay. Start/pause/resume, speed, state and usage remain reachable while reading secondary screens. An error stop is labelled separately from a user pause, with an explicit new-session review path. Tools continue to expose configuration, import/export and return to the live world.
- Floating desktop panels now measure their actual dimensions and the header, clamp after viewport/header changes, and provide named keyboard move/resize controls with shared pointer/keyboard bounds. Agent rows have operable detail disclosure and show the actual agent name and latest reported model. A native replay-agent selector provides an alternative to canvas clicks; replay now stacks responsively and retains optional agent name/model metadata in new frames.
- Corrected unnamed capture/inspector/replay controls, nonfocusable scroll regions, low-contrast text/badges and replay/secondary-header overflow. Mobile content reserves the real navigation height; very narrow browser-zoom layouts use two navigation rows. Error text is scrollable and no longer sits beneath the bottom navigation. Replay ignores stale frame/timeline results and reports timeline load failures instead of silently hiding them.
- Canvas legends and reviewed biome/state/puzzle labels now use EN/IT. Paused canvases redraw on interface-language changes without modifying the world, RNG or prompts. The inspector footer correctly describes device-local data rather than the superseded localStorage backend.
- `scripts/public-ui-smoke.mjs` passed 24 cases on the same dirty production checkpoint `a3458c522eb897fb1bd42d4bfc721d0c0a695462d65d8f736fda6895e2c54410`: 18 ordinary cases across Chromium/Firefox/WebKit, EN/IT and 1440×900, 768×1024, 390×844; plus six native Chromium 200% cases at those physical sizes. 372 full-page A/AA surface checks found no violations or page overflow, and no unhandled browser errors occurred. All 24 cases verify paused-canvas language redraw and unchanged world/RNG/settings. Reports include the served candidate manifest; provider traffic is blocked/simulated.
- Native zoom uses an isolated Chromium test profile and a minimal extension calling `chrome.tabs.setZoom/getZoom`; reports confirm factor 2, halved CSS viewport, doubled devicePixelRatio and CSS zoom 1. This is native Chromium evidence only. Firefox/WebKit native 200% zoom, complete puzzle/detail/inspector interaction fixtures, broader keyboard/manual accessibility and the real-time performance/soak remain open. Automated checks do not replace the five-person usability study.
- 406 unit/regression tests, lint, TypeScript, builds and bundle/candidate checks passed. The production BYOK regression passed after the header/replay changes. CI now includes the public surface matrix, Chromium native zoom and archived reports/screenshots. CI remains unexecuted remotely; the candidate is dirty and the public relay is not configured or deployed.
- Next: finish remaining feature/zoom evidence, close coordinated-expiry boundary tests, prepare compatibility/pricing manifests and the real-time soak harness, then freeze a clean configured candidate for the separately authorized external gates. No paid calls, deployment, commits/pushes, participant messages or real-time soak were executed.

## Coordinated expiry, pointer controls, provenance and soak preparation (2026-10-04)

- Coordinator state now expires as its actual 60-second windows and 90-second leases end; elapsed entries are pruned without resetting fresh traffic at a calendar boundary. Counter and alarm writes use one SQLite storage transaction. Three added regressions cover rolling limits/concurrency at the former 24-hour boundary, rollback when alarm persistence fails, and pruning old windows while preserving active leases. Logical application cleanup is not certification of platform backup/log retention.
- Added single-click/tap alternatives to panel movement, panel resize and both map panning views. Keyboard shortcuts and original drag gestures remain available. Map panning controls use a native popover outside canvas clipping; opening a modal dismisses popovers so they cannot obscure security verification. Pointer/keyboard/A/AA checks passed on desktop and narrow native-zoom Chromium; the complete matrix needs a fresh run on the new checkpoint.
- Import now reports localized progress/success/error codes instead of raw browser alerts, prevents a competing startup/reset/configuration during pending import, and clears the retired engine's old error after successful import. Resume/new-world selection exposes its pressed state. Large preconditioned-world setup is exercised through public import, model verification and explicit saved-world resume.
- Added build-source provenance: successful Vite output writes a receipt binding its compilation inputs and public relay configuration. Candidate generation/verification rejects stale artifacts or missing/mismatched receipts; a deliberate stale-receipt check was rejected. Local dependent build/manifest commands stop on build failure. The current dirty checkpoint is `0c3d3eefac40922a03ff7f464866f071817954676269bd5e96295a9e08ba129d`.
- 409 application/engine/admission/relay tests passed (298 engine, 25 relay, 14 admission, 72 web), with TypeScript/lint/build checks. Three separate release-gate tests establish fail-closed beta/stable rules. Stable now also requires seven real beta days, 20 completed sessions, five distinct humans, no open critical/high issue and passed compatible rollback; automated sessions/relay subjects cannot replace human evidence.
- Added an unexecuted provider manifest/runbook: 11 providers, 12 combinations, 48 planned inference attempts (probe plus three simulation decisions each), documented USD pricing sources/date/conditions, exact targets/endpoints/transports/caps/key references, no retries/fallbacks and a proposed USD 5 ceiling. Authorization, dedicated keys, exact staging candidate/destinations and all verification fields remain unset. No paid request was sent. Added unexecuted five-person usability and operational/staging/rollback protocols.
- The real-time soak harness uses the public SPA, 20 BYOK simulated HTTP agents at 1×, controlled zero hunger/energy decay and explicit synthetic preconditioning of resident event/memory/metric bounds. The preloaded two-hour timestamp/history is not elapsed test time; only subsequent monotonic wall time and simulation deltas count. Native browser-process RSS, UI click-to-presentation latency, invariants, counters and reload are recorded. No accelerated/page clock or provider-paid transport is used.
- A 60-second real pilot passed: all 20 agents made decisions, cumulative counters survived reload, and measured UI p95 was about 17 ms. This pilot is not a 60-minute or memory-plateau pass. A separate 3600-second run is active on the frozen copy of this checkpoint at loopback port 5187, with terminal/evidence handles in `.tmp/resume-progress.json`. Do not restart it from a timeout or claim it complete before its terminal report. Candidate cleanliness, all exact-candidate gates and real provider/Cloudflare/human/beta evidence remain open.

## Reported consumption, published-rate estimates and attempt journal (2026-10-04)

- Added optional persisted input/output totals, sample coverage, maximum observed per-request input and exact provider/requested-model/endpoint context to cumulative metrics. Legacy combined totals remain readable; absent or partial breakdowns are explicit. Context changes mark estimates unavailable instead of reusing the last model's rate. Invalid coverage imports are rejected before hydration mutates the world.
- Provider extraction rejects fractional/negative token counts. Gemini output includes thinking when total/thinking metadata supports it; contradictory totals cannot fabricate a zero. Cache activity, missing billing components and legacy-only totals prevent the simple uncached-rate estimate. Reported usage is separate from price estimates, with explicit exclusions for probes, failed/cancelled calls and unreported components.
- Added a versioned published-price artifact with currency, exact model/endpoint, source/date and applicable conditions for the draft minimum verification targets. Unknown paths/models, mixed contexts, stale prices and outside-tier inputs return unavailable, never zero. EN/IT profile/configuration displays explain source/conditions and estimate coverage. Published pricing does not certify any model or guarantee a provider invoice.
- Added a no-network durable attempt journal: exclusive campaign lock, fsynced intent/result receipts before a possible send, conservative reservations, duplicate/concurrent attempt rejection, stop after failure/unknown outcomes and refusal to silently reopen recorded campaigns. Three contract tests cover intent ordering/bounds, failure/restart blocking and safe terminal fields; authority remains external and no paid calls were executed.
- 416 workspace tests passed (301 engine, 25 relay, 14 admission, 76 web), plus six release/journal contract tests and the draft manifest checker. TypeScript/lint/build/bundle/provenance checks passed. Current dirty checkpoint: `1987adf0fa4317a7830bcbf297272f87d91dc09e8603cdec954e6d2ec0cf4a8d`. A fresh full browser matrix is still required after these UI/telemetry changes.
- The real 60-minute run is still live on frozen checkpoint `0c3d3eefac40922a03ff7f464866f071817954676269bd5e96295a9e08ba129d`, now beyond minute 53 with 20 agents and no recorded error. Do not transfer its eventual result to the updated compiled artifact. Poll session 53424 and its terminal summary; neither elapsed partial time nor preliminary memory readings pass the final gate. Clean candidate/remote CI, real Cloudflare/provider evidence, native non-Chromium zoom, complete feature/manual/accessibility/storage fault cases, five humans and beta/stable criteria remain open.

## Completed local soak and populated readers/storage evidence (2026-10-04)

- The fixed 60-minute workload completed on frozen dirty checkpoint `0c3d3eefac40922a03ff7f464866f071817954676269bd5e96295a9e08ba129d`: 3,600,251.1 ms real wall time, 3,599,750 ms simulation delta, 20/20 alive, 1,200 actual simulation actions, one separate synthetic probe, no unhandled page/invariant error, committed counters unchanged after reload. There were 359 native browser-process RSS samples and 120 UI latency samples; p95 was 16.1 ms. Predeclared memory thresholds passed, with the last four five-minute medians plateauing then falling. The immutable copied SPA/relay/admission hashes were verified after completion. See `docs/soak-2026-10-04.md` for workload/machine/method and exact scope. This result cannot close the gate for the subsequently changed compiled candidate.
- Valid import/new-world startup no longer silently deletes existing indexed replay/trace archives. Explicit reset describes its destructive archive scope. The retained histories remain world/agent indexed and budgeted. Populated fixture tests confirm archive count preservation, protected open-puzzle fragments, visible completed fragments, captured original bodies and native replay-agent selection without reader-triggered inference.
- Populated reader tests found and corrected scroll areas without keyboard focus, low-contrast completed/inspector badges and overlapping mobile inspector panes. Mobile history/detail are mutually visible with a back control, and captured content has at least an 80px usable reading area. Reviewed captured flags/status labels are EN/IT; original model body text remains unchanged.
- All 18 populated-reader cases passed in Chromium/Firefox/WebKit, EN/IT and 1440/768/390 px on updated dirty checkpoint `ba67c0d970f05356a2343fed802cb39c66cf87b0688a9c18591779751113e712`; summaries bind the served candidate. 416 workspace tests and six contract tests remain locally green, with TypeScript/lint/build/bundle/provenance checks. The extended ordinary UI/admission matrix still needs a fresh run after these changes; remote CI remains unexecuted.
- Genuine browser IndexedDB tests using production AppDataStore passed in all three engines: 43 secondary 1 MiB records accepted before the 45 MiB payload ceiling, primary reserve usable below 50 MiB, overflowing writes atomic with source world/accounting intact, and accounting correct after archive removal. These are an internal test artifact, not provider calls or native quota-manager certification.
- EN/IT injected QuotaExceededError UI tests preserve the committed world/accounting and show handled errors. CDP's native origin quota override reported zero/small quotas but allowed the write; that negative attempt is explicitly not a native-denial/physical-insufficient-space pass. Genuine environment-level quota/disk evidence remains open rather than being replaced by the injected case.
- CI now archives populated-reader, storage-budget and injected-fault reports and retains the expanded required matrix. No deployment, paid inference, clean commit/push, real Cloudflare/provider certification, new participants or beta/stable opening occurred. Native non-Chromium zoom, manual/human/full-current-candidate and operational gates retain their original requirements.

## Production preparation and native browser/runtime evidence (2026-10-04)

- Fixed the deployable Worker entrypoints: factories and numeric constants remain available to unit tests, while production bundles export only the handler and bound Durable Object class. Actual local workerd previously rejected the numeric exports; it now starts both services.
- The pinned local Miniflare/workerd check passes six coordinated leases, 50 charged rolling forwards, four mints per minute, release recovery and real 62-second alarm/window expiry. SQLite counter state was read as deleted before any fresh mint. It also verifies that unconfigured admission fails closed. The runtime uses a July compatibility date and cannot certify deployed September/October behavior, platform retention or genuine Turnstile.
- Native zoom now uses Firefox's Juggler full-page zoom and WebKit's native page-zoom command, in addition to Chromium's tabs API. Both new methods verify halved CSS geometry, doubled DPR, unchanged CSS zoom and restoration to 100%. Firefox zoomed flows use native keyboard activation because its pointer automation coordinates are inconsistent under zoom; manual pointer evidence remains open. Safari Escape behavior was corrected for the tools drawer and panel adjustment controls, and transient verification-button contrast was improved.
- Dirty checkpoint `3582dbab2ff87cfe96f338dae68cf974e6a0bc270a3f4582ef34c3cb317be1f2` passed 36 public UI cases (three browsers, EN/IT, three sizes, 100%/200%), 654 complete A/AA surface checks, 18 populated data cases and 18 synthetic admission cases. The consolidated receipt is `.tmp/verification-20261004-3582dbab/summary.json`; corrected recovery tests are linked individually. Failed attempts retain screenshots and Playwright traces. These results do not transfer to subsequent export-error or production-configuration changes.
- The updated advisory audit found a new high-severity braces stack-exhaustion issue without an upstream patch. Documentation now resolves all braces consumers to an explicitly private local fork with bounded pattern and AST depth/node count; three normal/exploitation/direct-module regressions pass. A clean locked documentation install/build passes; npm audit has zero critical/high findings and 17 moderate findings. Root application audit has zero high/critical blockers. The separate runtime fixture pins patched sharp/undici versions and also audits cleanly. No advisory is suppressed.
- Replaced the remaining raw export-failure alert with a safe structured error and EN/IT notice. Production origins are prepared for the existing `app.simagents.io` Pages project, `doc.simagents.io`, and new relay/admission custom domains. Wrangler OAuth and existing project/deployment identities were verified read-only. One Free managed Turnstile widget is restricted to `app.simagents.io`; its server secrets are in ignored private files with 0600 permissions. No provider key is part of the build or these secrets.
- CI now supplies only public production configuration, tests native zoom in all three engines, archives failure traces, runs the local workerd check and the documentation security regression. Admission fixtures are being moved to the same downloaded production SPA instead of rebuilding a separate frontend. Worker deployment configuration uses compiled bundles without rebundling.
- Next production candidate is still dirty and requires a clean checkpoint, remote exact-candidate CI, updated browser evidence and the final-candidate soak. Real Cloudflare limits/renewal/retention, all 11 live providers, human usability, operational alarms/owner, compatible rollback and beta/stable observations remain open. Direct production authorization does not authorize paid provider calls or establish an infrastructure budget; billing visibility is currently denied to the available OAuth scope.

## Free-only and complete 24-hour retention decision (2026-10-04)

- The user kept USD 0/Workers Free only and rejected retaining technical counter history for 30 days. The replacement coordinator uses one constant object name, RAM-only subject/IP-fingerprint counters, no storage/alarm API calls, a 4096-entry capacity ceiling and five-second expiry cleanup. Cold/restarted instances reject grants for 90 seconds so a restart cannot erase still-live limits. The promise queue does not retain the last lease response indefinitely.
- Actual local workerd passed a 91-second cold-start barrier, six leases, 50 charged forwards, four mints, and 97-second expiry/GC. SQLite keys were empty both during activity and after all RAM subjects were removed. This is local proof of the implementation; deployed Free-plan and platform-log evidence remains open.
- The SPA checks readiness before obtaining a fresh proof, suspends model work while warming, performs a single admission POST and never resumes inference automatically. Readiness/warmup and restart regressions pass; mobile connection/verification/limit controls now have 44-pixel targets. The updated 200% mobile cases and same-artifact admission fixtures passed Chromium/Firefox/WebKit in Italian.
- Clean checkpoint `cc80b8e2afccdedbaf3b2ab2e36c3b7cef575ea4` was pushed through existing SSH after HTTPS OAuth rejected workflow-file updates. CI built candidate `5df65352ca9307d6129f650a2a5ad59387251b9f9449f06c590286b768d94cc1`; downloaded SPA/relay/admission bytes matched the local frozen artifact exactly. Its real 60-minute run completed: 20 active agents, 1201 simulated HTTP calls, p95 16 ms, native RSS plateau thresholds passed, no errors and restored counters. The RAM-coordinator change supersedes that artifact; the report is retained at `.tmp/soak/2026-10-04T08-25-58-889Z-60m` and cannot be transferred silently.
- The remote CI was not green: its old internal test waited forever for the removed import alert, causing the 60-minute job timeout; required-job cancellation correctly failed the summary. The test now waits for the real structured status notification, uses bounded waits and passed locally across baseline persistence, features, experiments, import/export and simulated transports. A new complete remote run is required.
- Free-plan proof still needs Dashboard access because available OAuth denies subscriptions/billing reads. One existing Free Turnstile widget is prepared; no Worker/Pages rollout, account upgrade or paid model call has occurred. Dedicated provider keys, 11 genuine certifications, human study, operational ownership/alarms, compatible rollback and actual beta/stable observations remain open.
