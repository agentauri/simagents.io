/**
 * Mobile Agent List - Full-screen version of agent summary for mobile
 */

import { memo } from 'react';
import { useAgents, useWorldStore } from '../../stores/world';

export const MobileAgentList = memo(function MobileAgentList() {
  const agents = useAgents();
  const selectAgent = useWorldStore((s) => s.selectAgent);

  const aliveAgents = agents.filter(a => a.state !== 'dead');
  const sortedAgents = [...aliveAgents].sort((a, b) => b.balance - a.balance);

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-city-text mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Agents ({sortedAgents.length})
      </h3>

      <div className="space-y-2">
        {sortedAgents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => selectAgent(agent.id)}
            className="w-full p-3 bg-city-surface rounded-lg border border-city-border/50 flex items-center justify-between hover:bg-city-surface-hover active:bg-city-surface-hover transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: agent.color }}
              >
                {agent.llmType.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-city-text font-medium capitalize text-sm">
                  {agent.llmType}
                </div>
                <div className="text-city-text-muted text-xs">
                  HP: {Math.round(agent.health)} | E: {Math.round(agent.energy)} | H: {Math.round(agent.hunger)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-city-accent font-mono font-medium">
                {agent.balance}
              </div>
              <div className="text-city-text-muted text-[10px]">CITY</div>
            </div>
          </button>
        ))}

        {sortedAgents.length === 0 && (
          <div className="text-center text-city-text-muted py-8 text-sm">
            No active agents
          </div>
        )}
      </div>
    </div>
  );
});
