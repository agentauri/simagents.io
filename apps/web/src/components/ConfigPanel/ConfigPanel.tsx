import { formatError } from '../../i18n/errors';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useLocale, translate } from '../../i18n';
/**
 * ConfigPanel Component
 *
 * Main configuration panel that displays all simulation parameters.
 * Organized into collapsible sections.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useConfigStore } from '../../stores/config';
import { useApiKeysStore, type LLMType } from '../../stores/apiKeys';
import { ConfigSection } from './ConfigSection';
import { ConfigInput } from './ConfigInput';
import { CredentialVaultControls } from './CredentialVaultControls';
import { ApiKeyInput } from './ApiKeyInput';
import { FallbackModeInfo } from './FallbackModeInfo';
import { PromptEditor } from './PromptEditor';
import { GenesisConfig } from './GenesisConfig';
import { PersonalityConfig } from './PersonalityConfig';
import { ConnectionsConfig } from './ConnectionsConfig';
import { AgentRosterConfig } from './AgentRosterConfig';
import { useSettingsStore } from '../../stores/settings';
import { isLocalEngineMode } from '../../utils/env';
import {
  getPersistenceInfo,
  exportUnsavedWorld,
  subscribePersistenceInfo,
  type PersistenceInfo,
} from '../../services/persistence';

interface ConfigPanelProps {
  onClose: () => void;
}

type ConfigSectionKey =
  | 'simulation'
  | 'agent'
  | 'needs'
  | 'experiment'
  | 'llmCache'
  | 'actions'
  | 'economy';

const LOCAL_DEFAULT_AGENT = {
  startingBalance: 50,
  startingHunger: 80,
  startingEnergy: 80,
  startingHealth: 100,
};

const LOCAL_DEFAULT_NEEDS = {
  hungerDecay: 0.6,
  energyDecay: 0.3,
  lowHungerThreshold: 20,
  criticalHungerThreshold: 10,
  lowEnergyThreshold: 20,
  criticalEnergyThreshold: 10,
  hungerEnergyDrain: 1,
  criticalHungerHealthDamage: 2,
  criticalEnergyHealthDamage: 1,
};

export function ConfigPanel({ onClose }: ConfigPanelProps) {
  useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, true, onClose);
  const isLocalMode = isLocalEngineMode();
  const {
    config,
    isLoading,
    error,
    pendingChanges,
    runtimeModifiable,
    fetchConfig,
    updateSimulation,
    updateAgent,
    updateNeeds,
    updateExperiment,
    updateLLMCache,
    updateActions,
    updateEconomy,
    applyChanges,
    resetConfig,
    discardChanges,
  } = useConfigStore();

  const {
    providers,
    status: keyStatus,
    pendingKeys,
    isLoading: keysLoading,
    error: keysError,
    fetchStatus: fetchKeyStatus,
    setPendingKey,
    applyKeys,
    clearKey,
    toggleDisabled,
    discardPendingKeys,
    hasPendingChanges: hasKeyChanges,
    hasAnyActiveKey,
  } = useApiKeysStore();
  const proxyUrl = useSettingsStore((state) => state.proxyUrl);
  const setProxyUrl = useSettingsStore((state) => state.setProxyUrl);

  // Use selector pattern for reactivity
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const pendingSections = Object.keys(pendingChanges);
  const localAppliedSections = pendingSections.filter(isLocalAppliedConfigSection);
  const localIgnoredSections = pendingSections.filter((section) => !isLocalAppliedConfigSection(section));

  const [applyResult, setApplyResult] = useState<{
    appliedImmediately: string[];
    requiresRestart: string[];
  } | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [persistenceInfo, setPersistenceInfo] = useState<PersistenceInfo>(getPersistenceInfo());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLocalMode) {
      fetchConfig();
    }
    fetchKeyStatus();
  }, [fetchConfig, fetchKeyStatus, isLocalMode]);

  useEffect(() => {
    if (!isLocalMode) return;
    return subscribePersistenceInfo(setPersistenceInfo);
  }, [isLocalMode]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Handle Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showResetConfirm) {
          setShowResetConfirm(false);
        } else {
          handleClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showResetConfirm, hasPendingChanges]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (!isLocalMode && hasPendingChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to close?'
      );
      if (!confirmed) return;
    }
    onClose();
  }, [hasPendingChanges, isLocalMode, onClose]);

  const isRuntimeModifiable = (path: string) => runtimeModifiable.includes(path);

  // Get effective value (pending or current)
  const getValue = <T,>(
    section: ConfigSectionKey,
    key: string,
    fallback: T
  ): T => {
    const pending = pendingChanges[section] as unknown as Record<string, unknown> | undefined;
    if (pending && key in pending) {
      return pending[key] as T;
    }
    if (!config) return fallback;
    const sectionData = config[section] as unknown as Record<string, unknown>;
    if (sectionData && key in sectionData) {
      return sectionData[key] as T;
    }
    return fallback;
  };

  const handleApply = async () => {
    try {
      const result = await applyChanges();
      setApplyResult(result);
      // Store timer ref for cleanup
      timerRef.current = setTimeout(() => setApplyResult(null), 5000);
    } catch {
      // Error is handled by store
    }
  };

  const handleReset = async () => {
    await resetConfig();
    setShowResetConfirm(false);
  };

  if (!isLocalMode && isLoading && !config) {
    return (
      <div className="fixed right-0 top-0 h-full w-full max-w-sm sm:max-w-md bg-gray-900 border-l border-gray-700 shadow-xl z-50">
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-400 flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>{translate("Loading configuration...")}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="config-panel-title"
      aria-modal="true"
      className="config-dialog fixed right-0 top-0 h-full w-full max-w-sm sm:max-w-md bg-gray-900 border-l border-gray-700 shadow-xl z-[210] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">⚙️</span>
          <h2 id="config-panel-title" className="font-semibold text-gray-100">{translate("Configuration")}{" "}{hasPendingChanges && (
              <span className="ml-2 text-xs font-normal text-yellow-400">
                {isLocalMode
                  ? localAppliedSections.length > 0
                    ? translate("(local overrides)")
                    : translate("(saved locally)")
                  : translate("(unsaved changes)")}
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={handleClose}
          aria-label={translate("Close configuration panel")}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div role="alert" className="px-4 py-2 bg-red-900/50 text-red-200 text-sm">
          {formatError(error)}
        </div>
      )}

      {/* Apply result message */}
      {applyResult && (
        <div className="px-4 py-2 bg-blue-900/50 text-blue-200 text-sm">
          {applyResult.appliedImmediately.length > 0 && (
            <div>{translate("⚡ Applied:")}{" "}{applyResult.appliedImmediately.join(', ')}</div>
          )}
          {applyResult.requiresRestart.length > 0 && (
            <div className="text-yellow-300">{translate("⚠️ Requires restart:")}{" "}{applyResult.requiresRestart.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <ConfigSection title={translate("Connections")} icon="🔌" defaultExpanded={false}><ConnectionsConfig /></ConfigSection>
        {/* LLM API Keys Section - Always visible */}
        <ConfigSection title={translate("LLM API Keys")} icon="🔑" defaultExpanded={true}>
          {/* Fallback mode warning */}
          {!hasAnyActiveKey() && (
            <FallbackModeInfo isTestMode={config?.simulation?.testMode} />
          )}

          {/* API Key inputs */}
          {providers.map((provider) => (
            <ApiKeyInput
              key={provider.type}
              provider={provider}
              status={keyStatus[provider.type as LLMType]}
              pendingKey={pendingKeys[provider.type as LLMType]}
              onKeyChange={(key) => setPendingKey(provider.type as LLMType, key)}
              onToggleDisabled={() => toggleDisabled(provider.type as LLMType)}
              onClear={() => clearKey(provider.type as LLMType)}
              isLoading={keysLoading}
            />
          ))}

          {/* Apply/Discard keys buttons */}
          {hasKeyChanges() && (
            <div className="px-4 py-3 border-t border-gray-700/50 flex gap-2">
              <button
                onClick={applyKeys}
                disabled={keysLoading}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {keysLoading ? translate("Applying...") : translate("Use Keys for This Session")}
              </button>
              <button
                onClick={discardPendingKeys}
                disabled={keysLoading}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >{translate("Discard")}</button>
            </div>
          )}

          {/* Keys error */}
          {keysError && (
            <div className="px-4 py-2 text-xs text-red-300 bg-red-900/30">
              {formatError(keysError)}
            </div>
          )}

          <CredentialVaultControls />

          <div className="px-4 py-3 border-t border-gray-700/50 space-y-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-300">{translate("Proxy URL")}</span>
              <input
                type="url"
                value={proxyUrl}
                onChange={(event) => setProxyUrl(event.target.value)}
                placeholder={translate("https://your-proxy.example.com")}
                className="mt-1 w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
              />
            </label>
            <p className="text-xs text-gray-500">{translate("Providers marked proxy need this because their APIs do not allow direct browser calls. Claude and Gemini can run direct.")}</p>
          </div>
        </ConfigSection>

        {isLocalMode && (
          <ConfigSection title={translate("Agent Roster")} icon="👥" defaultExpanded={true}>
            <AgentRosterConfig />
          </ConfigSection>
        )}

        {isLocalMode && (
          <>
            <ConfigSection title={translate("Local Agent Defaults")} icon="🤖" defaultExpanded={false}>
              <ConfigInput
                type="number"
                label={translate("Balance")}
                description={translate("Initial currency for newly spawned agents")}
                value={getValue('agent', 'startingBalance', LOCAL_DEFAULT_AGENT.startingBalance)}
                onChange={(v) => updateAgent({ startingBalance: v })}
                min={0}
                unit="CITY"
              />
              <ConfigInput
                type="number"
                label={translate("Hunger")}
                description={translate("Initial hunger for newly spawned agents")}
                value={getValue('agent', 'startingHunger', LOCAL_DEFAULT_AGENT.startingHunger)}
                onChange={(v) => updateAgent({ startingHunger: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Energy")}
                description={translate("Initial energy for newly spawned agents")}
                value={getValue('agent', 'startingEnergy', LOCAL_DEFAULT_AGENT.startingEnergy)}
                onChange={(v) => updateAgent({ startingEnergy: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Health")}
                description={translate("Initial health for newly spawned agents")}
                value={getValue('agent', 'startingHealth', LOCAL_DEFAULT_AGENT.startingHealth)}
                onChange={(v) => updateAgent({ startingHealth: v })}
                min={0}
                max={100}
              />
            </ConfigSection>

            <ConfigSection title={translate("Local Needs Decay")} icon="📉" defaultExpanded={false}>
              <ConfigInput
                type="number"
                label={translate("Hunger Decay")}
                description={translate("Base hunger loss during housekeeping")}
                value={getValue('needs', 'hungerDecay', LOCAL_DEFAULT_NEEDS.hungerDecay)}
                onChange={(v) => updateNeeds({ hungerDecay: v })}
                min={0}
                max={10}
                step={0.1}
              />
              <ConfigInput
                type="number"
                label={translate("Energy Decay")}
                description={translate("Base energy loss during housekeeping")}
                value={getValue('needs', 'energyDecay', LOCAL_DEFAULT_NEEDS.energyDecay)}
                onChange={(v) => updateNeeds({ energyDecay: v })}
                min={0}
                max={10}
                step={0.1}
              />
              <ConfigInput
                type="number"
                label={translate("Low Hunger")}
                description={translate("Below this threshold, hunger starts draining energy")}
                value={getValue('needs', 'lowHungerThreshold', LOCAL_DEFAULT_NEEDS.lowHungerThreshold)}
                onChange={(v) => updateNeeds({ lowHungerThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Critical Hunger")}
                description={translate("Below this threshold, hunger damages health")}
                value={getValue('needs', 'criticalHungerThreshold', LOCAL_DEFAULT_NEEDS.criticalHungerThreshold)}
                onChange={(v) => updateNeeds({ criticalHungerThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Low Energy")}
                description={translate("Below this threshold, exhaustion warnings begin")}
                value={getValue('needs', 'lowEnergyThreshold', LOCAL_DEFAULT_NEEDS.lowEnergyThreshold)}
                onChange={(v) => updateNeeds({ lowEnergyThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Critical Energy")}
                description={translate("Below this threshold, exhaustion damages health")}
                value={getValue('needs', 'criticalEnergyThreshold', LOCAL_DEFAULT_NEEDS.criticalEnergyThreshold)}
                onChange={(v) => updateNeeds({ criticalEnergyThreshold: v })}
                min={0}
                max={100}
              />
            </ConfigSection>
          </>
        )}

        {/* Agent System Prompt Section */}
        <ConfigSection title={translate("Agent System Prompt")} icon="🧠" defaultExpanded={false}>
          <PromptEditor />
        </ConfigSection>

        {/* Agent Deployment Section */}
        {!isLocalMode && (
          <ConfigSection title={translate("Agent Deployment")} icon="🚀" defaultExpanded={false}>
            <GenesisConfig />
          </ConfigSection>
        )}

        {!isLocalMode && config && (
          <>
            {/* Simulation Section */}
            <ConfigSection title={translate("Simulation")} icon="🎮" defaultExpanded={false}>
              <ConfigInput
                type="number"
                label={translate("Tick Interval")}
                description={translate("Time between cycles. Lower = faster, more LLM calls")}
                value={getValue('simulation', 'tickIntervalMs', 60000)}
                onChange={(v) => updateSimulation({ tickIntervalMs: v })}
                min={1000}
                step={1000}
                unit="ms"
              />
              <ConfigInput
                type="number"
                label={translate("Grid Size")}
                description={translate("World dimensions (NxN). Larger = slower interactions. Restart required")}
                value={getValue('simulation', 'gridSize', 100)}
                onChange={(v) => updateSimulation({ gridSize: v })}
                min={10}
                max={1000}
              />
              <ConfigInput
                type="number"
                label={translate("Visibility Radius")}
                description={translate("How far agents see (tiles). Larger = more social awareness")}
                value={getValue('simulation', 'visibilityRadius', 10)}
                onChange={(v) => updateSimulation({ visibilityRadius: v })}
                min={1}
                max={50}
              />
              <ConfigInput
                type="number"
                label={translate("Max Ticks")}
                description={translate("Auto-stop after N ticks. 0 = unlimited")}
                value={getValue('simulation', 'maxTicks', 0)}
                onChange={(v) => updateSimulation({ maxTicks: v })}
                min={0}
                step={1}
                isRuntimeModifiable={isRuntimeModifiable('simulation.maxTicks')}
              />
            </ConfigSection>

            {/* Agent Starting Values */}
            <ConfigSection title={translate("Agent Starting Values")} icon="🤖">
              <ConfigInput
                type="number"
                label={translate("Balance")}
                description={translate("Initial currency. Lower forces agents to work immediately")}
                value={getValue('agent', 'startingBalance', 50)}
                onChange={(v) => updateAgent({ startingBalance: v })}
                min={0}
                unit="CITY"
              />
              <ConfigInput
                type="number"
                label={translate("Hunger")}
                description={translate("Initial hunger (0-100). Lower = more starvation pressure")}
                value={getValue('agent', 'startingHunger', LOCAL_DEFAULT_AGENT.startingHunger)}
                onChange={(v) => updateAgent({ startingHunger: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Energy")}
                description={translate("Initial energy (0-100). Affects movement and work capacity")}
                value={getValue('agent', 'startingEnergy', LOCAL_DEFAULT_AGENT.startingEnergy)}
                onChange={(v) => updateAgent({ startingEnergy: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Health")}
                description={translate("Initial health (0-100). Decreases from critical needs or combat")}
                value={getValue('agent', 'startingHealth', 100)}
                onChange={(v) => updateAgent({ startingHealth: v })}
                min={0}
                max={100}
              />
            </ConfigSection>

            {/* Needs Decay */}
            <ConfigSection title={translate("Needs Decay")} icon="📉">
              <ConfigInput
                type="number"
                label={translate("Hunger Decay")}
                description={translate("Hunger loss per tick. Walking: 1.5x, sleeping: 0.5x")}
                value={getValue('needs', 'hungerDecay', 1)}
                onChange={(v) => updateNeeds({ hungerDecay: v })}
                min={0}
                max={10}
                step={0.1}
                unit="/tick"
              />
              <ConfigInput
                type="number"
                label={translate("Energy Decay")}
                description={translate("Energy loss per tick. Sleeping: 0x (no loss)")}
                value={getValue('needs', 'energyDecay', 0.5)}
                onChange={(v) => updateNeeds({ energyDecay: v })}
                min={0}
                max={10}
                step={0.1}
                unit="/tick"
              />
              <ConfigInput
                type="number"
                label={translate("Low Hunger Threshold")}
                description={translate("Below this: extra energy drain starts")}
                value={getValue('needs', 'lowHungerThreshold', 20)}
                onChange={(v) => updateNeeds({ lowHungerThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Critical Hunger")}
                description={translate("Below this: health damage after 3-tick grace period")}
                value={getValue('needs', 'criticalHungerThreshold', 10)}
                onChange={(v) => updateNeeds({ criticalHungerThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Low Energy Threshold")}
                description={translate("Below this: warning events trigger")}
                value={getValue('needs', 'lowEnergyThreshold', 20)}
                onChange={(v) => updateNeeds({ lowEnergyThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label={translate("Critical Energy")}
                description={translate("Below this: forced sleep, health damage starts")}
                value={getValue('needs', 'criticalEnergyThreshold', 10)}
                onChange={(v) => updateNeeds({ criticalEnergyThreshold: v })}
                min={0}
                max={100}
              />
            </ConfigSection>

            {/* Experiment Toggles */}
            <ConfigSection title={translate("Experiment Toggles")} icon="🧪">
              <ConfigInput
                type="boolean"
                label={translate("Enable Personalities")}
                description={translate("Assign traits (aggressive, cooperative, etc.) to agents")}
                value={getValue('experiment', 'enablePersonalities', false)}
                onChange={(v) => updateExperiment({ enablePersonalities: v })}
              />
              <ConfigInput
                type="boolean"
                label={translate("Emergent Prompt")}
                description={translate("Sensory-only prompts. Agents discover strategies themselves")}
                value={getValue('experiment', 'useEmergentPrompt', false)}
                onChange={(v) => updateExperiment({ useEmergentPrompt: v })}
                isRuntimeModifiable={isRuntimeModifiable('experiment.useEmergentPrompt')}
              />
              <ConfigInput
                type="select"
                label={translate("Safety Level")}
                description={translate("LLM safety framing: standard, minimal, or none (research)")}
                value={getValue('experiment', 'safetyLevel', 'standard')}
                onChange={(v) =>
                  updateExperiment({
                    safetyLevel: v as 'standard' | 'minimal' | 'none',
                  })
                }
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'minimal', label: 'Minimal' },
                  { value: 'none', label: 'None (Research)' },
                ]}
              />
              <ConfigInput
                type="boolean"
                label={translate("Baseline Agents")}
                description={translate("Include non-LLM agents (random, Q-learning) for comparison")}
                value={getValue('experiment', 'includeBaselineAgents', false)}
                onChange={(v) => updateExperiment({ includeBaselineAgents: v })}
              />
              <ConfigInput
                type="boolean"
                label={translate("Normalize Capabilities")}
                description={translate("Equalize model speeds by truncating responses")}
                value={getValue('experiment', 'normalizeCapabilities', false)}
                onChange={(v) => updateExperiment({ normalizeCapabilities: v })}
              />
            </ConfigSection>

            {/* Personality Weights */}
            <ConfigSection title={translate("Personality Weights")} icon="🎭" defaultExpanded={false}>
              <PersonalityConfig />
            </ConfigSection>

            {/* LLM Cache */}
            <ConfigSection title={translate("LLM Cache")} icon="💾">
              <ConfigInput
                type="boolean"
                label={translate("Enabled")}
                description={translate("Cache LLM responses. Same observation = instant response")}
                value={getValue('llmCache', 'enabled', true)}
                onChange={(v) => updateLLMCache({ enabled: v })}
                isRuntimeModifiable={isRuntimeModifiable('llmCache.enabled')}
              />
              <ConfigInput
                type="number"
                label={translate("TTL")}
                description={translate("Cache duration. Longer = fewer calls but less responsive")}
                value={getValue('llmCache', 'ttlSeconds', 300)}
                onChange={(v) => updateLLMCache({ ttlSeconds: v })}
                min={0}
                max={3600}
                unit="sec"
              />
            </ConfigSection>

            {/* Movement Costs */}
            <ConfigSection title={translate("Movement Costs")} icon="🚶">
              <ConfigInput
                type="number"
                label={translate("Energy Cost")}
                description={translate("Energy spent per tile moved. Higher = less wandering")}
                value={getValue('actions', 'move', config.actions.move).energyCost}
                onChange={(v) => updateActions({ move: { ...config.actions.move, energyCost: v } })}
                min={0}
                max={10}
                step={0.5}
                unit="/tile"
              />
              <ConfigInput
                type="number"
                label={translate("Hunger Cost")}
                description={translate("Hunger spent per tile moved. Exploration makes you hungry")}
                value={getValue('actions', 'move', config.actions.move).hungerCost}
                onChange={(v) => updateActions({ move: { ...config.actions.move, hungerCost: v } })}
                min={0}
                max={5}
                step={0.1}
                unit="/tile"
              />
              <ConfigInput
                type="number"
                label={translate("Consecutive Penalty")}
                description={translate("Extra cost multiplier for repeated moves. 0.5 = +50% cost")}
                value={getValue('actions', 'move', config.actions.move).consecutivePenalty}
                onChange={(v) => updateActions({ move: { ...config.actions.move, consecutivePenalty: v } })}
                min={0}
                max={2}
                step={0.1}
                unit="x"
              />
            </ConfigSection>

            {/* Economy */}
            <ConfigSection title={translate("Currency Decay")} icon="💸">
              <ConfigInput
                type="number"
                label={translate("Decay Rate")}
                description={translate("% of balance lost per interval. Discourages hoarding")}
                value={(getValue('economy', 'currencyDecayRate', config.economy?.currencyDecayRate ?? 0.05) * 100)}
                onChange={(v) => updateEconomy({ currencyDecayRate: v / 100 })}
                min={0}
                max={20}
                step={1}
                unit="%"
              />
              <ConfigInput
                type="number"
                label={translate("Decay Interval")}
                description={translate("Ticks between decay applications")}
                value={getValue('economy', 'currencyDecayInterval', config.economy?.currencyDecayInterval ?? 10)}
                onChange={(v) => updateEconomy({ currencyDecayInterval: v })}
                min={1}
                max={100}
                unit="ticks"
              />
              <ConfigInput
                type="number"
                label={translate("Exempt Threshold")}
                description={translate("Balance below this is exempt. Protects poor agents")}
                value={getValue('economy', 'currencyDecayThreshold', config.economy?.currencyDecayThreshold ?? 20)}
                onChange={(v) => updateEconomy({ currencyDecayThreshold: v })}
                min={0}
                max={100}
                unit="CITY"
              />
            </ConfigSection>

            {/* Other Action Costs (Read-only) */}
            <ConfigSection title={translate("Other Action Costs")} icon="⚡">
              <ConfigInput
                type="number"
                label={translate("Gather Energy Cost")}
                description={translate("Energy spent per resource unit gathered")}
                value={config.actions.gather.energyCostPerUnit}
                onChange={() => {}}
                disabled
                unit="/unit"
              />
              <ConfigInput
                type="number"
                label={translate("Work Pay")}
                description={translate("CITY earned per tick worked (costs 2 energy/tick)")}
                value={config.actions.work.basePayPerTick}
                onChange={() => {}}
                disabled
                unit="CITY/tick"
              />
              <ConfigInput
                type="number"
                label={translate("Sleep Energy Restore")}
                description={translate("Energy recovered per tick sleeping")}
                value={config.actions.sleep.energyRestoredPerTick}
                onChange={() => {}}
                disabled
                unit="/tick"
              />
            </ConfigSection>
          </>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-gray-800 rounded-lg p-4 mx-4 max-w-sm shadow-xl border border-gray-700">
            <h3 className="font-semibold text-gray-100 mb-2">{translate("Reset to Defaults?")}</h3>
            <p className="text-sm text-gray-400 mb-4">{translate("This will reset all configuration values to their defaults. This action cannot be undone.")}</p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >{translate("Reset")}</button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
              >{translate("Cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {!isLocalMode ? (
        <div className="px-4 py-3 border-t border-gray-700 bg-gray-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={!hasPendingChanges || isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {isLoading ? translate("Applying...") : translate("Apply Changes")}
            </button>
            <button
              onClick={discardChanges}
              disabled={!hasPendingChanges || isLoading}
              className="px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >{translate("Discard")}</button>
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-red-900/50 text-red-200 rounded hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          >{translate("Reset to Defaults")}</button>
          <div className="text-xs text-gray-500 text-center">
            <span aria-hidden="true">⚡</span>{translate("= applies immediately | others require restart")}</div>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-700 bg-gray-800 text-xs text-gray-500 space-y-1">
          {(localAppliedSections.length > 0 || localIgnoredSections.length > 0) && (
            <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-gray-700/60">
              <div className="min-w-0">
                {localAppliedSections.length > 0 && (
                  <>
                    <div className="text-gray-300">{translate("Local overrides")}</div>
                    <div className="truncate text-gray-500">
                      {formatSections(localAppliedSections)}
                    </div>
                  </>
                )}
                {localIgnoredSections.length > 0 && (
                  <div className={localAppliedSections.length > 0 ? 'mt-1' : undefined}>
                    <div className="text-yellow-300">{translate("Saved for next start")}</div>
                    <div className="truncate text-gray-500">
                      {formatSections(localIgnoredSections)}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={discardChanges}
                className="shrink-0 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
              >{translate("Reset")}</button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span>{translate("IndexedDB persistence")}</span>
            <span className={persistenceInfo.warning ? 'text-yellow-300' : 'text-gray-400'}>
              {formatPersistenceStatus(persistenceInfo)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>{translate("World / 50 MiB budget")}</span>
            <span>
              {formatBytes(persistenceInfo.snapshotBytes + persistenceInfo.ringBytes)}
              {' '}
              ({Math.round(persistenceInfo.quotaFraction * 100)}%)
            </span>
          </div>
          {persistenceInfo.warning && (
            <div className="text-yellow-300 text-left">
              {formatError(persistenceInfo.warning)}
              <button className="block underline mt-1" onClick={exportUnsavedWorld}>{translate("Export latest world")}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isLocalAppliedConfigSection(section: string): boolean {
  return section === 'agent' || section === 'needs';
}

function formatSections(sections: string[]): string {
  return sections.length === 0 ? 'none' : sections.join(', ');
}

function formatPersistenceStatus(info: PersistenceInfo): string {
  if (info.pending) return 'saving…';
  if (info.disabled) return 'paused';
  if (info.lastSavedSimTimeMs === undefined) return 'not saved yet';
  const minutes = Math.floor(info.lastSavedSimTimeMs / 60_000);
  return `saved at ${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default ConfigPanel;
