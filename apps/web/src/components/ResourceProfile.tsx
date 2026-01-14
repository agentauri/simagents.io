import { useMemo } from 'react';
import { useWorldStore, useSelectedResource, useAgents, type BiomeType, BIOME_COLORS } from '../stores/world';

// Resource type configurations
const RESOURCE_CONFIG: Record<string, { color: string; icon: string; label: string; description: string }> = {
  food: { color: '#22c55e', icon: 'F', label: 'Food', description: 'Food resources restore hunger when gathered.' },
  energy: { color: '#eab308', icon: 'E', label: 'Energy', description: 'Energy resources restore energy when gathered.' },
  material: { color: '#a16207', icon: 'M', label: 'Material', description: 'Material resources can be traded or used for crafting.' },
};

export function ResourceProfile() {
  const resource = useSelectedResource();
  const agents = useAgents();
  const selectResource = useWorldStore((s) => s.selectResource);

  if (!resource) {
    return (
      <div className="p-6 text-city-text-muted text-sm text-center">
        <p>Resource not found</p>
      </div>
    );
  }

  const config = RESOURCE_CONFIG[resource.resourceType] || RESOURCE_CONFIG.food;
  const percent = Math.max(0, Math.min(100, (resource.currentAmount / resource.maxAmount) * 100));

  // Count agents at this resource location (memoized)
  const agentsHere = useMemo(
    () => agents.filter((a) => a.x === resource.x && a.y === resource.y && a.state !== 'dead'),
    [agents, resource.x, resource.y]
  );

  return (
    <div className="p-4 space-y-5">
      {/* Header with icon */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Resource icon */}
          <div className="avatar-ring">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: config.color }}
            >
              {config.icon}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-city-text text-base">
              {config.label} Resource
            </h3>
            <span className="text-xs text-city-text-muted">
              {resource.resourceType}
            </span>
          </div>
        </div>
        <button
          onClick={() => selectResource(null)}
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

      {/* Type badge and Position */}
      <div className="flex items-center gap-3">
        <span
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-current/20"
          style={{ backgroundColor: `${config.color}20`, color: config.color }}
        >
          {config.label}
        </span>
        <span className="text-xs text-city-text-muted">
          at{' '}
          <span className="font-mono text-city-text">
            ({resource.x}, {resource.y})
          </span>
        </span>
      </div>

      {/* Quantity Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-medium text-city-text-muted uppercase tracking-wider">
          Quantity
        </h4>

        {/* Amount bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-1.5 text-city-text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              <span>Amount</span>
            </div>
            <span className="font-mono font-medium text-city-text">
              {resource.currentAmount} / {resource.maxAmount}
            </span>
          </div>
          <div className="stat-bar">
            <div
              className="stat-fill"
              style={{
                width: `${percent}%`,
                backgroundColor: config.color,
                boxShadow: `0 0 8px ${config.color}40`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Biome Section (if available) */}
      {resource.biome && (
        <div className="flex items-center justify-between py-2 border-t border-city-border/30">
          <div className="flex items-center gap-2 text-city-text-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c4.97 0 9-2.24 9-5v-3.5c0-1.83-2.02-3.41-5-4.13" />
              <path d="M12 22c-4.97 0-9-2.24-9-5v-3.5c0-1.83 2.02-3.41 5-4.13" />
              <circle cx="12" cy="8" r="5" />
            </svg>
            <span className="text-xs">Biome</span>
          </div>
          <span
            className="text-sm font-medium capitalize"
            style={{ color: BIOME_COLORS[resource.biome as BiomeType] || '#888' }}
          >
            {resource.biome}
          </span>
        </div>
      )}

      {/* Agents at location */}
      {agentsHere.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-city-border/30">
          <h4 className="text-xs font-medium text-city-text-muted uppercase tracking-wider">
            Agents Here ({agentsHere.length})
          </h4>
          <div className="space-y-2">
            {agentsHere.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 p-2 rounded bg-city-surface-hover/50"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.llmType.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-city-text capitalize">
                  {agent.llmType}
                </span>
                <span className="text-xs text-city-text-muted ml-auto">
                  {agent.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resource Type Info */}
      <div className="pt-4 border-t border-city-border/30">
        <p className="text-xs text-city-text-muted">{config.description}</p>
      </div>
    </div>
  );
}
