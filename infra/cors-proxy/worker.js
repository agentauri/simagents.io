/**
 * Sim Agents CORS proxy privacy contract:
 * stateless forwarding only, no storage, no analytics, and no logging of
 * request headers, API keys, prompts, payloads, or provider responses.
 */

const ALLOWED_PROVIDER_HOSTS = new Set([
  'api.openai.com',
  'api.deepseek.com',
  'dashscope-intl.aliyuncs.com',
  'api.z.ai',
  'api.x.ai',
  'api.mistral.ai',
  'api.minimax.io',
  'api.moonshot.ai',
]);

const FORWARDED_HEADERS = ['authorization', 'x-api-key', 'anthropic-version', 'content-type'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, x-api-key, anthropic-version, content-type',
  'Access-Control-Max-Age': '86400',
};

const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return withCors(new Response('Method not allowed', { status: 405 }));
    }

    const url = new URL(request.url);
    const target = buildTargetUrl(url);
    if (!target) {
      return withCors(new Response('Provider host is not allowed', { status: 403 }));
    }

    const upstreamHeaders = new Headers();
    for (const header of FORWARDED_HEADERS) {
      const value = request.headers.get(header);
      if (value) upstreamHeaders.set(header, value);
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.body,
      redirect: 'manual',
    });

    return withCors(upstream);
  },
};

function buildTargetUrl(url) {
  const route = url.pathname.replace(/^\/+/, '');
  const slash = route.indexOf('/');
  const providerHost = slash === -1 ? route : route.slice(0, slash);
  const providerPath = slash === -1 ? '/' : `/${route.slice(slash + 1)}`;

  if (!ALLOWED_PROVIDER_HOSTS.has(providerHost)) return null;
  return `https://${providerHost}${providerPath}${url.search}`;
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
