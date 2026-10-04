import { formatActionLabel } from '../i18n';
import { formatError } from '../i18n/errors';
import { translateLabel, useLocale, translate } from '../i18n';

/**
 * Replay Page (Phase 3: Time Travel)
 *
 * Full-page UI for replaying simulation history.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import {
  useReplayStore,
  useTickRange,
  useCurrentTick,
  useSnapshot,
  useIsPlaying,
  usePlaybackSpeed,
  useReplayLoading,
  useReplayError,
  useSelectedReplayAgent,
  useAgentTimeline,
  fetchTickRange,
  fetchWorldSnapshot,
  fetchAgentTimeline,
} from '../stores/replay';
import { getEngineClient } from '../engine-host/engine-client';
import { useEditorStore } from '../stores/editor';

// =============================================================================
// Tick Slider
// =============================================================================

function TickSlider() {
  useLocale();
  const tickRange = useTickRange();
  const currentTick = useCurrentTick();
  const isPlaying = useIsPlaying();
  const { setCurrentTick, setSnapshot, setLoading, setError } = useReplayStore();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const tick = tickRange?.availableTicks?.[parseInt(e.target.value, 10)];
    if (tick === undefined) return;
    setCurrentTick(tick);

    // Fetch snapshot for this tick
    setLoading(true);
    try {
      const snapshot = await fetchWorldSnapshot(tick);
      if (useReplayStore.getState().currentTick !== tick) return;
      setSnapshot(snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshot');
    } finally {
      setLoading(false);
    }
  };

  if (!tickRange) return null;

  return (
    <div className="flex items-center gap-4 p-4 bg-city-surface border-b border-city-border">
      <span className="text-xs text-city-text-muted w-16">{translate("Tick")}{" "}{tickRange.minTick}
      </span>
      <input
        aria-label={translate("Saved replay frame")}
        type="range"
        min={0}
        max={Math.max(0, (tickRange.availableTicks?.length ?? 1) - 1)}
        value={tickRange.availableTicks?.indexOf(currentTick) ?? 0}
        onChange={handleChange}
        disabled={isPlaying}
        className="flex-1 h-2 bg-city-border rounded-lg appearance-none cursor-pointer accent-city-accent"
      />
      <span className="text-xs text-city-text-muted w-16 text-right">{translate("Tick")}{" "}{tickRange.maxTick}
      </span>
      <div className="px-3 py-1 bg-city-accent text-gray-950 text-sm font-mono rounded">
        {currentTick}
      </div>
    </div>
  );
}

// =============================================================================
// Playback Controls
// =============================================================================

function PlaybackControls() {
  useLocale();
  const isPlaying = useIsPlaying();
  const speed = usePlaybackSpeed();
  const tickRange = useTickRange();
  const currentTick = useCurrentTick();
  const { setPlaying, setPlaybackSpeed, setCurrentTick, setSnapshot, setError, exitReplayMode } = useReplayStore();
  const { setMode } = useEditorStore();

  const playIntervalRef = useRef<number | null>(null);

  // Handle play/pause
  const togglePlay = () => {
    setPlaying(!isPlaying);
  };

  // Handle speed change
  const cycleSpeed = () => {
    const speeds = [1, 2, 4, 8];
    const idx = speeds.indexOf(speed);
    const nextIdx = (idx + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIdx]);
  };

  // Step forward/backward
  const step = async (direction: 1 | -1) => {
    if (!tickRange) return;

    const ticks = tickRange.availableTicks ?? [];
    const newTick = direction === 1 ? ticks.find(tick => tick > currentTick) ?? currentTick : [...ticks].reverse().find(tick => tick < currentTick) ?? currentTick;

    if (newTick !== currentTick) {
      setCurrentTick(newTick);
      try {
        const snapshot = await fetchWorldSnapshot(newTick);
        if (useReplayStore.getState().currentTick === newTick) setSnapshot(snapshot);
      } catch {
        setError('Failed to load snapshot');
      }
    }
  };

  // Auto-play effect
  useEffect(() => {
    if (isPlaying && tickRange) {
      const interval = 1000 / speed;
      playIntervalRef.current = window.setInterval(async () => {
        const { currentTick, tickRange } = useReplayStore.getState();
        if (!tickRange || currentTick >= tickRange.maxTick) {
          setPlaying(false);
          return;
        }

        const newTick = tickRange.availableTicks?.find(tick => tick > currentTick);
        if (newTick === undefined) { setPlaying(false); return; }
        setCurrentTick(newTick);
        try {
          const snapshot = await fetchWorldSnapshot(newTick);
          if (useReplayStore.getState().currentTick === newTick && useReplayStore.getState().isPlaying) setSnapshot(snapshot);
        } catch {
          setPlaying(false);
          setError('Failed to load snapshot');
        }
      }, interval);

      return () => {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
        }
      };
    }
  }, [isPlaying, speed, setPlaying, setCurrentTick, setSnapshot, tickRange]);

  return (
    <div className="flex items-center gap-2 p-4 bg-city-surface border-b border-city-border">
      {/* Step backward */}
      <button
        onClick={() => step(-1)}
        disabled={isPlaying}
        className="p-2 rounded hover:bg-city-border disabled:opacity-50"
        title={translate("Previous tick")}
      >
        <svg className="w-5 h-5 text-city-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className="p-2 rounded bg-city-accent hover:bg-city-accent/80 text-gray-950"
        title={isPlaying ? translate("Pause") : translate("Play")}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        )}
      </button>

      {/* Step forward */}
      <button
        onClick={() => step(1)}
        disabled={isPlaying}
        className="p-2 rounded hover:bg-city-border disabled:opacity-50"
        title={translate("Next tick")}
      >
        <svg className="w-5 h-5 text-city-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Speed control */}
      <button
        onClick={cycleSpeed}
        className="px-3 py-1 rounded bg-city-border hover:bg-city-border/80 text-city-text text-sm font-mono"
        title={translate("Change playback speed")}
      >
        {speed}{" "}{translate("x")}</button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Exit replay */}
      <button
        onClick={() => {
          exitReplayMode();
          setMode(getEngineClient().isRunning() ? 'simulation' : 'editor');
        }}
        className="px-3 py-1.5 rounded bg-city-surface border border-city-border hover:bg-city-border text-city-text text-sm"
      >{translate("Exit Replay")}</button>
    </div>
  );
}

