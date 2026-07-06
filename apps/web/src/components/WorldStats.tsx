import { useState, useEffect } from 'react';
import { useWorldStore, useAliveAgents } from '../stores/world';
import type { ConnectionStatus } from '../hooks/useEngine';
import { actionsPerSimMinute, useAllAgentStats } from '../stores/agentStats';

interface WorldStatsProps {
  connectionStatus: ConnectionStatus;
}

export function WorldStats({ connectionStatus }: WorldStatsProps) {
  const tick = useWorldStore((s) => s.tick);
  const aliveAgents = useAliveAgents();
  const allStats = useAllAgentStats();
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    setTestMode(false);
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

      {aliveAgents.length > 0 && (
        <>
          <div className="hidden xl:block w-px h-4 bg-city-border/50" />
          <div className="hidden xl:flex items-center gap-1.5 max-w-[48vw] overflow-x-auto">
            {aliveAgents.map((agent) => {
              const stats = allStats[agent.id];
              const model = stats?.lastModelId ?? agent.llmType;
              return (
                <div
                  key={agent.id}
                  className="grid grid-cols-[minmax(4rem,7rem)_minmax(5rem,8rem)_3.5rem_4rem] gap-2 items-center px-2 py-1 rounded border border-city-border/40 bg-city-surface/40 text-[10px] shrink-0"
                  title={`${agent.name ?? agent.llmType}: ${model}`}
                >
                  <span className="truncate text-city-text">{agent.name ?? agent.llmType}</span>
                  <span className="truncate text-city-text-muted font-mono">{model}</span>
                  <span className="text-city-accent font-mono">{actionsPerSimMinute(stats).toFixed(2)}</span>
                  <span className="text-city-text-muted font-mono">
                    {stats?.latencySamples ? `${Math.round(stats.avgLatencyMs)}ms` : '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
