/**
 * Mobile Decision Log - Full-screen version for mobile
 */

import { memo, useMemo } from 'react';
import { useAgents, useEvents } from '../../stores/world';

export const MobileDecisionLog = memo(function MobileDecisionLog() {
  const events = useEvents();
  const agents = useAgents();

  // Create agent map for O(1) lookups
  const agentMap = useMemo(() => {
    const map = new Map<string, typeof agents[0]>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  // Filter decision events
  const actionTypes = ['agent_move', 'agent_work', 'agent_sleep', 'agent_buy', 'agent_consume'];
  const decisionEvents = useMemo(() =>
    events
      .filter((e) => actionTypes.includes(e.type))
      .slice(0, 50),
    [events]
  );

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-city-text mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Decisions ({decisionEvents.length})
      </h3>

      <div className="space-y-2">
        {decisionEvents.map((event) => {
          const agent = agentMap.get(event.agentId || '');
          const reasoning = event.payload?.reasoning as string;
          const action = (event.payload?.action as string) || event.type.replace('agent_', '');

          return (
            <div
              key={event.id}
              className="p-3 bg-city-surface rounded-lg border border-city-border/50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-city-text-muted font-mono bg-city-bg px-1.5 py-0.5 rounded">
                    T{event.tick}
                  </span>
                  {agent && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: agent.color }}
                      />
                      <span className="text-city-text text-xs font-medium capitalize">
                        {agent.llmType}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-city-accent font-medium text-xs capitalize">
                  {action}
                </span>
              </div>
              {reasoning && (
                <p className="text-[11px] text-city-text-muted/80 italic line-clamp-3">
                  {reasoning}
                </p>
              )}
            </div>
          );
        })}

        {decisionEvents.length === 0 && (
          <div className="text-center text-city-text-muted py-8 text-sm">
            No decisions yet
          </div>
        )}
      </div>
    </div>
  );
});
