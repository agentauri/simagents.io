import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
/** Uses the pinned Firefox/WebKit native full-page zoom commands and native DPR.
 * Private Playwright transport is test-only and fails closed if its shape changes.
 * Sources: microsoft/playwright browser_patches/firefox/juggler/TargetRegistry.js
 * and browser_patches/webkit/patches/bootstrap.diff.
 */
async function protocolZoomContext(playwright, viewport, browserName) {
  const browser = await playwright[browserName].launch({ headless: true });
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  return {
    context,
    async zoom(page, factor) {
      const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const delegate = playwright._connection?.toImpl?.(page)?.delegate;
      const session = browserName === 'firefox' ? delegate?._session : delegate?._browserContext?._browser?._browserSession;
      if (!session) throw new Error('Pinned native zoom transport is unavailable');
      const setZoom = value => browserName === 'firefox'
        ? session.send('Page.setZoom', { zoom: value })
        : session.send('Playwright.setPageZoomFactor', { pageProxyId: delegate._pageProxySession.sessionId, zoomFactor: value });
      await setZoom(factor);
      await page.waitForFunction(({ width, factor }) => Math.abs(innerWidth - width / factor) <= 1, { width: before.width, factor });
      const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, cssZoom: getComputedStyle(document.documentElement).zoom, visualScale: visualViewport.scale }));
      if (after.cssZoom !== '1' || after.visualScale !== 1 || Math.abs(after.height - before.height / factor) > 1 || Math.abs(after.dpr - before.dpr * factor) > 0.01) throw new Error('Native protocol zoom evidence is inconsistent');
      await setZoom(1);
      await page.waitForFunction(width => innerWidth === width, before.width);
      const restored = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      if (restored.height !== before.height || restored.dpr !== before.dpr) throw new Error('Native zoom restoration failed');
      await setZoom(factor);
      await page.waitForFunction(({ width, factor }) => Math.abs(innerWidth - width / factor) <= 1, { width: before.width, factor });
      return { method: browserName === 'firefox' ? 'Firefox Juggler Page.setZoom / browsingContext.fullZoom' : 'WebKit Playwright.setPageZoomFactor / WebPageProxy native zoom', factor, before, after, restored, interaction: browserName === 'firefox' ? 'Native keyboard activation; Firefox pointer automation under zoom is a separate unresolved harness limitation.' : 'Native pointer and keyboard input' };
    },
    async close() { await browser.close(); },
  };
}
/** Native tab zoom through an isolated Chromium extension; never touches the user's browser. */
export async function nativeZoomContext(playwright, viewport, browserName = 'chromium') {
  if (['firefox', 'webkit'].includes(browserName)) return protocolZoomContext(playwright, viewport, browserName);
  if (browserName !== 'chromium') throw new Error('Native zoom is unsupported for this browser');
  const profile = await mkdtemp(join(tmpdir(), 'simagents-zoom-'));
  const extension = resolve('scripts/fixtures/native-zoom');
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, viewport,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    return {
      context,
      async zoom(page, factor) {
        const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
        const actual = await worker.evaluate(async ({ url, factor }) => {
          const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
          if (!tab?.id) throw new Error('Native zoom test tab is missing');
          await chrome.tabs.setZoomSettings(tab.id, { mode: 'automatic', scope: 'per-tab' });
          await chrome.tabs.setZoom(tab.id, factor);
          return chrome.tabs.getZoom(tab.id);
        }, { url: page.url(), factor });
        await page.waitForFunction(({ width, factor }) => Math.abs(innerWidth - width / factor) <= 1, { width: before.width, factor });
        const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, cssZoom: getComputedStyle(document.documentElement).zoom }));
        if (actual !== factor || after.cssZoom !== '1' || Math.abs(after.dpr - before.dpr * factor) > 0.01) throw new Error('Native zoom evidence is inconsistent');
        return { method: 'chrome.tabs.setZoom/getZoom', factor: actual, before, after };
      },
      async close() { try { await context.close(); } finally { await rm(profile, { recursive: true, force: true }); } },
    };
  } catch (error) { if (context) await context.close(); await rm(profile, { recursive: true, force: true }); throw error; }
}
