import { publishedPrice } from '@simagents/shared';
import { useRelaySession } from '../../services/relay-access';
import { translateLabel, useLocale, translate } from '../../i18n';
import { errorIssue, type AppIssue } from '@simagents/shared';
import { formatIssue, formatError } from '../../i18n/errors';


import { useState } from 'react';
import { defaultCapabilities, type AgentRosterEntry, type ModelCapabilities, type LLMType } from '@simagents/shared';
import { useConnectionsStore } from '../../stores/connections';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useSessionLimitsStore } from '../../stores/sessionLimits';
import { useConnectionVerificationStore } from '../../stores/connectionVerification';
import { listConnectionModels } from '../../services/connection-models';
import { verifyConnection, verificationSignature } from '../../services/connection-verification';
export function AgentConnectionConfig({ entry, update }: { entry: AgentRosterEntry; update: (patch: Partial<AgentRosterEntry>) => void }) {
  useLocale();
  useRelaySession();
  const profiles = useConnectionsStore((s) => s.profiles);
  const keys = useApiKeysStore();
  const maxTokens = useSessionLimitsStore((s) => s.limits.maxOutputTokens);
  const receipts = useConnectionVerificationStore();
  const [models, setModels] = useState<string[]>([]);
  const [listingError, setListingError] = useState<AppIssue>();
  const [busy, setBusy] = useState(false);
  const profile = profiles.find((p) => p.id === entry.connectionId);
  const caps = entry.capabilities ?? (profile ? defaultCapabilities(profile.providerId, entry.modelId, profile.protocol) : undefined);
  const signature = profile ? verificationSignature(profile, entry.modelId, caps, entry.reasoningLevel, maxTokens, keys.credentialRevision) : '';
  const result = receipts.results[signature];
  const price = profile ? publishedPrice({ providerId: profile.providerId, modelId: entry.modelId, endpoint: profile.endpoint }) : undefined;
  const input = 'w-full rounded border border-gray-600 bg-gray-900 p-2 text-xs text-white';
  const changeCaps = (patch: Partial<ModelCapabilities>) => { if (caps) update({ capabilities: { ...caps, ...patch } }); };
  async function verify() {
    if (!profile || !caps) return;
    setBusy(true);
    try { await verifyConnection(profile, entry.modelId, keys.getActiveKeys()[profile.credentialRef] ?? '', caps, entry.reasoningLevel, maxTokens, profile.relayCredentialRef ? keys.getActiveKeys()[profile.relayCredentialRef] : undefined); receipts.record(signature, 'verified'); }
    catch (error) { receipts.record(signature, 'unavailable', undefined, errorIssue(error)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 border-t border-gray-700 pt-2">
    <label className="block text-xs text-gray-300">{translate("Connection")}<select aria-label={translate("Connection for {agent}", { agent: entry.name })} className={input} value={entry.connectionId ?? ''} onChange={(e) => {
      const selected = profiles.find((p) => p.id === e.target.value);
      update({ connectionId: selected?.id ?? '', provider: (selected?.providerId ?? entry.provider) as LLMType, modelId: entry.modelId, capabilities: undefined, reasoningLevel: undefined });
    }}><option value="">{translate("Select a connection")}</option>{profiles.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    {profile && caps && <>
      <p className="text-xs text-gray-400 break-all">{profile.protocol} · {profile.transport === 'direct' ? profile.endpoint : translate("Via {relay} → {endpoint}", { relay: profile.relayUrl ?? translate("(not configured)"), endpoint: profile.endpoint })}</p>
      <button type="button" className="rounded border border-gray-600 px-3 py-2 text-xs text-white disabled:opacity-60" disabled={busy} onClick={() => { setBusy(true); setModels([]); setListingError(undefined); void listConnectionModels(profile, keys.getActiveKeys()[profile.credentialRef] ?? '', profile.relayCredentialRef ? keys.getActiveKeys()[profile.relayCredentialRef] : undefined).then(setModels).catch((e) => setListingError(errorIssue(e))).finally(() => setBusy(false)); }}>{translate("Load model IDs (first page)")}</button>
      {models.length > 0 && <label className="block text-xs text-gray-300">{translate("Listed models (not verified)")}<select className={input} value="" onChange={(e) => update({ modelId: e.target.value, reasoningLevel: undefined })}><option value="">{translate("Select a listed model")}</option>{models.map((id) => <option key={id}>{id}</option>)}</select></label>}
      {listingError && <p role="alert" className="text-xs text-red-300">{formatError(listingError)}</p>}
      <p className="text-xs text-gray-300">{translate('Published rates')}: {price ? `${price.currency} ${price.inputPerMillion}/${price.outputPerMillion} ${translate('per million input/output tokens')} · ${price.retrievedAt}` : translate('Not available')}</p>
      {price && <a className="min-h-11 inline-flex items-center text-xs underline" href={price.source} target="_blank" rel="noopener noreferrer">{translate('Published price source')}</a>}
      {price && <details><summary>{translate('Price source and conditions')}</summary>{price.conditions.map(condition => <p key={condition} className="text-xs text-gray-300">{translateLabel(condition)}</p>)}</details>}
      <p role="status" className="text-xs text-gray-200">{result?.status === 'verified' ? translate("Verified in this tab") : result?.status === 'unavailable' ? translate("Unavailable") : translate("Compatible protocol, model not verified")}</p>
      <details><summary className="cursor-pointer text-xs text-gray-300">{translate("Model capabilities (check provider documentation)")}</summary><div className="space-y-2 pt-2">
        <label className="block text-xs text-gray-300">{translate("Output")}<select aria-label={translate("Output format for {agent}", { agent: entry.name })} className={input} value={caps.output} onChange={(e) => changeCaps({ output: e.target.value as ModelCapabilities['output'] })}><option value="text-json">{translate("Validated text JSON")}</option><option value="json-object">{translate("JSON object mode")}</option><option value="json-schema">{translate("Structured JSON schema")}</option></select></label>
        <label className="block text-xs text-gray-300"><input type="checkbox" checked={caps.temperature} onChange={(e) => changeCaps({ temperature: e.target.checked })} />{" "}{translate("Accepts temperature")}</label>
        <label className="block text-xs text-gray-300">{translate("Reasoning parameter")}<select className={input} value={caps.reasoning} onChange={(e) => update({ capabilities: { ...caps, reasoning: e.target.value as ModelCapabilities['reasoning'] }, reasoningLevel: undefined })}>
          {['none', 'effort', 'budget', 'gemini-level', 'thinking-toggle', 'enable-thinking'].map((v) => <option key={v} value={v}>{translateLabel(v)}</option>)}
        </select></label>
        {caps.reasoning === 'budget' && <label className="block text-xs text-gray-300">{translate("Thinking budget")}<input aria-label={translate("Reasoning value for {agent}", { agent: entry.name })} type="number" min={0} className={input} value={typeof entry.reasoningLevel === 'number' ? entry.reasoningLevel : ''} placeholder={translate("Provider default")} onChange={(e) => update({ reasoningLevel: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>}
        {['effort', 'gemini-level'].includes(caps.reasoning) && <label className="block text-xs text-gray-300">{translate("Reasoning level")}<select aria-label={translate("Reasoning value for {agent}", { agent: entry.name })} className={input} value={typeof entry.reasoningLevel === 'string' ? entry.reasoningLevel : ''} onChange={(e) => update({ reasoningLevel: e.target.value || undefined })}><option value="">{translate("Provider default")}</option>{(caps.reasoning === 'gemini-level' ? ['minimal', 'low', 'medium', 'high'] : ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).map((value) => <option key={value} value={value}>{translateLabel(value)}</option>)}</select></label>}
        {['thinking-toggle', 'enable-thinking'].includes(caps.reasoning) && <label className="block text-xs text-gray-300">{translate("Reasoning switch")}<select aria-label={translate("Reasoning value for {agent}", { agent: entry.name })} className={input} value={entry.reasoningLevel === undefined ? '' : String(entry.reasoningLevel)} onChange={(e) => update({ reasoningLevel: e.target.value === '' ? undefined : e.target.value === 'true' })}><option value="">{translate("Provider default")}</option><option value="true">{translate("Enabled")}</option><option value="false">{translate("Disabled")}</option></select></label>}
        <label className="block text-xs text-gray-300">{translate("Model output-token ceiling")}<input className={input} type="number" min={32} max={1000000} value={caps.maxOutputTokens} onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value) && value >= 32 && value <= 1000000) changeCaps({ maxOutputTokens: value }); }} /></label>
        {profile.protocol === 'chat-completions' && <label className="block text-xs text-gray-300">{translate("Token parameter")}<select className={input} value={caps.tokenParameter} onChange={(e) => changeCaps({ tokenParameter: e.target.value as ModelCapabilities['tokenParameter'] })}><option>{translate("max_tokens")}</option><option>{translate("max_completion_tokens")}</option></select></label>}
      </div></details>
      <p className="text-xs text-gray-400">{translate("Verification sends one request using this model and your selected token limit (")}{maxTokens}{translate("); provider charges may apply. No world actions are executed.")}</p>
      <button type="button" disabled={busy || !keys.getActiveKeys()[profile.credentialRef]} className="rounded border border-gray-600 px-3 py-2 text-xs text-white disabled:opacity-60" onClick={() => void verify()}>{busy ? translate("Verifying…") : translate("Verify model for {agent} (1 request)", { agent: entry.name })}</button>
      {(result?.issue || result?.message) && <p role="alert" className="text-xs text-red-300">{result.issue ? formatIssue(result.issue) : formatError(result.message)}</p>}
    </>}
  </div>;
}
