import { admissionConfig, relaySession, useRelaySession } from '../services/relay-access';
import { errorIssue, type AppIssue } from '@simagents/shared';
import { formatIssue } from '../i18n/errors';
import { useEffect, useRef, useState } from 'react';
import { useAppMode, useEditorStore } from '../stores/editor';
import { useSettingsStore, useSoundEnabled } from '../stores/settings';
import { useSessionLimitsStore } from '../stores/sessionLimits';
import { getEngineClient } from '../engine-host/engine-client';
import { ModeControls, ViewToggle } from './Controls';
import { SocialGraphButton } from './SocialGraph';
import { WorldStats } from './WorldStats';
import { LanguageSelector } from './LanguageSelector';
import { translate, useLocale } from '../i18n';
import type { ConnectionStatus } from '../hooks/useEngine';
interface Props {
  status: ConnectionStatus;
  errorMessage?: string;
  mutationPending?: boolean;
  onStart: (resume?: boolean) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onReset: () => void;
  onImport: () => void;
  onExport: () => void;
  onConfigure: () => void;
  onReplay: () => void;
}
export function SimulationHeader(props: Props) {
  useLocale();
  const relayState = useRelaySession();
  const relayConfig = admissionConfig();
  const activeRelay = !!relayConfig && getEngineClient().usesRelay(relayConfig.relayUrl);
  const mode = useAppMode();
  const usage = useSessionLimitsStore(state => state.usage);
  const sound = useSoundEnabled(), toggleSound = useSettingsStore(state => state.toggleSound);
  const setMode = useEditorStore(state => state.setMode);
  const menu = useRef<HTMLDetailsElement>(null);
  const [speed, setSpeed] = useState(10), [error, setError] = useState<AppIssue>();
  useEffect(() => {
    const measure = () => {
      const header = [...document.querySelectorAll<HTMLElement>('.simulation-header')].find(el => el.getClientRects().length > 0);
      if (header) document.documentElement.style.setProperty('--simulation-header-bottom', `${header.getBoundingClientRect().bottom}px`);
    };
    const observer = new ResizeObserver(measure);
    document.querySelectorAll('.simulation-header').forEach(header => observer.observe(header));
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => getEngineClient().onState(state => { if (state.speed !== undefined) setSpeed(state.speed); }), []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    // Safari does not focus buttons on pointer activation. Escape must still close
    // the drawer after choosing a map view or changing another inline setting.
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        event.preventDefault();
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  const closeMenu = () => { if (menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
  const action = (run: () => void) => () => { closeMenu(); run(); };
  const changeSpeed = async (next: number) => {
    setError(undefined);
    try { await getEngineClient().setSpeed(next); setSpeed(next); }
    catch (cause) { setError(errorIssue(cause)); }
  };
  return <div className="simulation-header">
    <div className="simulation-header-primary">
      <span className="simulation-brand">{translate("SimAgents")}{" "}<small>{translate("Beta")}</small></span>
      <ModeControls mutationPending={props.mutationPending} stoppedByError={!!props.errorMessage} onStartSimulation={props.onStart} onPause={props.onPause} onResume={props.onResume} onReset={props.onReset} onOpenConfig={props.onConfigure} />
      <details ref={menu} className="simulation-tools" onKeyDown={event => { if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); closeMenu(); } }}>
        <summary title={translate('Open tools')}>{translate('Tools')}</summary>
        <nav aria-label={translate('Simulation tools')} className="simulation-tools-content">
          {mode !== 'editor' && mode !== 'simulation' && <button onClick={action(() => setMode(props.status === 'connected' ? 'simulation' : 'editor'))}>{translate('Back to City')}</button>}
          <button disabled={props.mutationPending} title={translate('Configuration')} onClick={action(props.onConfigure)}>{translate('Configuration')}</button>
          <button disabled={props.mutationPending} title={translate('Import saved world')} onClick={action(props.onImport)}>{translate('Import saved world')}</button>
          {props.status === 'connected' && <button title={translate('Export current world')} onClick={action(props.onExport)}>{translate('Export current world')}</button>}
          <button title={translate('Time Travel Replay')} onClick={action(props.onReplay)}>{translate('Replay')}</button>
          <button onClick={action(() => setMode('analytics'))}>{translate('Analytics')}</button>
          <button title={translate('Prompt Gallery')} onClick={action(() => setMode('prompts'))}>{translate('Prompt Gallery')}</button>
          <button title={translate('Puzzle Games')} onClick={action(() => setMode('puzzles'))}>{translate('Puzzle Games')}</button>
          {admissionConfig() && <button onClick={action(() => { void relaySession.start(); })}>{translate("Get relay access")}</button>}
          <div className="simulation-tool-choice"><ViewToggle /></div>
          {props.mutationPending && <p role="status">{translate("Importing world…")}</p>}
    {props.status === 'connected' && <div className="simulation-tool-choice" onClick={closeMenu}><span>{translate('Social Graph')}</span><SocialGraphButton /></div>}
          <button onClick={toggleSound} aria-pressed={sound}>{translate(sound ? 'Sound enabled' : 'Sound disabled')}</button>
          {props.status === 'connected' && <button disabled={props.mutationPending} onClick={action(() => { if (confirm(translate('Reset simulation? This clears the saved world and all replay/prompt archives on this device. Export data first.'))) props.onReset(); })}>{translate('Reset')}</button>}
          {props.status === 'connected' && <div className="compact-world-stats"><WorldStats connectionStatus={props.status} /></div>}
          <LanguageSelector />
        </nav>
      </details>
    </div>
    {props.status === 'connected' && <div className="simulation-header-secondary">
      <WorldStats connectionStatus={props.status} />
      <label className="simulation-speed">{translate('Speed')}
        <select aria-label={translate('Simulation speed')} value={speed} onChange={event => void changeSpeed(Number(event.target.value))}>
          {[...new Set([1, 2, 4, 5, 10, 20, 50, speed])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      {activeRelay && <span className="simulation-usage" data-relay-status={relayState.status} role="status">{translate(relayState.status === 'ready' ? 'Relay ready' : relayState.status === 'checking' ? 'Relay renewing…' : relayState.status === 'interaction-required' ? 'Relay verification required' : relayState.status === 'expired' ? 'Relay expired' : 'Relay unavailable')}</span>}
      {usage && <span className="simulation-usage" title={translate('Local attempted-request counter; not a guaranteed billing cap')}>{usage.requests}/{usage.limits.maxRequests} {translate('Requests')}</span>}
    </div>}
    {error && <p role="alert">{formatIssue(error)}</p>}
  </div>;
}
