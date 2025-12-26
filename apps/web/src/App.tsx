import { useEffect, useCallback, useRef } from 'react';
import { useSSE } from './hooks/useSSE';
import { useWorldStore } from './stores/world';
import { useEditorStore, useAppMode, useIsEditorMode, useIsPaused } from './stores/editor';
import { useCityPersistence } from './hooks/useCityPersistence';
import { Layout } from './components/Layout';
import { IsometricCanvas, type IsometricCanvasHandle } from './components/Canvas/IsometricCanvas';
import { EventFeed } from './components/EventFeed';
import { AgentProfile } from './components/AgentProfile';
import { WorldStats } from './components/WorldStats';
import { AgentSummaryTable } from './components/AgentSummaryTable';
import { DecisionLog } from './components/DecisionLog';
import { TileToolbar } from './components/Editor';
import { ModeControls } from './components/Controls';
import { assignBuildingsToLocations, validateGrid } from './utils/buildingAssignment';

export default function App() {
  const { status, connect, disconnect } = useSSE();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const { setLocations, resetWorld } = useWorldStore();
  const { setMode, grid, restoreLastSavedGrid, clearGrid } = useEditorStore();
  const mode = useAppMode();
  const isEditorMode = useIsEditorMode();
  const isPaused = useIsPaused();
  const canvasRef = useRef<IsometricCanvasHandle>(null);

  // Load city from URL hash on mount
  useCityPersistence();

  // Connect/disconnect SSE based on mode
  useEffect(() => {
    if (mode === 'simulation' && !isPaused) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [mode, isPaused, connect, disconnect]);

  // Handle start simulation
  const handleStartSimulation = useCallback(() => {
    // Validate grid has required buildings
    const validation = validateGrid(grid);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    // Assign buildings to locations
    const locations = assignBuildingsToLocations(grid);
    console.log('[App] Assigned locations:', locations);

    // Set locations in world store
    setLocations(locations);

    // Switch to simulation mode
    setMode('simulation');
  }, [grid, setLocations, setMode]);

  // Handle reset (back to editor)
  const handleReset = useCallback(() => {
    // Disconnect SSE
    disconnect();

    // Reset world state
    resetWorld();

    // Switch back to editor mode
    setMode('editor');

    // Optionally restore last saved grid (ask user?)
    // For now, keep current grid
  }, [disconnect, resetWorld, setMode]);

  // Header content based on mode
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-4">
        {/* Logo/Title */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text">Agents City</h1>
        </div>

        {/* World stats (only in simulation mode) */}
        {!isEditorMode && (
          <WorldStats connectionStatus={status} />
        )}
      </div>

      {/* Mode controls */}
      <ModeControls
        onStartSimulation={handleStartSimulation}
        onReset={handleReset}
      />
    </div>
  );

  return (
    <Layout
      header={headerContent}
      toolbar={isEditorMode ? <TileToolbar /> : undefined}
      sidebar={
        isEditorMode ? (
          <div className="p-4">
            <h3 className="text-sm font-semibold text-city-text mb-2">Editor Mode</h3>
            <p className="text-xs text-city-text-muted mb-4">
              Select tiles from the toolbar and click on the canvas to place them.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-city-text-muted">Residential</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                <span className="text-city-text-muted">Commercial</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-city-text-muted">Industrial</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-purple-400" />
                <span className="text-city-text-muted">Civic</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-city-bg rounded-lg">
              <h4 className="text-xs font-medium text-city-text mb-1">Requirements</h4>
              <ul className="text-xs text-city-text-muted space-y-1">
                <li>2x Residential buildings</li>
                <li>2x Commercial buildings</li>
                <li>1x Industrial building</li>
                <li>1x Civic building</li>
              </ul>
            </div>
          </div>
        ) : selectedAgentId ? (
          <AgentProfile agentId={selectedAgentId} />
        ) : (
          <div className="p-4 text-gray-400 text-sm">
            Click an agent to view details
          </div>
        )
      }
      feed={<EventFeed />}
    >
      <IsometricCanvas ref={canvasRef} />
      {!isEditorMode && (
        <>
          <AgentSummaryTable />
          <DecisionLog />
        </>
      )}
    </Layout>
  );
}
