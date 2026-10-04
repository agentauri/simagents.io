import { admissionConfig, relaySession, useRelaySession } from '../../services/relay-access';
import { getEngineClient } from '../../engine-host/engine-client';
import { useState } from 'react';
import { useAppMode, useIsPaused } from '../../stores/editor';
import { StartConfirmationModal } from './StartConfirmationModal';
import { translate, useLocale } from '../../i18n';
interface ModeControlsProps {
  stoppedByError?: boolean;
  mutationPending?: boolean;
  onStartSimulation: (resumeSavedWorld?: boolean) => Promise<void>;
  onReset: () => void;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
  onOpenConfig?: () => void;
}
export function ModeControls({ onStartSimulation, onPause, onResume, onOpenConfig, stoppedByError, mutationPending }: ModeControlsProps) {
  useLocale();
  useRelaySession();
  const relayConfig = admissionConfig();
  const relayBlocked = !!relayConfig && getEngineClient().usesRelay(relayConfig.relayUrl) && !relaySession.getToken();
  const mode = useAppMode(), paused = useIsPaused();
  const [loading, setLoading] = useState(false), [showStart, setShowStart] = useState(false);
  const [error, setError] = useState<string>();
  const confirmStart = async (choice: 'resume' | 'new') => {
    setLoading(true); setError(undefined);
    try { await onStartSimulation(choice === 'resume'); setShowStart(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  const toggle = async () => {
    setLoading(true); setError(undefined);
    try { if (paused) await onResume?.(); else await onPause?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  return <div className="session-controls" aria-label={translate('Simulation controls')}>
    <span className="session-state">{translate(mode === 'editor' ? 'Ready' : stoppedByError ? 'Error' : paused ? 'Paused' : 'Running')}</span>
    <button className="session-primary" type="button" disabled={loading || (paused && relayBlocked) || (mode === 'editor' && mutationPending)} title={relayBlocked ? translate("Get relay access before resuming.") : undefined} onClick={mode === 'editor' ? () => setShowStart(true) : toggle}>
      {translate(loading ? 'Starting…' : mode === 'editor' ? 'Start' : paused ? 'Resume' : 'Pause')}
    </button>
    {stoppedByError && mode !== 'editor' && <button type="button" className="session-new" disabled={loading || mutationPending} onClick={() => setShowStart(true)}>{translate("New session")}</button>}
    {error && <span role="alert">{error}</span>}
    <StartConfirmationModal isOpen={showStart} onConfirm={confirmStart} onCancel={() => setShowStart(false)} onOpenConfig={() => { setShowStart(false); onOpenConfig?.(); }} isLoading={loading} />
  </div>;
}
