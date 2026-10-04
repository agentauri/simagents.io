import { useSyncExternalStore } from 'react';
import { en, it, type TranslationKey } from './catalog';
export type Locale = 'en' | 'it';
export const LOCALE_STORAGE_KEY = 'simagents_locale_v1';
const listeners = new Set<() => void>();
function initialLocale(): Locale {
  try { return localStorage.getItem(LOCALE_STORAGE_KEY) === 'it' ? 'it' : 'en'; }
  catch { return 'en'; }
}
let locale = initialLocale();
function documentLanguage() { if (typeof document !== 'undefined') document.documentElement.lang = locale; }
documentLanguage();
export const getLocale = (): Locale => locale;
export function setLocale(next: Locale): void {
  if (next !== 'en' && next !== 'it') throw new Error('Unsupported interface language');
  try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* The tab still changes language. */ }
  if (locale === next) { documentLanguage(); return; }
  locale = next; documentLanguage();
  for (const listener of listeners) listener();
}
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== LOCALE_STORAGE_KEY) return;
  const next = event.newValue === 'it' ? 'it' : 'en';
  if (locale === next) return;
  locale = next; documentLanguage(); for (const listener of listeners) listener();
});
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useLocale = () => useSyncExternalStore(subscribe, getLocale, () => 'en' as Locale);
export function translate(key: TranslationKey, parameters: Record<string, string | number> = {}): string {
  return (locale === 'it' ? it[key] : en[key]).replace(/\{(\w+)\}/g, (_match, name: string) => String(parameters[name] ?? `{${name}}`));
}
export type { TranslationKey };

/** Only caller-selected product vocabulary is localized; never call this on user/model text. */
export function translateLabel(value: string): string {
  return Object.prototype.hasOwnProperty.call(en, value) ? translate(value as TranslationKey) : value;
}
export function formatActionLabel(value: string): string {
  const label = value.replace(/_/g, ' ');
  return translateLabel(label.charAt(0).toUpperCase() + label.slice(1));
}
