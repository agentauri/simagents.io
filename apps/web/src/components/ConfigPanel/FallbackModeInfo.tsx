import { useLocale, translate } from '../../i18n';
/** Connection notice. Baselines are explicit test providers, never error fallbacks. */
export function FallbackModeInfo(_props: { isTestMode?: boolean }) {
  useLocale();
  return (
    <div className="mx-4 my-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
      <h3 className="font-medium text-yellow-200 text-sm">{translate("Provider connection required")}</h3>
      <p className="text-xs text-yellow-300/80 mt-1">{translate("Add an API key for each selected LLM provider. Missing credentials or connection errors pause the simulation; no model is substituted.")}</p>
    </div>
  );
}
export default FallbackModeInfo;
