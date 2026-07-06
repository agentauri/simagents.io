# BYOK Security Notes

Sim Agents stores provider API keys in browser `localStorage` under `simagents_api_keys`. The active browser origin is the security boundary.

## Current Position

- Keys are stored as plain `localStorage` values.
- The Web Worker receives active keys only when a local run starts.
- Direct-CORS providers are called from the browser.
- Proxy-only providers are called through a user-configured proxy URL.
- The repository does not currently implement passphrase encryption for browser-local keys.

Plain `localStorage` is acceptable only with a strict XSS posture. Any script that executes on the app origin can read the keys while the app is running.

## Implemented Guardrails

- `apps/web/index.html` defines a Content Security Policy that blocks third-party scripts, objects, frames, and non-local workers.
- React renders LLM and event text as text nodes; the app does not use `dangerouslySetInnerHTML`.
- `apps/web/src/utils/security.ts` sanitizes displayed LLM/event strings by stripping control characters and truncating long content.
- Provider keys are not written into snapshots, replay frames, prompt logs, or experiment exports.

The current audit command for dangerous HTML/script sinks is:

```bash
rg -n "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|eval\\(|new Function|document\\.write|DOMParser" apps/web/src apps/web/index.html packages/engine/src packages/shared/src
```

As of July 5, 2026, this command returns no matches in those surfaces.

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

## Future Passphrase Encryption

Optional Web Crypto passphrase encryption can reduce accidental at-rest key exposure on a shared machine, but it does not solve XSS because the app must decrypt keys before provider calls. If implemented, it should be framed as local-device hardening, not as protection from malicious script execution.

Minimum requirements for that feature:

- PBKDF2 or Argon2id-derived key from a user passphrase.
- AES-GCM encryption per provider key with unique random IVs.
- No passphrase or derived key persisted across reload unless the user explicitly chooses a session-only unlock.
- Migration path from existing plain `simagents_api_keys`.
- Clear fallback for users who prefer simple localStorage.

## Review Checklist

Before merging any browser-local feature that displays model output, imported world data, proxy responses, or user-entered rich text:

1. Keep rendering as React text nodes.
2. Do not introduce `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`.
3. Use `sanitizeText`, `sanitizeReasoning`, or a stricter validator for visible untrusted strings.
4. Keep provider keys out of logs, snapshots, replay frames, prompt logs, and exports.
5. Re-run the audit command above and the browser smoke test.
