import { en, it } from '../apps/web/src/i18n/catalog.ts';
export const smokeLanguage = process.env.SIMAGENTS_SMOKE_LANGUAGE === 'it' ? 'it' : 'en';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Test labels follow the real product catalog; synthetic data/model responses remain original. */
export function productText(key, parameters = {}) {
  const catalog = smokeLanguage === 'it' ? it : en;
  let value = catalog[key];
  if (value === undefined) {
    for (const candidate of Object.keys(en)) {
      if (!candidate.includes('{')) continue;
      const names = [...candidate.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
      const pattern = escape(en[candidate]).replace(/\\\{(\w+)\\\}/g, '(.+?)');
      const match = key.match(new RegExp(`^${pattern}$`));
      if (match) { value = catalog[candidate]; parameters = Object.fromEntries(names.map((name, index) => [name, match[index + 1]])); break; }
    }
  }
  return (value ?? key).replace(/\{(\w+)\}/g, (_match, name) => {
    const parameter = String(parameters[name] ?? `{${name}}`);
    return ['scenario', 'section', 'type'].includes(name) && Object.hasOwn(en, parameter) ? productText(parameter) : parameter;
  });
}
export async function setSmokeLanguage(page) {
  if (smokeLanguage !== 'en') await page.addInitScript(locale => localStorage.setItem('simagents_locale_v1', locale), smokeLanguage);
}
/** Open a public secondary tool through the visible header's keyboard-accessible drawer. */
export async function activateControl(locator, keyboardOnly = false) {
  if (keyboardOnly) {
    await locator.waitFor({ state: 'visible' });
    const deadline = Date.now() + 20000;
    while (!(await locator.isEnabled())) {
      if (Date.now() >= deadline) throw new Error('Keyboard control remained disabled');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await locator.press('Enter');
  } else await locator.click();
}
export async function openSimulationTool(page, name, keyboardOnly = false) {
  const drawer = page.locator('.simulation-tools:visible');
  const button = drawer.getByRole('button', { name: productText(name), exact: true });
  if (!(await button.isVisible())) await activateControl(drawer.locator('summary'), keyboardOnly);
  await activateControl(button, keyboardOnly);
}
