import { AppError, errorIssue, type AppIssue } from '@simagents/shared';
import { formatIssue } from './i18n/errors';
import { EntitySelector } from './components/EntitySelector';
import { MobileResourceList } from './components/Mobile/MobileResourceList';
import { formatError } from './i18n/errors';
import { importWorld } from './services/import-world';
import { APP_DATA_BUDGET } from './services/app-data';
import { reportSecondaryFailure } from './services/secondary-data';
import { translate, useLocale } from './i18n';
import { SimulationHeader } from './components/SimulationHeader';

import { SetupJourney } from './components/Setup/SetupJourney';
import { clearReplayFrames } from './services/replayFrames';
import { clearPromptLogs } from './services/promptLogs';
import { StorageNotice } from './components/StorageNotice';
import { migrateLegacyRuntime } from './services/migrate-legacy-runtime';
/**
 * SimAgents - Scientific Mode
 *
 * Simplified interface for the scientific experiment:
 * - No city editor (resources/shelters are spawned automatically)
 * - Grid visualization shows agents, resources, shelters
 * - Focus on observing emergent behavior
 * - Toggle between 2D and Isometric views
 * - Mobile-responsive with bottom navigation on small screens
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useEngine } from './hooks/useEngine';
import { useWorldStore, useAgents, useEvents } from './stores/world';
import { useEditorStore, useAppMode, useIsAnalyticsMode, useIsReplayMode, useIsPromptsMode, useIsPuzzlesMode, useIsPaused, useViewMode, type AppMode } from './stores/editor';
import { useWorldControl } from './hooks/useWorldControl';
import { Layout } from './components/Layout';
import { ScientificCanvas } from './components/Canvas/ScientificCanvas';
import { ScientificIsometricCanvas } from './components/Canvas/ScientificIsometricCanvas';
import { EventFeed } from './components/EventFeed';
import { AgentProfile } from './components/AgentProfile';
import { ResourceProfile } from './components/ResourceProfile';
import { WorldStats } from './components/WorldStats';
import { AgentSummaryTable } from './components/AgentSummaryTable';
import { DecisionLog } from './components/DecisionLog';
import { ModeControls, ViewToggle, EventFilters } from './components/Controls';
import { MobileNav, type MobileView } from './components/MobileNav';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReplayPage } from './pages/ReplayPage';
import { PromptsPage } from './pages/PromptsPage';
import { PuzzlesPage } from './pages/PuzzlesPage';
import { useReplayStore } from './stores/replay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SocialGraphView, SocialGraphButton } from './components/SocialGraph';
import { MobileAgentList, MobileDecisionLog } from './components/Mobile';
import { ConfigPanel } from './components/ConfigPanel';
import {
  downloadWorldExport,
  parseWorldExportFile,
  saveImportedWorld,
} from './services/persistence';
import { useSessionLimitsStore } from './stores/sessionLimits';
import { getEngineClient } from './engine-host/engine-client';

export default function App() {
  useLocale();
  useEffect(() => { migrateLegacyRuntime(); }, []);
  const localConnection = useEngine();
  const usage = useSessionLimitsStore((state) => state.usage);
  const { status, connect, disconnect } = localConnection;
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectedResourceId = useWorldStore((s) => s.selectedResourceId);
  const { resetWorld, setWorldState, setEvents, updateWorldState } = useWorldStore();
  const { setMode, setPaused } = useEditorStore();
  const mode = useAppMode();
  const viewMode = useViewMode();
  const isAnalyticsMode = useIsAnalyticsMode();
  const isReplayMode = useIsReplayMode();
  const isPromptsMode = useIsPromptsMode();
  const isPuzzlesMode = useIsPuzzlesMode();
  const isPaused = useIsPaused();
  const { enterReplayMode, exitReplayMode } = useReplayStore();
  const [hasSynced, setHasSynced] = useState(false);

  // Mobile navigation state
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  const [importBusy, setImportBusy] = useState(false), [importComplete, setImportComplete] = useState(false);
  const [importIssue, setImportIssue] = useState<AppIssue>();
  const [exportIssue, setExportIssue] = useState<AppIssue>();
  // Config panel state
  const setupTrigger = useRef<HTMLButtonElement>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const configReturnFocus = useRef<HTMLElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const agents = useAgents();
  const events = useEvents();
  const aliveAgents = agents.filter(a => a.health > 0);

  const { fetchState, start, pause, resume, reset } = useWorldControl();

  useEffect(() => {
    if (hasSynced) return;
    const syncWithWorker = async () => {
      const state = await fetchState();
      if (state && state.isRunning) {
        setWorldState({
          tick: state.tick,
          agents: state.agents || [],
          resourceSpawns: state.resourceSpawns || [],
          shelters: state.shelters || [],
        });

        // Events repopulate from the live worker event stream and the persisted event ring.
        setPaused(state.isPaused);
        setMode('simulation');
      }
      setHasSynced(true);
    };

    syncWithWorker();
  }, [hasSynced, fetchState, setMode, setPaused, setWorldState]);

  const handleStartSimulation = useCallback(async (resumeSavedWorld = false) => {
    const result = await start({ resumeSavedWorld });
    if (!result.success) {
      alert(result.error || 'Failed to start simulation.');
      return;
    }

    // Update store with spawned entities
    setWorldState({
      tick: result.tick ?? 1,
      agents: result.agents ?? [],
      resourceSpawns: result.resourceSpawns ?? [],
      shelters: result.shelters ?? [],
    });
    if (result.events) {
      setEvents(result.events);
    }

    // Switch to simulation mode
    setPaused(false);
    setMode('simulation');

    connect();
  }, [setMode, setPaused, start, setWorldState, setEvents, connect]);

  const handleReset = useCallback(async () => {
    disconnect();
    await reset();
    resetWorld();
    setPaused(false);
    setMode('editor'); // Back to "ready" state
  }, [disconnect, reset, resetWorld, setMode, setPaused]);

  const handleExportWorld = useCallback(async () => {
    setExportIssue(undefined);
    try {
      const exported = await getEngineClient().exportWorld();
      downloadWorldExport(exported);
    } catch {
      setExportIssue({ code: 'EXPORT_FAILED' });
    }
  }, []);

  const handleImportFile = useCallback(async (file: File | undefined) => {
    if (!file || importBusy) return;
    setImportBusy(true); setImportIssue(undefined); setImportComplete(false); setExportIssue(undefined);
    try {
      if (file.size > APP_DATA_BUDGET) throw new AppError({ code: 'STORAGE_BUDGET' });
      await importWorld(JSON.parse(await file.text()), getEngineClient());
      disconnect();
      resetWorld();
      setPaused(false);
      setMode('editor');
      // History is indexed by world/agent. Import must not silently delete another world's archives.
      useReplayStore.getState().reset();
      setImportComplete(true);
    } catch (error) {
      setImportIssue(errorIssue(error));
    } finally {
      setImportBusy(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }, [disconnect, resetWorld, setMode, setPaused, importBusy]);

  const handlePause = useCallback(async () => {
    await pause();
    disconnect();
  }, [pause, disconnect]);

  const handleResume = useCallback(async () => {
    await resume();
    connect();
  }, [resume, connect]);

  // Handle enter replay mode
  const handleEnterReplay = useCallback(async () => {
    if (getEngineClient().isRunning()) await getEngineClient().pause();
    disconnect();
    setMode('replay');
    enterReplayMode();
  }, [disconnect, setMode, enterReplayMode]);

  // Handle exit replay mode
  const handleExitReplay = useCallback(() => {
    exitReplayMode();
    setMode('simulation');
    connect();
  }, [exitReplayMode, setMode, connect]);

  // Error handler for logging/reporting
  const handleError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    console.error('[App] Component error caught:', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }, []);

  // Switch to profile view when agent or resource is selected (mobile)
  useEffect(() => {
    if ((selectedAgentId || selectedResourceId) && window.innerWidth < 1024) {
      setMobileView('profile');
    }
  }, [selectedAgentId, selectedResourceId]);

  // Render the appropriate canvas based on view mode
  const renderCanvas = () => {
    if (viewMode === 'isometric') {
      return <ScientificIsometricCanvas />;
    }
    return <ScientificCanvas />;
  };

  const openConfiguration = () => { configReturnFocus.current = document.activeElement as HTMLElement; setShowConfigPanel(true); };
  const closeConfiguration = () => {
    setShowConfigPanel(false);
    requestAnimationFrame(() => {
      const previous = configReturnFocus.current;
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
      else [...document.querySelectorAll<HTMLElement>('.simulation-tools > summary')].find(element => element.getClientRects().length)?.focus();
    });
  };

  const headerContent = <SimulationHeader status={status} mutationPending={importBusy} errorMessage={localConnection.error ?? undefined} onStart={handleStartSimulation}
    onPause={handlePause} onResume={handleResume} onReset={handleReset}
    onConfigure={openConfiguration} onImport={() => importInputRef.current?.click()}
    onExport={() => void handleExportWorld()} onReplay={() => void handleEnterReplay()} />;

  const importNotice = (importComplete || importIssue || exportIssue) && <div role={importIssue || exportIssue ? 'alert' : 'status'} tabIndex={0} className="simulation-error-notice rounded-lg border border-city-border bg-gray-950 p-4 text-sm text-white">
    <p>{importIssue || exportIssue ? formatIssue((importIssue ?? exportIssue)!) : translate('World imported. Use Start to resume the saved world.')}</p>
    <button type="button" className="min-h-11 mt-2 px-3 border border-city-border rounded" onClick={() => { setImportIssue(undefined); setImportComplete(false); setExportIssue(undefined); }}>{translate('Close')}</button>
  </div>;

  if (isAnalyticsMode || isReplayMode || isPromptsMode || isPuzzlesMode) {
    const section = isAnalyticsMode ? 'Analytics' : isReplayMode ? 'Replay' : isPromptsMode ? 'Prompts' : 'Puzzles';
    return <>
      {importNotice}
      <StorageNotice />
      <SocialGraphView />
      <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => void handleImportFile(event.currentTarget.files?.[0])} />
      {showConfigPanel && <ConfigPanel onClose={closeConfiguration} />}
      <div inert={showConfigPanel} className="feature-shell">
        <header className="app-header shrink-0">{headerContent}</header>
        <div className="feature-body">
          <ErrorBoundary sectionName={translate(section)} onError={handleError}>
            {isAnalyticsMode ? <AnalyticsPage /> : isReplayMode ? <ReplayPage /> : isPromptsMode ? <PromptsPage /> : <PuzzlesPage />}
          </ErrorBoundary>
        </div>
      </div>
    </>;
  }

  // Ready mode (before simulation starts)
  const isReadyMode = mode === 'editor';

  // Mobile view content
  const renderMobileContent = () => {
    switch (mobileView) {
      case 'agents':
        return (
          <div className="h-full overflow-y-auto bg-city-bg">
            <ErrorBoundary sectionName={translate("Agent Summary")} onError={handleError} compact>
              <MobileAgentList />
            </ErrorBoundary>
          </div>
        );
      case 'resources':
        return <div className="h-full overflow-y-auto"><MobileResourceList /></div>;
      case 'events':
        return (
          <div className="h-full overflow-y-auto bg-city-bg">
            <ErrorBoundary sectionName={translate("Event Feed")} onError={handleError} compact>
              <EventFeed />
            </ErrorBoundary>
          </div>
        );
      case 'decisions':
        return (
          <div tabIndex={0} aria-label={translate('Decisions')} className="h-full overflow-y-auto bg-city-bg">
            <ErrorBoundary sectionName={translate("Decision Log")} onError={handleError} compact>
              <MobileDecisionLog />
            </ErrorBoundary>
          </div>
        );
      case 'profile':
        return (
          <div className="h-full overflow-y-auto bg-city-bg">
            {selectedAgentId ? (
              <ErrorBoundary sectionName={translate("Agent Profile")} onError={handleError} compact>
                <AgentProfile agentId={selectedAgentId} />
              </ErrorBoundary>
            ) : selectedResourceId ? (
              <ErrorBoundary sectionName={translate("Resource Profile")} onError={handleError} compact>
                <ResourceProfile />
              </ErrorBoundary>
            ) : (
              <div className="p-4 text-city-text-muted text-sm text-center">
                <p>{translate("No agent or resource selected")}</p>
                <p className="mt-2 text-xs">{translate("Tap an agent or resource on the map to view details")}</p>
              </div>
            )}
          </div>
        );
      case 'canvas':
      default:
        return (
          <div className="h-full">
            <ErrorBoundary sectionName={translate("Canvas")} onError={handleError}>
              {renderCanvas()}
            </ErrorBoundary>
          </div>
        );
    }
  };

  return (
    <>
      {importNotice}
      <StorageNotice />
      {localConnection.error && !importIssue && !exportIssue && (
        <div role="alert" tabIndex={0} className="simulation-error-notice rounded-lg border border-red-400 bg-gray-950 p-4 text-sm text-white">
          <strong>{translate("Simulation paused.")}</strong> {localConnection.error}
          <p>{translate("Check the connection, model and provider quota, then resume explicitly. No fallback or automatic retry was used.")}</p>
        </div>
      )}
      {/* Social Graph Overlay */}
      <SocialGraphView />

      {/* Config Panel */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImportFile(event.currentTarget.files?.[0])}
      />

      {mode === 'editor' && !showConfigPanel && <section inert={showSetup} aria-hidden={showSetup} className="setup-invitation" aria-label={translate("Simulation setup")}>
        <h2>{translate("Start with your own AI models")}</h2><p>{translate("Connect a provider, verify your models and choose how your world begins.")}</p>
        <button ref={setupTrigger} onClick={() => setShowSetup(true)}>{translate("Set up a simulation")}</button>
      </section>}
      {showSetup && <SetupJourney onClose={() => { setShowSetup(false); requestAnimationFrame(() => setupTrigger.current?.focus()); }} onStart={handleStartSimulation} onAdvanced={() => { setShowSetup(false); setShowConfigPanel(true); }} />}
      {/* Config Panel */}
      {showConfigPanel && (
        <ConfigPanel onClose={closeConfiguration} />
      )}

      {/* Desktop layout */}
      <div inert={showConfigPanel || showSetup} className="hidden lg:block h-dvh">
        <Layout
          header={headerContent}
          sidebar={<>
            {!isReadyMode && <EntitySelector />}
            {isReadyMode ? (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-city-text mb-2">{translate("Scientific Mode")}</h3>
                <p className="text-xs text-city-text-muted mb-4">{translate("This experiment observes emergent behavior in an AI agent population.")}</p>
                <div className="space-y-3 text-xs text-city-text-muted">
                  <div>
                    <h4 className="font-medium text-city-text mb-1">{translate("What's Imposed:")}</h4>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>{translate("Grid world (100x100)")}</li>
                      <li>{translate("Survival needs (hunger, energy, health)")}</li>
                      <li>{translate("Resource distribution")}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-city-text mb-1">{translate("What Emerges:")}</h4>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>{translate("Movement patterns")}</li>
                      <li>{translate("Resource gathering strategies")}</li>
                      <li>{translate("Social behaviors")}</li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-city-border/30">
                    <p className="italic">{translate("Click \"Start Simulation\" to begin the experiment.")}</p>
                  </div>
                </div>
              </div>
            ) : selectedAgentId ? (
              <ErrorBoundary sectionName={translate("Agent Profile")} onError={handleError} compact>
                <AgentProfile agentId={selectedAgentId} />
              </ErrorBoundary>
            ) : selectedResourceId ? (
              <ErrorBoundary sectionName={translate("Resource Profile")} onError={handleError} compact>
                <ResourceProfile />
              </ErrorBoundary>
            ) : (
              <div className="p-4 text-gray-400 text-sm">{translate("Click an agent or resource on the grid to view details")}</div>
            )
          }</>}
          feed={
            <div className="flex flex-col h-full">
              {/* Event Filters */}
              <div className="shrink-0 p-2 border-b border-city-border/50">
                <EventFilters />
              </div>
              {/* Event Feed */}
              <div className="flex-1 overflow-hidden">
                <ErrorBoundary sectionName={translate("Event Feed")} onError={handleError} compact>
                  <EventFeed />
                </ErrorBoundary>
              </div>
            </div>
          }
        >
          {/* Canvas with error boundary - switches based on view mode */}
          <ErrorBoundary sectionName={translate("Canvas")} onError={handleError}>
            {renderCanvas()}
          </ErrorBoundary>

          {/* Floating panels with error boundaries - desktop only */}
          {!isReadyMode && (
            <>
              <ErrorBoundary sectionName={translate("Agent Summary")} onError={handleError} compact>
                <AgentSummaryTable />
              </ErrorBoundary>
              <ErrorBoundary sectionName={translate("Decision Log")} onError={handleError} compact>
                <DecisionLog />
              </ErrorBoundary>
            </>
          )}
        </Layout>
      </div>

      {/* Mobile layout */}
      <div inert={showConfigPanel || showSetup} className="lg:hidden h-dvh flex flex-col bg-city-bg">
        {/* Mobile header */}
        <header className="app-header shrink-0 z-20">
          {headerContent}
        </header>

        {/* Mobile content area */}
        <main className="mobile-world-content flex-1 min-h-0 overflow-hidden relative" style={{ marginBottom: isReadyMode ? 0 : "calc(var(--mobile-nav-height, 64px) + env(safe-area-inset-bottom))" }}>
          {isReadyMode ? (
            <div tabIndex={0} className="h-full overflow-y-auto p-4">
              <h3 className="text-base font-semibold text-city-text mb-3">{translate("Scientific Mode")}</h3>
              <p className="text-sm text-city-text-muted mb-4">{translate("This experiment observes emergent behavior in an AI agent population.")}</p>
              <div className="space-y-4 text-sm text-city-text-muted">
                <div>
                  <h4 className="font-medium text-city-text mb-2">{translate("What's Imposed:")}</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>{translate("Grid world (100x100)")}</li>
                    <li>{translate("Survival needs (hunger, energy, health)")}</li>
                    <li>{translate("Resource distribution")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-city-text mb-2">{translate("What Emerges:")}</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>{translate("Movement patterns")}</li>
                    <li>{translate("Resource gathering strategies")}</li>
                    <li>{translate("Social behaviors")}</li>
                  </ul>
                </div>
                <div className="pt-4 border-t border-city-border/30">
                  <p className="italic text-center">{translate("Tap \"Start Simulation\" above to begin")}</p>
                </div>
              </div>
            </div>
          ) : (
            renderMobileContent()
          )}
        </main>

        {/* Mobile navigation - only show when simulation is running */}
        {!isReadyMode && (
          <MobileNav
            currentView={mobileView}
            onViewChange={setMobileView}
            hasSelectedAgent={!!selectedAgentId || !!selectedResourceId}
            agentCount={aliveAgents.length}
            eventCount={events.length}
          />
        )}
      </div>
    </>
  );
}
