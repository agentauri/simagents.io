import { setLocale, translate, useLocale, type Locale } from '../i18n';
export function LanguageSelector() {
  useLocale();
  const locale = useLocale();
  return <label className="language-selector">{translate('Language')}
    <select aria-label={translate('Language')} value={locale} onChange={event => setLocale(event.target.value as Locale)}>
      <option value="en">{translate("English")}</option><option value="it">{translate("Italiano")}</option>
    </select>
  </label>;
}
