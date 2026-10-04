import { useRelaySession } from '../../services/relay-access';
import { formatError } from '../../i18n/errors';
import { useLocale, translate, translateLabel } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultModelId, type LLMType } from '@simagents/shared';
import { ConnectionsConfig } from '../ConfigPanel/ConnectionsConfig';
import { AgentRosterConfig } from '../ConfigPanel/AgentRosterConfig';
import { SessionLimitsForm } from '../Controls/SessionLimitsForm';
import { StartConfirmationModal } from '../Controls/StartConfirmationModal';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useConnectionsStore } from '../../stores/connections';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useRosterStore } from '../../stores/roster';
import { useConfigStore } from '../../stores/config';
import { useEditorStore } from '../../stores/editor';
import { useSessionLimitsStore } from '../../stores/sessionLimits';
import { useConnectionVerificationStore } from '../../stores/connectionVerification';
import { useSettingsStore } from '../../stores/settings';
import { byokPreflight, internalFixturesEnabled } from '../../services/byok-preflight';
import { profileVerificationIssue } from '../../services/profile-verification-gate';
import { SCENARIOS } from '../../services/scenarios';

const STEPS = ['Connect a provider', 'Agents and models', 'Choose a scenario', 'Review limits'] as const;
export function SetupJourney({ onClose, onStart, onAdvanced }: { onClose: () => void; onStart: (resume?: boolean) => Promise<void>; onAdvanced: () => void }) {
  useLocale();
  useRelaySession();
  const [step, setStep] = useState(0), [review, setReview] = useState(false), [busy, setBusy] = useState(false);
  const [limitsValid, setLimitsValid] = useState(true);
  const [error, setError] = useState('');
  const profiles = useConnectionsStore(s => s.profiles);
  const keys = useApiKeysStore();
  const roster = useRosterStore(s => s.roster);
  const config = useConfigStore();
  const limits = useSessionLimitsStore(s => s.limits);
  const proxy = useSettingsStore(s => s.proxyUrl);
  useConnectionVerificationStore(s => s.results);
  const [connectionId, setConnectionId] = useState(roster[0]?.connectionId ?? profiles[0]?.id ?? '');
  const selected = profiles.find(profile => profile.id === connectionId);
  const dialog = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useDialogFocus(dialog, !review, close);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const activeKeys = keys.getActiveKeys();
  const issue = byokPreflight(roster, activeKeys, proxy, internalFixturesEnabled(), profiles) ?? profileVerificationIssue(roster, profiles);
  const connected = !!selected && !!activeKeys[selected.credentialRef] && (selected.transport !== 'official-relay' || !!activeKeys[selected.relayCredentialRef ?? '']);
  function useConnection() {
    if (!selected) return;
    const store = useRosterStore.getState();
    const patch = { provider: selected.providerId as LLMType, connectionId: selected.id, modelId: getDefaultModelId(selected.providerId as LLMType), capabilities: undefined, reasoningLevel: undefined };
    if (!store.roster.length) store.addEntry(patch);
    else if (store.roster[0].connectionId !== selected.id || store.roster[0].provider !== selected.providerId) store.updateEntry(0, patch);
    setStep(1);
  }
  const agent = { ...config.config?.agent, ...config.pendingChanges.agent };
  const needs = { ...config.config?.needs, ...config.pendingChanges.needs };
  if (review) return <StartConfirmationModal isOpen isLoading={busy} onCancel={() => setReview(false)} onOpenConfig={() => setReview(false)} onConfirm={async choice => {
    setBusy(true);
    try { await onStart(choice === 'resume'); if (useEditorStore.getState().mode === 'simulation') onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to start'); setReview(false); }
    finally { setBusy(false); }
  }} />;
  return <div className="setup-backdrop">
    <div className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title" tabIndex={-1} ref={dialog}>
      <header className="setup-header">
        <div><h1 id="setup-title">{translate("Set up your simulation")}</h1><p>{translate("Your world runs on this device. Your models make the decisions.")}</p></div>
        <button onClick={close} aria-label={translate("Close simulation setup")}>{translate("Close")}</button>
      </header>
      <nav aria-label={translate("Setup progress")}><ol className="setup-progress">{STEPS.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index + 1}</span>{translate(label)}</li>)}</ol></nav>
      <main className="setup-body">
        <h2 ref={heading} tabIndex={-1}>{translate(STEPS[step])}</h2>
        {step === 0 && <>
          <p>{translate("Bring your own API key (BYOK). Your provider charges for requests. The world is saved locally; prompts and responses travel through the connection you choose. Keys stay in memory unless you save them in the optional encrypted vault.")}</p>
          <ConnectionsConfig onSaved={profile => setConnectionId(profile.id)} />
          <label className="setup-field">{translate("Connection for your first agent")}<select value={connectionId} onChange={event => setConnectionId(event.target.value)}><option value="">{translate("Choose a connection")}</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          {selected && <p className="break-words" role="status">{connected ? translate("Credential available in this tab.") : translate("Edit this connection to enter its credential, or unlock your vault in advanced settings.")}{" "}{translate("Requests go")}{" "}{selected.transport === 'direct' ? translate("directly to {host}", { host: new URL(selected.endpoint).host }) : translate("through {relay}", { relay: selected.relayUrl ?? translate("(not configured)") })}.</p>}
        </>}
        {step === 1 && <>
          <p>{translate("Give each agent a connection and model. Verification sends one paid provider request when you click Verify. Nothing runs automatically. Add agents to observe interactions; each agent shares the session request budget.")}</p>
          <AgentRosterConfig />
          {issue && <p className="setup-notice" role="status">{issue}</p>}
        </>}
        {step === 2 && <>
          <p>{translate("Keep your current settings or apply starting conditions. Presets change only the values listed below and apply to a new world; resuming a saved world restores its own configuration.")}</p>
          <div className="setup-scenarios">{SCENARIOS.map(preset => <section key={preset.id}>
            <h3>{translateLabel(preset.name)}</h3><p>{translateLabel(preset.description)}</p><p>{translateLabel(preset.observe)}</p><details><summary>{translate("Settings changed")}</summary><p>{translateLabel(preset.changes)}</p></details>
            <button onClick={() => { config.updateAgent(preset.overrides.agent); config.updateNeeds(preset.overrides.needs); config.updateCooperation(preset.overrides.cooperation); }}>{translate("Apply")}{" "}{translateLabel(preset.name)}</button>
          </section>)}</div>
          <fieldset><legend>{translate("Starting values (editable)")}</legend><div className="setup-values">{(['startingBalance', 'startingHunger', 'startingEnergy', 'startingHealth'] as const).map((key,index) => <label className="setup-field" key={key}>{translateLabel(['Balance (CITY)', 'Hunger', 'Energy', 'Health'][index])}<input type="number" min={0} max={key === 'startingBalance' ? 1000000 : 100} value={agent[key] ?? 0} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= (key === 'startingBalance' ? 1000000 : 100)) config.updateAgent({ [key]: value }); }} /></label>)}</div>
          <p>{translate("Hunger decay:")}{" "}{needs.hungerDecay}{translate("; energy decay:")}{" "}{needs.energyDecay}{" "}{translate("per tick. All settings remain editable in advanced configuration.")}</p></fieldset>
        </>}
        {step === 3 && <>
          <p>{roster.length}{" "}{translate("agents share these limits. Time keeps advancing while models respond. Provider latency therefore affects the simulation.")}</p>
          <SessionLimitsForm onValidityChange={setLimitsValid} />
          <p>{translate("The local counter is a safety control, not a guaranteed provider billing cap. Connection verification is also billable and is separate from simulation usage.")}</p>
          {issue && <div className="setup-notice" role="status"><p>{issue}</p><button onClick={() => setStep(1)}>{translate("Return to model verification")}</button><p>{translate("Changing the response token limit requires verifying the model again.")}</p></div>}
          <p>{translate("Configured:")}{" "}{limits.maxRequests}{" "}{translate("requests,")}{" "}{Math.round(limits.maxDurationSeconds / 60)}{" "}{translate("minutes,")}{" "}{limits.maxOutputTokens}{" "}{translate("tokens per response.")}</p>
        </>}
        {error && <p role="alert">{formatError(error)}</p>}
      </main>
      <footer className="setup-footer"><p>{translate("Settings are saved as you go. Closing does not start a session.")}</p><div>
        <button onClick={onAdvanced}>{translate("Advanced settings")}</button>
        {step > 0 && <button onClick={() => setStep(step - 1)}>{translate("Back")}</button>}
        <button className="setup-primary" disabled={step === 0 ? !connected : step === 1 ? !!issue : step === 3 ? !!issue || !limitsValid : false} onClick={() => step === 0 ? useConnection() : step < 3 ? setStep(step + 1) : setReview(true)}>{step === 3 ? translate("Review and start") : translate("Continue")}</button>
      </div></footer>
    </div>
  </div>;
}
