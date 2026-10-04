import { translate, useLocale } from '../i18n';
import { useState, useEffect } from 'react';
import { useWorldStore, useAliveAgents } from '../stores/world';
import type { ConnectionStatus } from '../hooks/useEngine';
import { actionsPerSimMinute, useAllAgentStats } from '../stores/agentStats';

interface WorldStatsProps {
  connectionStatus: ConnectionStatus;
}

export function WorldStats({ connectionStatus }: WorldStatsProps) {
  useLocale();
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
          text: translate('Engine connected'),
          dotClass: 'bg-status-success status-pulse',
        };
      case 'connecting':
        return {
          class: 'status-connecting',
          text: translate('Connecting'),
          dotClass: 'bg-status-warning status-pulse',
        };
      default:
        return {
          class: 'status-disconnected',
          text: translate('Offline'),
          dotClass: 'bg-status-error',
        };
    }
  };

  const status = getStatusConfig();

  return (
    <div className="world-stats flex items-center gap-2 flex-wrap text-xs">
      {/* Tick */}
      <div className="flex items-center gap-1.5">
        <span className="text-city-text-muted">{translate('Tick')}</span>
        <span className="font-mono text-city-text font-medium">{tick}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-city-border/50" />

      {/* Agents */}
      <div className="flex items-center gap-1.5">
        <span className="text-city-text-muted">{translate('Agents')}</span>
        <span className="font-mono text-city-accent font-medium">{aliveAgents.length}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-city-border/50" />

      {/* Status badges */}
      {testMode && (
        <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 text-xs font-medium">{translate("TEST")}</span>
      )}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-city-surface/50 ${status.class}`}>
        <span className={`w-2 h-2 rounded-full ${status.dotClass}`} />
        <span className="text-xs font-medium">{status.text}</span>
      </div>

    </div>
  );
}
