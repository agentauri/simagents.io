import { afterEach, expect, test } from 'bun:test';
import { en, it } from '../i18n/catalog';
import { getLocale, setLocale, translate } from '../i18n';
import { formatIssue } from '../i18n/errors';
import { AppError, errorIssue, isAppIssue } from '@simagents/shared';
import { serializeWorld } from '@simagents/engine/engine/persistence';
import { initializeRNG } from '@simagents/engine/utils/random';
import { setCustomSystemPrompt } from '@simagents/engine/llm/prompt-manager';
const originalLocale = getLocale();
afterEach(() => setLocale(originalLocale));
test('every product key and parameter is available in both interface languages', () => {
  expect(Object.keys(it).sort()).toEqual(Object.keys(en).sort());
  for (const [key, value] of Object.entries(en)) {
    const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    expect(it[key as keyof typeof it].trim().length).toBeGreaterThan(0);
    expect(tokens(it[key as keyof typeof it])).toEqual(tokens(value));
  }
});
test('interface changes preserve world configuration, custom prompt text and RNG state', () => {
  initializeRNG('language-fixture');
  setCustomSystemPrompt('Original model language: never translate {my_data}.');
  const snapshot = () => serializeWorld({ worldSeed: 'language-fixture', savedAtSimTimeMs: 0, speed: 1 });
  const original = snapshot();
  setLocale('it');
  expect(translate('Start')).toBe('Avvia');
  expect(formatIssue({ code: 'BYOK_MODEL', parameters: { agent: 'Original Agent Name' } })).toBe('Original Agent Name: seleziona un modello.');
  expect(snapshot()).toEqual(original);
  setLocale('en');
  expect(snapshot()).toEqual(original);
});
test('unknown failures transport codes without leaking message text or stack', () => {
  const secret = 'synthetic-secret-and-private-prompt';
  expect(errorIssue(new Error(secret))).toEqual({ code: 'INTERNAL_ERROR' });
  expect(JSON.stringify(errorIssue(new Error(secret)))).not.toContain(secret);
  expect(errorIssue(new AppError({ code: 'REQUEST_LIMIT' }, secret))).toEqual({ code: 'REQUEST_LIMIT' });
  expect(isAppIssue({ code: 'UNKNOWN_CODE', parameters: {} })).toBe(false);
  expect(isAppIssue({ code: 'REQUEST_LIMIT', parameters: { invalid: NaN } })).toBe(false);
});
test('the same stored error code is rendered again after changing language', () => {
  const issue = { code: 'REQUEST_LIMIT' } as const;
  setLocale('en');
  expect(formatIssue(issue)).toContain('request budget is exhausted');
  setLocale('it');
  expect(formatIssue(issue)).toContain('budget di richieste è esaurito');
});
