# Sim Agents CORS Proxy

This directory contains the only deployable backend artifact required by browser-local Sim Agents: a stateless Cloudflare Worker that adds CORS support for LLM providers that do not accept direct browser calls.

The app builds proxied provider URLs as:

```text
https://<proxy-host>/<provider-host>/<path>
```

For example:

```text
https://your-worker.example.com/api.openai.com/v1/chat/completions
```

## Why It Exists

The browser-local engine runs in a Web Worker and calls LLM providers with user-supplied API keys. Some providers allow direct browser requests; many OpenAI-compatible providers do not return permissive CORS headers. This Worker forwards those calls without becoming application storage or an analytics service.

Allowed provider hosts:

- `api.openai.com`
- `api.deepseek.com`
- `dashscope-intl.aliyuncs.com`
- `api.z.ai`
- `api.x.ai`
- `api.mistral.ai`
- `api.minimax.io`
- `api.moonshot.ai`

## Privacy Contract

- Stateless request forwarding only.
- No database, cache, KV, Durable Object, queue, or analytics binding.
- No retention of keys, prompts, payloads, responses, or metadata.
- No logging of request headers, request bodies, API keys, prompts, payloads, or provider responses.
- Only these request headers are forwarded upstream: `Authorization`, `x-api-key`, `anthropic-version`, and `content-type`.

The provider still receives the request and processes it under its own terms. The proxy only removes the browser CORS limitation.

## Public Deployments: Open-Relay Note

The Worker ships with `Access-Control-Allow-Origin: *`, so any website could relay requests through your deployment (always with the caller's own API key — there is nothing to steal — but the bandwidth and Cloudflare usage are yours). For a personal deployment this is usually fine. If you expose the URL publicly, either restrict `Access-Control-Allow-Origin` in `worker.js` to your app's origin or add a Cloudflare rate-limiting rule.

## Self-Host In About 5 Minutes

Install Wrangler if needed:

```bash
bunx wrangler login
```

Deploy from this directory:

```bash
cd infra/cors-proxy
bunx wrangler deploy
```

Wrangler prints the Worker URL after deploy.

## Point The App At Your Proxy

Open the Sim Agents Config panel and set the proxy URL field to your Worker origin, for example:

```text
https://simagents-cors-proxy.example.workers.dev
```

The app stores that value in browser localStorage under `simagents_proxy_url`. The engine request builder then sends proxied providers to:

```text
<proxy-url>/<provider-host>/<path>
```

No deployment is required for local development if you only use direct-CORS providers.
