import { useWorldStore, useAliveAgents } from '../stores/world';
import type { ConnectionStatus } from '../hooks/useSSE';

interface WorldStatsProps {
  connectionStatus: ConnectionStatus;
}

export function WorldStats({ connectionStatus }: WorldStatsProps) {
  const tick = useWorldStore((s) => s.tick);
  const aliveAgents = useAliveAgents();

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
    <>
      {/* Left side - Logo and stats */}
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-city-accent/20 border border-city-accent/30 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-city-accent"
            >
              <path d="M3 21h18" />
              <path d="M9 8h1" />
              <path d="M9 12h1" />
              <path d="M9 16h1" />
              <path d="M14 8h1" />
              <path d="M14 12h1" />
              <path d="M14 16h1" />
              <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text tracking-tight">
            Agents City
          </h1>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-city-border/50" />

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-city-text-muted">Tick</span>
            <span className="font-mono text-city-text bg-city-bg/50 px-1.5 py-0.5 rounded">
              {tick.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-city-text-muted">Agents</span>
            <span className="font-mono text-city-accent font-medium">
              {aliveAgents.length}
            </span>
          </div>
        </div>
      </div>

      {/* Right side - Connection status */}
      <div className={`status-badge ${status.class}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} />
        {status.text}
      </div>
    </>
  );
}
