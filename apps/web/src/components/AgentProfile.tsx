import type { ReactNode } from 'react';
import { useAgent, useWorldStore } from '../stores/world';

interface AgentProfileProps {
  agentId: string;
}

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  color: string;
  icon: ReactNode;
}

function StatBar({ label, value, max = 100, color, icon }: StatBarProps) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  const isLow = percent < 30;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5 text-city-text-muted">
          {icon}
          <span>{label}</span>
        </div>
        <span className={`font-mono font-medium ${isLow ? 'text-status-error' : 'text-city-text'}`}>
          {Math.round(value)}
        </span>
      </div>
      <div className="stat-bar">
        <div
          className="stat-fill"
          style={{
            width: `${percent}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}

function getStateConfig(state: string) {
  switch (state) {
    case 'idle':
      return { bg: 'bg-city-border/50', text: 'text-city-text-muted', label: 'Idle' };
    case 'walking':
      return { bg: 'bg-status-success/20', text: 'text-status-success', label: 'Walking' };
    case 'working':
      return { bg: 'bg-status-warning/20', text: 'text-status-warning', label: 'Working' };
    case 'sleeping':
      return { bg: 'bg-status-info/20', text: 'text-status-info', label: 'Sleeping' };
    case 'dead':
      return { bg: 'bg-status-error/20', text: 'text-status-error', label: 'Dead' };
    default:
      return { bg: 'bg-city-border/50', text: 'text-city-text-muted', label: state };
  }
}

export function AgentProfile({ agentId }: AgentProfileProps) {
  const agent = useAgent(agentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);

  if (!agent) {
    return (
      <div className="p-6 text-city-text-muted text-sm text-center">
        <p>Agent not found</p>
      </div>
    );
  }

  const stateConfig = getStateConfig(agent.state);

  return (
    <div className="p-4 space-y-5">
      {/* Header with avatar */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar with gradient ring */}
          <div className="avatar-ring">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ backgroundColor: agent.color }}
            >
              {agent.llmType.charAt(0).toUpperCase()}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-city-text capitalize text-base">
              {agent.llmType}
            </h3>
            <span className="text-xs text-city-text-muted font-mono">
              {agent.id.slice(0, 8)}...
            </span>
          </div>
        </div>
        <button
          onClick={() => selectAgent(null)}
          className="w-6 h-6 rounded flex items-center justify-center text-city-text-muted hover:text-city-accent hover:bg-city-surface-hover transition-colors"
          title="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* State and Position */}
      <div className="flex items-center gap-3">
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${stateConfig.bg} ${stateConfig.text} border border-current/20`}
        >
          {stateConfig.label}
        </span>
        <span className="text-xs text-city-text-muted">
          at{' '}
          <span className="font-mono text-city-text">
            ({agent.x}, {agent.y})
          </span>
        </span>
      </div>

      {/* Stats Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-medium text-city-text-muted uppercase tracking-wider">
          Vitals
        </h4>
        <div className="space-y-3">
          <StatBar
            label="Hunger"
            value={agent.hunger}
            color={agent.hunger < 30 ? '#e07a5f' : '#81b29a'}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" />
                <line x1="10" y1="1" x2="10" y2="4" />
                <line x1="14" y1="1" x2="14" y2="4" />
              </svg>
            }
          />
          <StatBar
            label="Energy"
            value={agent.energy}
            color={agent.energy < 30 ? '#f2cc8f' : '#6a8caf'}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            }
          />
          <StatBar
            label="Health"
            value={agent.health}
            color={agent.health < 30 ? '#e07a5f' : '#81b29a'}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Balance Section */}
      <div className="pt-4 border-t border-city-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-city-text-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <path d="M12 18V6" />
            </svg>
            <span className="text-xs font-medium">Balance</span>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-city-accent">
              {agent.balance.toLocaleString()}
            </span>
            <span className="text-xs text-city-text-muted ml-1">CITY</span>
          </div>
        </div>
      </div>
    </div>
  );
}
