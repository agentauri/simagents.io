#!/usr/bin/env node
// Public production flows only. All provider traffic is simulated; no development engine bridge.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { en, it } from '../apps/web/src/i18n/catalog.ts';
import { nativeZoomContext } from './native-zoom.mjs';
import { openSimulationTool, productText, setSmokeLanguage, smokeLanguage, activateControl } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const width = Number(process.env.SIMAGENTS_SMOKE_WIDTH ?? 1440), height = width === 768 ? 1024 : width === 390 ? 844 : 900;
const zoom = Number(process.env.SIMAGENTS_SMOKE_NATIVE_ZOOM ?? 1);
if (zoom !== 1 && (zoom !== 2 || !['chromium', 'firefox', 'webkit'].includes(browserName))) throw new Error('Native zoom is supported for Chromium, Firefox and WebKit');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const native = zoom === 2 ? await nativeZoomContext(playwright, { width, height }, browserName, base) : undefined;
const browser = native ? undefined : await playwright[browserName].launch({ headless: true });
const context = native?.context ?? await browser.newContext({ acceptDownloads: true, viewport: { width, height } });
let calls = 0;
const result = { browser: browserName, language: smokeLanguage, viewport: { width, height }, zoom, surfaces: [], failures: [], pageErrors: [] };
const keyboardOnly = zoom === 2 && browserName === 'firefox';
const activate = locator => activateControl(locator, keyboardOnly);
const openTool = (page, name) => openSimulationTool(page, name, keyboardOnly);
const assert = (value, message) => { if (!value) throw new Error(message); };
await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
await context.route('https://api.anthropic.com/v1/messages', route => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  calls++;
  const action = calls === 2 ? { action: 'sleep', params: { duration: 1 }, reasoning: 'Original model response' } : { action: 'signal', params: { message: 'fixture', intensity: 1 }, reasoning: 'Original model response' };
  return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ model: 'fixture-reported-model', usage: { input_tokens: 12, output_tokens: 9 }, content: [{ type: 'text', text: JSON.stringify(action) }] }) });
});
await context.addInitScript(() => {
  window.__drawnProductText = [];
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(...args) {
    if (/^(Tick|Agents|Agenti|Resources|Risorse|Food|Cibo|Energy|Energia|Material|Materiale|Biomes|Biomi|Forest|Foresta|Desert|Deserto|Plains|Pianura)(:|$)/.test(String(args[0]))) {
      window.__drawnProductText.push(String(args[0])); window.__drawnProductText = window.__drawnProductText.slice(-200);
    }
    return original.apply(this, args);
  };
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', error => result.pageErrors.push(error.message));
await setSmokeLanguage(page);
const evidenceRoot = process.env.SIMAGENTS_EVIDENCE_ROOT ?? '.tmp';
const prefix = `${evidenceRoot}/public-ui/${browserName}-${width}-${smokeLanguage}-${zoom}x`;
await mkdir(`${evidenceRoot}/public-ui`, { recursive: true });
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
async function audit(surface) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width) result.failures.push(`${surface}: page horizontal overflow (${dimensions.scrollWidth}/${dimensions.width})`);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const violations = report.violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  await writeFile(`${prefix}-${surface}-axe.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${prefix}-${surface}.png` });
  result.surfaces.push({ surface, dimensions, violations });
  if (violations.length) result.failures.push(`${surface}: ${violations.map(item => item.id).join(', ')}`);
}
async function back() { await activate(page.getByRole('button', { name: productText('Back to City'), exact: true })); }
async function exported() {
  const pending = page.waitForEvent('download'); await openTool(page, 'Export current world');
  return JSON.parse(await (await pending).createReadStream().then(async stream => { let raw = ''; for await (const chunk of stream) raw += chunk; return raw; }));
}
try {
  await page.goto(base);
  const candidateResponse = await context.request.get(new URL('candidate.json', base).href);
  assert(candidateResponse.ok(), 'Served candidate manifest is missing');
  result.candidate = await candidateResponse.json();
  assert(typeof result.candidate.id === 'string', 'Served candidate manifest is invalid');
  assert(await page.evaluate(() => window.__simagentsEngineClient === undefined), 'Public build has a development bridge');
  if (native) result.nativeZoom = await native.zoom(page, zoom);
  await audit('ready');
  await activate(page.getByRole('button', { name: productText('Set up a simulation'), exact: true })); await audit('onboarding'); await page.keyboard.press('Escape');
  await openTool(page, 'Configuration');
  await page.getByLabel(productText('Claude (Anthropic) API key'), { exact: true }).fill('synthetic-public-ui-key');
  await activate(page.getByRole('button', { name: productText('Use Keys for This Session'), exact: true }));
  await page.getByText(productText('User Key'), { exact: true }).waitFor();
  await activate(page.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }));
  await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  await audit('configuration'); await page.keyboard.press('Escape');
  await activate(page.getByRole('button', { name: productText('Start'), exact: true }).first());
  await page.getByLabel(productText('Requests'), { exact: true }).fill('2');
  const capture = page.getByRole('checkbox', { name: productText('Capture actual requests for this session'), exact: true });
  if (keyboardOnly) { if (!(await capture.isChecked())) await capture.press('Space'); assert(await capture.isChecked(), 'Keyboard capture consent failed'); } else await capture.check();
  await audit('start-review');
  await activate(page.getByRole('button', { name: productText('Start'), exact: true }).last());
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().waitFor();
  await activate(page.getByRole('button', { name: productText('Pause'), exact: true }).first());
  await page.getByRole('button', { name: productText('Resume'), exact: true }).first().waitFor();
  await audit('paused');
  const beforeLanguage = await exported();
  const changedLanguage = smokeLanguage === 'en' ? 'it' : 'en';
  const expected = (changedLanguage === 'it' ? it : en).Agents + ':';
  await activate(page.locator('.simulation-tools:visible > summary'));
  await page.evaluate(() => { window.__drawnProductText = []; });
  await page.locator('.language-selector:visible select').selectOption(changedLanguage);
  await page.waitForFunction(label => window.__drawnProductText.some(value => value.startsWith(label)), expected);
  assert(await page.evaluate(() => document.documentElement.lang) === changedLanguage, 'Interface language did not update document language');
  await page.locator('.language-selector:visible select').selectOption(smokeLanguage); await page.keyboard.press('Escape');
  const afterLanguage = await exported();
  assert(JSON.stringify(beforeLanguage.snapshot) === JSON.stringify(afterLanguage.snapshot), 'Changing language modified the world, RNG or experiment settings');
  result.canvasLanguageRedraw = true;

  const cssWidth = await page.evaluate(() => innerWidth);
  if (cssWidth >= 1024) {
    const panels = [['Agents panel', 'Move agents panel'], ['Decisions panel', 'Move decisions panel']];
    for (const [label, moveLabel] of panels) {
      const panel = page.getByLabel(productText(label), { exact: true });
      const handle = panel.getByRole('button', { name: productText(moveLabel), exact: true });
      const before = await panel.boundingBox(); await handle.focus(); await page.keyboard.press('ArrowRight');
      const after = await panel.boundingBox(); assert(after.x > before.x || Math.abs(after.x + after.width - cssWidth + 8) < 1, 'Panel cannot move from keyboard');
      await page.keyboard.press('Home');
      await activate(handle);
      const clickBefore = await panel.boundingBox();
      await activate(panel.getByRole('button', { name: productText('Move right'), exact: true }));
      const clickAfter = await panel.boundingBox();
      assert(clickAfter.x > clickBefore.x, 'Panel cannot move without dragging');
      await activate(panel.getByRole('button', { name: productText('Reset panel layout'), exact: true }));
      await page.keyboard.press('Escape');
      const bounds = await panel.boundingBox(); const header = await page.locator('.simulation-header:visible').boundingBox();
      assert(bounds.y >= header.y + header.height, 'Panel overlaps the essential header');
    }
    const details = page.getByRole('button', { name: productText('Agent details for {agent}', { agent: 'Agent 1' }), exact: true });
    await details.focus(); await page.keyboard.press('Enter'); assert(await details.getAttribute('aria-expanded') === 'true', 'Agent details did not expand from keyboard');
    const resize = page.getByRole('button', { name: productText('Resize decisions panel'), exact: true });
    const decisionPanel = page.getByLabel(productText('Decisions panel'), { exact: true });
    const before = await decisionPanel.boundingBox(); await resize.focus(); await page.keyboard.press('ArrowRight');
    const after = await decisionPanel.boundingBox(); assert(after.width > before.width, 'Panel cannot resize from keyboard');
    await page.keyboard.press('Home');
    await activate(resize);
    const clickSize = await decisionPanel.boundingBox();
    await activate(decisionPanel.getByRole('button', { name: productText('Increase width'), exact: true }));
    assert((await decisionPanel.boundingBox()).width > clickSize.width, 'Panel cannot resize without dragging');
    await audit('panel-adjustments');
    await activate(decisionPanel.getByRole('button', { name: productText('Reset panel layout'), exact: true }));
    await page.keyboard.press('Escape');
  } else {
    const nav = page.locator('nav').filter({ has: page.getByRole('button', { name: productText('Map'), exact: true }) });
    await activate(nav.getByRole('button', { name: new RegExp(productText('Agents')) })); await audit('agents');
    await activate(page.getByRole('button').filter({ hasText: 'Agent 1' }).first()); await audit('agent-profile');
    await activate(nav.getByRole('button', { name: productText('Resources'), exact: true })); await audit('resources');
    await activate(page.locator('.entity-row').first()); await audit('resource-profile');
    await activate(nav.getByRole('button', { name: new RegExp(productText('Events')) })); await audit('events');
    await activate(nav.getByRole('button', { name: productText('Decisions'), exact: true })); await audit('decisions');
    await activate(nav.getByRole('button', { name: productText('Map'), exact: true }));
  }
  for (const title of ['2D Grid View', 'Isometric View']) {
    await activate(page.locator('.simulation-tools:visible > summary'));
    await activate(page.getByTitle(productText(title)).filter({ visible: true }).first()); await page.keyboard.press('Escape');
    const canvas = page.getByRole('img', { name: productText('Interactive world map') }).first();
    await activate(page.getByRole('button', { name: productText('Move map view'), exact: true }).filter({ visible: true }).first());
    const before = Number(await canvas.getAttribute('data-camera-x'));
    const group = page.getByRole('group', { name: productText('Move map view'), exact: true });
    await activate(group.getByRole('button', { name: productText('Move right'), exact: true }));
    assert(Number(await canvas.getAttribute('data-camera-x')) < before, 'Map cannot pan without dragging');
    await audit(title === 'Isometric View' ? 'isometric-pan-controls' : 'grid-pan-controls');
    await activate(group.getByRole('button', { name: productText('Close'), exact: true }));
  }
  await activate(page.getByRole('button', { name: productText('Resume'), exact: true }).first());
  await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
  assert(calls === 3, `Expected one probe and two decisions, saw ${calls}`); await audit('budget-error');
  const saved = await exported();
  const unchanged = JSON.stringify(saved.snapshot);
  await openTool(page, 'Import saved world');
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
  const afterInvalid = await exported(); assert(JSON.stringify(afterInvalid.snapshot) === unchanged, 'Invalid import changed the world');
  // Review and dismiss the persistent import notification before inspecting
  // other pages, just as the public recovery flow requires.
  const importAlert = page.getByRole('alert').filter({ has: page.getByRole('button', { name: productText('Close'), exact: true }) });
  await activate(importAlert.getByRole('button', { name: productText('Close'), exact: true }));
  for (const [tool, heading] of [['Analytics', 'Analytics Dashboard'], ['Puzzle Games', 'Puzzle Games'], ['Prompt Gallery', 'Prompt Gallery']]) {
    await openTool(page, tool);
    await page.getByRole('heading', { name: productText(heading), exact: true }).first().waitFor(); await audit(tool.toLowerCase().replaceAll(' ', '-'));
    if (tool === 'Prompt Gallery') {
      await activate(page.getByRole('button', { name: productText('Live Inspector'), exact: true }));
      await audit('inspector');
    }
    await back();
  }
  await openTool(page, 'Replay');
  await page.getByRole('note').filter({ hasText: productText('Saved replay:') }).waitFor(); await audit('replay');
  await activate(page.getByRole('button', { name: productText('Exit Replay'), exact: true }));
  assert(calls === 3, 'Reading public surfaces or importing invalid data issued inference');
  result.providerCalls = calls; result.status = result.failures.length || result.pageErrors.length ? 'failed' : 'passed';
} catch (error) { result.failures.push(error.message); result.status = 'failed'; await page.screenshot({ path: `${prefix}-failure.png` }); }
finally {
  await context.tracing.stop(result.status === 'failed' ? { path: `${prefix}-failure-trace.zip` } : {});
  await writeFile(`${prefix}-report.json`, JSON.stringify(result, null, 2));
  if (native) await native.close(); else { await context.close(); await browser.close(); }
}
console.log(JSON.stringify({ status: result.status, browserName, width, zoom, language: smokeLanguage, surfaces: result.surfaces.length, failures: result.failures, pageErrors: result.pageErrors }, null, 2));
if (result.status !== 'passed') process.exitCode = 1;