// =============================================================================
// Replay Canvas (Simple Grid)
// =============================================================================

function ReplayCanvas() {
  useLocale();
  const snapshot = useSnapshot();
  const selectedAgentId = useReplayStore((s) => s.selectedAgentId);
  const { selectAgent, setAgentTimeline } = useReplayStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timelineError, setTimelineError] = useState<string>();

  const handleAgentClick = async (agentId: string) => {
    selectAgent(agentId);
    setTimelineError(undefined);
    try {
      const timeline = await fetchAgentTimeline(agentId, 50);
      if (useReplayStore.getState().selectedAgentId === agentId) setAgentTimeline(timeline);
    } catch (error) {
      if (useReplayStore.getState().selectedAgentId === agentId) setTimelineError(formatError(error));
    }
  };

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const gridSize = 100;
    const cellSize = Math.min(width, height) / gridSize;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines (faint)
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(width, i * cellSize);
      ctx.stroke();
    }

    // Draw resource spawns
    for (const spawn of snapshot.resourceSpawns) {
      const x = spawn.x * cellSize + cellSize / 2;
      const y = spawn.y * cellSize + cellSize / 2;
      const fillPercent = spawn.currentAmount / spawn.maxAmount;

      let color = '#22c55e'; // green for food
      if (spawn.resourceType === 'energy') color = '#eab308'; // yellow
      if (spawn.resourceType === 'material') color = '#8b5cf6'; // purple

      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + fillPercent * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw shelters
    for (const shelter of snapshot.shelters) {
      const x = shelter.x * cellSize;
      const y = shelter.y * cellSize;

      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      ctx.globalAlpha = 1;
    }

    // Draw agents
    for (const agent of snapshot.agents) {
      const x = agent.x * cellSize + cellSize / 2;
      const y = agent.y * cellSize + cellSize / 2;
      const isSelected = agent.id === selectedAgentId;

      // Agent circle
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = getLLMColor(agent.llmType);
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.45, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Health bar
      const healthPercent = agent.health / 100;
      ctx.fillStyle = healthPercent > 0.5 ? '#22c55e' : healthPercent > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(x - cellSize * 0.3, y + cellSize * 0.4, cellSize * 0.6 * healthPercent, 3);
    }
  }, [snapshot, selectedAgentId]);

  // Handle click on canvas
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;

    const rect = canvas.getBoundingClientRect();
    // Account for canvas scaling (internal size vs displayed size)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const gridSize = 100;
    const cellSize = Math.min(canvas.width, canvas.height) / gridSize;

    // Convert click position to grid coordinates (floating point for precision)
    const gridX = x / cellSize;
    const gridY = y / cellSize;

    // Find closest agent within click radius (2 cells tolerance)
    const clickRadius = 2;
    let closestAgent = null;
    let closestDist = clickRadius;

    for (const agent of snapshot.agents) {
      const dist = Math.sqrt(
        Math.pow(agent.x - gridX, 2) + Math.pow(agent.y - gridY, 2)
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestAgent = agent;
      }
    }

    if (closestAgent) {
      handleAgentClick(closestAgent.id);
    } else {
      selectAgent(null);
    }
  };

  return <div>
    {timelineError && <p role="alert">{timelineError}</p>}
    <canvas
      role="img"
      aria-label={translate("Replay world map")}
      ref={canvasRef}
      width={600}
      height={600}
      onClick={handleClick}
      className="border border-city-border rounded cursor-pointer w-full max-w-[600px] h-auto"
    />
  </div>;
}


