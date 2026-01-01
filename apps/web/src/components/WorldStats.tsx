import { useState, useEffect } from 'react';
import { useWorldStore, useAliveAgents } from '../stores/world';
import type { ConnectionStatus } from '../hooks/useSSE';

interface WorldStatsProps {
  connectionStatus: ConnectionStatus;
}

export function WorldStats({ connectionStatus }: WorldStatsProps) {
  const tick = useWorldStore((s) => s.tick);
  const aliveAgents = useAliveAgents();
  const [testMode, setTestMode] = useState(false);

  // Fetch test mode status on mount
  useEffect(() => {
    fetch('/api/test/mode')
      .then((res) => res.json())
      .then((data) => setTestMode(data.testMode))
      .catch(() => {});
  }, []);

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          class: 'status-connected',
          text: 'Live',
          dotClass: 'bg-status-success status-pulse',
        };
      case 'connecting':
        return {
          class: 'status-connecting',
          text: 'Connecting',
          dotClass: 'bg-status-warning status-pulse',
        };
      default:
        return {
          class: 'status-disconnected',
          text: 'Offline',
          dotClass: 'bg-status-error',
        };
    }
  };

  const status = getStatusConfig();

  return (
    <div className="flex items-center gap-3 sm:gap-4 text-xs">
      {/* Tick */}
      <div className="flex items-center gap-1.5">
        <span className="text-city-text-muted">Tick</span>
        <span className="font-mono text-city-text font-medium">{tick}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-city-border/50" />

      {/* Agents */}
      <div className="flex items-center gap-1.5">
        <span className="text-city-text-muted">Agents</span>
        <span className="font-mono text-city-accent font-medium">{aliveAgents.length}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-city-border/50" />

      {/* Status badges */}
      {testMode && (
        <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 text-xs font-medium">
          TEST
        </span>
      )}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-city-surface/50 ${status.class}`}>
        <span className={`w-2 h-2 rounded-full ${status.dotClass}`} />
        <span className="text-xs font-medium">{status.text}</span>
      </div>
    </div>
  );
}
