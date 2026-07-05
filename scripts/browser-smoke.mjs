#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = loadPlaywright();

const baseUrl = process.env.SIMAGENTS_SMOKE_URL ?? 'http://localhost:5175/';

const baselineRoster = [
  { name: 'Random-1', provider: 'baseline_random', modelId: 'baseline_random', color: '#9ca3af' },
  { name: 'Rule-1', provider: 'baseline_rule', modelId: 'baseline_rule', color: '#6b7280' },
  { name: 'Sugar-1', provider: 'baseline_sugarscape', modelId: 'baseline_sugarscape', color: '#4b5563' },
];

const codexRoster = [
  { name: 'Codex-1', provider: 'codex', modelId: 'gpt-5.4-mini', color: '#3b82f6' },
];

const claudeRoster = [
  { name: 'Claude-1', provider: 'claude', modelId: 'claude-sonnet-5', color: '#e07a5f' },
];

const results = [];
const failures = [];

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '600',
};

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    if (!process.env.PLAYWRIGHT_MODULE_DIR) {
      throw error;
    }
    return createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR.replace(/\/+$/, '')}/package.json`)('playwright');
  }
}

function browserInitPayload({ roster = baselineRoster, keys = {}, proxyUrl = '', config = {} } = {}) {
  return { roster, keys, proxyUrl, config };
}

function installLocalState({ roster, keys, proxyUrl, config }) {
  const preserve = new Set([
    'simagents_sound_enabled',
    'simagents_sound_volume',
    'simagents_world_snapshot',
    'simagents_event_ring',
  ]);
  for (const key of Object.keys(localStorage)) {
    if (!preserve.has(key)) localStorage.removeItem(key);
  }
  localStorage.setItem('simagents_agent_roster', JSON.stringify(roster));
  if (Object.keys(keys).length > 0) {
    localStorage.setItem('simagents_api_keys', JSON.stringify(keys));
  }
  if (proxyUrl) {
    localStorage.setItem('simagents_proxy_url', proxyUrl);
  }
  if (Object.keys(config).length > 0) {
    localStorage.setItem('simagents_config_overrides', JSON.stringify(config));
  }
}

function actionText(provider) {
  return JSON.stringify({
    action: 'signal',
    params: { message: `${provider} smoke`, intensity: 1 },
    reasoning: `${provider} mocked browser request`,
  });
}

function corsHeadersFor(request) {
  return {
    ...CORS_HEADERS,
    'access-control-allow-headers':
      request.headers()['access-control-request-headers'] ??
      'authorization,content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access',
  };
}

async function fulfillCorsPreflight(route) {
  await route.fulfill({
    status: 204,
    headers: corsHeadersFor(route.request()),
    body: '',
  });
}

function assertSmoke(condition, message, details = {}) {
  if (condition) return;
  failures.push({ message, ...details });
}

async function createContext(browser, payload, options = {}) {
  const context = await browser.newContext({ acceptDownloads: true, ...options });
  await context.addInitScript(installLocalState, payload);
  return context;
}

async function openPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  return page;
}

async function clickStart(page, choice = 'new') {
  await page.getByRole('button', { name: /^(Start|Go)$/ }).first().click();

  if (choice === 'resume') {
    await page.getByRole('button', { name: /Resume saved world/i }).click();
    await page.getByRole('button', { name: /^Resume$/ }).click();
  } else {
    const newWorld = page.getByRole('button', { name: /Start new world/i });
    if ((await newWorld.count()) > 0) {
      await newWorld.click();
    }
    await page.getByRole('button', { name: /^Start$/ }).last().click();
  }

  await page.waitForFunction(() => document.body.innerText.includes('Running'));
}

async function clickPause(page) {
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Paused'));
  await page.waitForFunction(() => !!localStorage.getItem('simagents_world_snapshot'));
}

async function clickResume(page) {
  await page.getByRole('button', { name: /Resume/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Running'));
}

async function snapshot(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('simagents_world_snapshot') ?? 'null'));
}

async function verifyLocalAnalytics(page) {
  await page.getByRole('button', { name: /Analytics/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Analytics Dashboard'));
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('alive agents by llm'));

  const visible = await page.evaluate(() => {
    const text = document.body.innerText;
    const normalizedText = text.toLowerCase();
    return {
      dashboard: text.includes('Analytics Dashboard'),
      survival: text.includes('Survival Metrics'),
      economy: text.includes('Economy Metrics'),
      behavior: text.includes('Behavior Metrics'),
      temporal: text.includes('Temporal Metrics'),
      aliveByLlm: normalizedText.includes('alive agents by llm'),
    };
  });
  results.push({ step: 'local-analytics', ...visible });
  assertSmoke(
    Object.values(visible).every(Boolean),
    'local analytics dashboard did not render expected metric sections',
    visible
  );

  await page.getByRole('button', { name: /Back to City/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Paused'));
}

async function runBaselinePersistence(browser) {
  const context = await createContext(browser, browserInitPayload({ roster: baselineRoster }));
  const page = await openPage(context);

  await clickStart(page, 'new');
  await page.waitForTimeout(2_200);
  await clickPause(page);
  const afterPause = await snapshot(page);
  results.push({
    step: 'baseline-start-pause',
    agents: afterPause.store.agents.length,
    tick: afterPause.store.worldState.currentTick,
    events: afterPause.store.events.length,
  });
  assertSmoke(afterPause.store.agents.length === baselineRoster.length, 'baseline start spawned wrong agent count', {
    expected: baselineRoster.length,
    actual: afterPause.store.agents.length,
  });
  assertSmoke(afterPause.store.events.length > 0, 'baseline start produced no events');
  await verifyLocalAnalytics(page);

  await clickResume(page);
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await clickStart(page, 'resume');
  await page.waitForTimeout(600);
  await clickPause(page);
  const afterReloadResume = await snapshot(page);
  results.push({
    step: 'reload-resume',
    agents: afterReloadResume.store.agents.length,
    tick: afterReloadResume.store.worldState.currentTick,
  });
  assertSmoke(afterReloadResume.store.agents.length === baselineRoster.length, 'reload resume lost agents', {
    expected: baselineRoster.length,
    actual: afterReloadResume.store.agents.length,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTitle('Export current world').first().click(),
  ]);
  const exportPath = await download.path();
  const exportJson = await readFile(exportPath, 'utf8');
  const exported = JSON.parse(exportJson);
  results.push({
    step: 'export',
    bytes: Buffer.byteLength(exportJson),
    exportedAgents: exported.snapshot.store.agents.length,
    exportedEvents: exported.events.length,
  });
  assertSmoke(Buffer.byteLength(exportJson) > 0, 'export produced an empty payload');
  assertSmoke(exported.snapshot.store.agents.length === baselineRoster.length, 'exported world has wrong agent count', {
    expected: baselineRoster.length,
    actual: exported.snapshot.store.agents.length,
  });
  assertSmoke(exported.events.length > 0, 'exported world has no event ring');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Reset/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Ready'));

  page.once('dialog', async (dialog) => {
    results.push({ step: 'import-dialog', message: dialog.message() });
    await dialog.accept();
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'simagents-world-smoke.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportJson),
  });
  await page.waitForFunction(() => !!localStorage.getItem('simagents_world_snapshot'));
  await clickStart(page, 'resume');
  await page.waitForTimeout(500);
  await clickPause(page);
  const afterImportResume = await snapshot(page);
  results.push({
    step: 'import-resume',
    agents: afterImportResume.store.agents.length,
    tick: afterImportResume.store.worldState.currentTick,
  });
  assertSmoke(afterImportResume.store.agents.length === baselineRoster.length, 'import resume has wrong agent count', {
    expected: baselineRoster.length,
    actual: afterImportResume.store.agents.length,
  });

  await context.close();
}

async function runLocalAgentOverrides(browser) {
  const context = await createContext(
    browser,
    browserInitPayload({
      roster: [baselineRoster[0]],
      config: {
        agent: {
          startingBalance: 997,
          startingHealth: 88,
        },
        economy: {
          currencyDecayRate: 1,
          currencyDecayInterval: 1,
        },
      },
    })
  );
  const page = await openPage(context);

  await clickStart(page, 'new');
  await clickPause(page);
  const [agent] = (await snapshot(page)).store.agents;
  results.push({
    step: 'local-agent-overrides',
    balance: agent.balance,
    health: agent.health,
  });
  assertSmoke(agent.balance === 997, 'local agent balance override was not applied', {
    expected: 997,
    actual: agent.balance,
  });
  assertSmoke(agent.health === 88, 'local agent health override was not applied', {
    expected: 88,
    actual: agent.health,
  });

  await context.close();
}

async function runProxyMissing(browser) {
  const context = await createContext(
    browser,
    browserInitPayload({ roster: codexRoster, keys: { codex: 'test-codex-key' } })
  );
  const page = await openPage(context);

  await page.getByTitle('Configuration').first().click();
  const select = page.locator('select').filter({ has: page.locator('option[value="codex"]') }).first();
  const codexOption = select.locator('option[value="codex"]');
  results.push({
    step: 'proxy-missing-ui',
    codexOptionText: await codexOption.textContent(),
    codexOptionDisabled: await codexOption.evaluate((option) => option.disabled),
  });
  const proxyMissingUi = results.at(-1);
  assertSmoke(proxyMissingUi.codexOptionDisabled === true, 'proxy-required provider option is not disabled without proxy', {
    actual: proxyMissingUi.codexOptionDisabled,
  });
  assertSmoke(
    typeof proxyMissingUi.codexOptionText === 'string' && proxyMissingUi.codexOptionText.includes('needs proxy'),
    'proxy-required provider option does not show needs-proxy label',
    { actual: proxyMissingUi.codexOptionText }
  );

  await page.keyboard.press('Escape');
  await clickStart(page, 'new');
  await page.waitForTimeout(2_500);
  await clickPause(page);
  const eventPayloads = (await snapshot(page)).store.events.map((event) => event.payload);
  results.push({
    step: 'proxy-missing-run',
    usedFallbackEvents: eventPayloads.filter((payload) => payload?.usedFallback === true).length,
  });
  assertSmoke(results.at(-1).usedFallbackEvents > 0, 'proxy-missing run did not use fallback decisions');

  await context.close();
}

async function runDirectLlm(browser) {
  const hits = [];
  const context = await createContext(
    browser,
    browserInitPayload({
      roster: claudeRoster,
      keys: { claude: 'test-claude-key' },
    })
  );
  const page = await openPage(context);

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillCorsPreflight(route);
      return;
    }
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    hits.push({
      url: route.request().url(),
      headers: await route.request().allHeaders(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeadersFor(route.request()),
      body: JSON.stringify({
        content: [{ type: 'text', text: actionText('claude') }],
        usage: { input_tokens: 20, output_tokens: 8 },
      }),
    });
  });

  await clickStart(page, 'new');
  await page.waitForTimeout(2_500);
  await clickPause(page);
  results.push({
    step: 'direct-llm-mocked',
    hits: hits.length,
    authHeader: hits[0]?.headers?.['x-api-key'] ? 'x-api-key' : 'missing',
    model: hits[0]?.body?.model,
  });
  assertSmoke(hits.length > 0, 'direct LLM mock received no POST requests');
  assertSmoke(hits[0]?.headers?.['x-api-key'] === 'test-claude-key', 'direct LLM mock missing x-api-key header', {
    actual: hits[0]?.headers?.['x-api-key'] ? 'present' : 'missing',
  });
  assertSmoke(hits[0]?.body?.model === 'claude-sonnet-5', 'direct LLM mock used unexpected model', {
    expected: 'claude-sonnet-5',
    actual: hits[0]?.body?.model,
  });

  await context.close();
}

async function runProxyLlm(browser) {
  const hits = [];
  const proxyUrl = 'https://proxy.example.test/llm';
  const context = await createContext(
    browser,
    browserInitPayload({
      roster: codexRoster,
      keys: { codex: 'test-openai-key' },
      proxyUrl,
    })
  );
  const page = await openPage(context);

  await page.route(`${proxyUrl}/api.openai.com/v1/chat/completions`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillCorsPreflight(route);
      return;
    }
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    hits.push({
      url: route.request().url(),
      headers: await route.request().allHeaders(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeadersFor(route.request()),
      body: JSON.stringify({
        choices: [{ message: { content: actionText('codex') } }],
        usage: { prompt_tokens: 22, completion_tokens: 9 },
      }),
    });
  });

  await clickStart(page, 'new');
  await page.waitForTimeout(2_500);
  await clickPause(page);
  results.push({
    step: 'proxy-llm-mocked',
    hits: hits.length,
    authorization: hits[0]?.headers?.authorization ? 'bearer' : 'missing',
    url: hits[0]?.url,
    model: hits[0]?.body?.model,
  });
  assertSmoke(hits.length > 0, 'proxied LLM mock received no POST requests');
  assertSmoke(hits[0]?.headers?.authorization === 'Bearer test-openai-key', 'proxied LLM mock missing bearer auth', {
    actual: hits[0]?.headers?.authorization ? 'present' : 'missing',
  });
  assertSmoke(
    hits[0]?.url === `${proxyUrl}/api.openai.com/v1/chat/completions`,
    'proxied LLM mock used unexpected URL',
    { expected: `${proxyUrl}/api.openai.com/v1/chat/completions`, actual: hits[0]?.url }
  );
  assertSmoke(hits[0]?.body?.model === 'gpt-5.4-mini', 'proxied LLM mock used unexpected model', {
    expected: 'gpt-5.4-mini',
    actual: hits[0]?.body?.model,
  });

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await runBaselinePersistence(browser);
  await runLocalAgentOverrides(browser);
  await runProxyMissing(browser);
  await runDirectLlm(browser);
  await runProxyLlm(browser);
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (failures.length > 0) {
  console.error('Smoke assertions failed:');
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