function ReplayEntitySelector() {
  useLocale();
  const snapshot = useSnapshot(), selected = useSelectedReplayAgent();
  const [timelineError, setTimelineError] = useState<string>();
  return <label className="px-4 py-2 text-sm text-city-text">{translate('Inspect replay agent')}
    <select className="mt-1 block min-h-11 w-full rounded border border-city-border bg-city-bg p-2" aria-label={translate('Inspect replay agent')} value={selected?.id ?? ''} onChange={async event => {
      const id = event.target.value || null;
      setTimelineError(undefined);
      useReplayStore.getState().selectAgent(id);
      useReplayStore.getState().setAgentTimeline([]);
      if (id) {
        try {
          const timeline = await fetchAgentTimeline(id);
          if (useReplayStore.getState().selectedAgentId === id) useReplayStore.getState().setAgentTimeline(timeline);
        } catch (error) { if (useReplayStore.getState().selectedAgentId === id) setTimelineError(formatError(error)); }
      }
    }}>
      <option value="">{translate('Choose an entity')}</option>
      {snapshot?.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name ?? agent.llmType} · {agent.modelId ?? agent.llmType} · ({agent.x}, {agent.y})</option>)}
    </select>
    {timelineError && <span role="alert" className="block mt-2">{timelineError}</span>}
  </label>;
}

function getLLMColor(llmType: string): string {
  const colors: Record<string, string> = {
    claude: '#ff6b35',
    gemini: '#4285f4',
    codex: '#10a37f',
    deepseek: '#00d4aa',
    qwen: '#7c3aed',
    glm: '#f59e0b',
    grok: '#1da1f2',
    external: '#ec4899',
  };
  return colors[llmType] || '#6b7280';
}

// =============================================================================
// Event Timeline
// =============================================================================

function EventTimeline() {
  useLocale();
  const snapshot = useSnapshot();
  const events = snapshot?.events ?? [];

  if (events.length === 0) {
    return (
      <div className="p-4 text-city-text-muted text-sm">{translate("No events at this tick")}</div>
    );
  }

  return (
    <div tabIndex={0} aria-label={translate("Replay events")} className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
      <h3 className="text-sm font-semibold text-city-text mb-2">{translate("Events at Tick")}{" "}{snapshot?.tick}
      </h3>
      {events.map((event) => (
        <div
          key={event.id}
          className="p-2 bg-city-border/30 rounded text-xs"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-city-text">
              {event.eventType}
            </span>
            {event.agentId && (
              <span className="text-city-text-muted">
                {event.agentId.slice(0, 8)}...
              </span>
            )}
          </div>
          <pre tabIndex={0} className="text-city-text-muted text-xs overflow-x-auto">
            {JSON.stringify(event.payload, null, 2).slice(0, 100)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Agent State Panel
// =============================================================================

function AgentStatePanel() {
  useLocale();
  const agent = useSelectedReplayAgent();
  const timeline = useAgentTimeline();
  const { selectAgent } = useReplayStore();

  if (!agent) {
    return (
      <div className="p-4 text-city-text-muted text-sm">{translate("Click an agent on the grid to view details")}</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: getLLMColor(agent.llmType) }}
          />
          <h3 className="font-semibold text-city-text">{agent.name ?? agent.llmType}</h3>
        </div>
        <button
          aria-label={translate('Close agent details')}
          onClick={() => selectAgent(null)}
          className="min-w-11 min-h-11 text-city-text-muted hover:text-city-text"
        >{translate("x")}</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">{translate("Position")}</div>
          <div className="text-city-text font-mono">({agent.x}, {agent.y})</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">{translate("State")}</div>
          <div className="text-city-text">{formatActionLabel(agent.state)}</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">{translate("Health")}</div>
          <div className="text-city-text">{agent.health}%</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">{translate("Energy")}</div>
          <div className="text-city-text">{agent.energy}%</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">{translate("Hunger")}</div>
          <div className="text-city-text">{agent.hunger}%</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">{translate("Balance")}</div>
          <div className="text-city-text">{agent.balance} CITY</div>
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-city-text">{translate("Recent Actions")}</h4>
          <div tabIndex={0} aria-label={translate("Recent Actions")} className="max-h-[200px] overflow-y-auto space-y-1">
            {timeline.slice(0, 20).map((entry, i) => (
              <div
                key={i}
                className={`p-2 rounded text-xs ${
                  entry.success === false
                    ? 'bg-red-500/10 border border-red-500/30'
                    : 'bg-city-border/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-city-text">{translate("Tick")}{" "}{entry.tick}</span>
                  {entry.action && (
                    <span className="text-city-accent">{entry.action}</span>
                  )}
                </div>
                <div className="text-city-text-muted">{translateLabel(entry.description)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export function ReplayPage() {
  useLocale();
  const range = useTickRange();
  const isLoading = useReplayLoading();
  const error = useReplayError();
  const snapshot = useSnapshot();
  const { setTickRange, setSnapshot, setCurrentTick, setLoading, setError } = useReplayStore();

  // Load initial data
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const range = await fetchTickRange();
      setTickRange(range);

      // Load snapshot at max tick
      if (range.availableTicks?.length) {
        const snapshot = await fetchWorldSnapshot(range.maxTick);
        setSnapshot(snapshot);
        setCurrentTick(range.maxTick);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load replay data');
    } finally {
      setLoading(false);
    }
  }, [setTickRange, setSnapshot, setCurrentTick, setLoading, setError]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  if (isLoading && !snapshot) {
    return (
      <div className="min-h-screen bg-city-bg flex items-center justify-center">
        <div className="text-city-text">{translate("Loading replay data...")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-city-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">{formatError(error)}</div>
          <button
            onClick={loadInitialData}
            className="px-4 py-2 bg-city-accent text-gray-950 rounded hover:bg-city-accent/80"
          >{translate("Retry")}</button>
          <button className="ml-3 underline" onClick={() => useEditorStore.getState().setMode('editor')}>{translate("Exit replay")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="feature-page min-h-full bg-city-bg flex flex-col">
      {/* Header */}
      <div className="feature-header bg-city-surface border-b border-city-border p-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text">{translate("Sim Agents")}</h1>
          <span className="text-xs text-city-text-muted">{translate("Time Travel Replay")}</span>
        </div>
      </div>

      <p role="note" className="p-3 text-sm text-city-text-muted">{translate("Saved replay:")}{" "}{range?.availableTicks?.length ?? 0}{" "}{translate("frames;")}{" "}{range?.missingTicks ?? 0}{" "}{translate("missing ticks inside the saved range. Events per frame are bounded; this is not a complete event archive.")}{" "}{!!range?.unscopedFrames && translate("{count} legacy frames have no world identity; their association cannot be verified.", { count: range.unscopedFrames })}</p>
      {/* Controls */}
      <PlaybackControls />
      <TickSlider />

      <ReplayEntitySelector />
      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row p-4 gap-4 min-w-0">
        {/* Left: Canvas */}
        <div className="w-full lg:w-auto lg:flex-shrink-0 min-w-0">
          <ReplayCanvas />
        </div>

        {/* Right: Sidebar */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Agent panel */}
          <div className="bg-city-surface border border-city-border rounded-lg flex-1 overflow-hidden">
            <AgentStatePanel />
          </div>

          {/* Event timeline */}
          <div className="bg-city-surface border border-city-border rounded-lg max-h-[300px] overflow-hidden">
            <EventTimeline />
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-city-surface p-4 rounded-lg shadow-lg">
            <div className="text-city-text">{translate("Loading...")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
