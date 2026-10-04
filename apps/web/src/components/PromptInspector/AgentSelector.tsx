import { formatActionLabel } from '../../i18n';
import { useLocale, translate } from '../../i18n';
import { useEffect, useState } from 'react';
import { promptLogDescriptors } from '../../services/promptLogs';
/**
 * AgentSelector - Dropdown to select an agent for inspection
 *
 * Uses world store to get list of agents
 */

import { useWorldStore } from '../../stores/world';
import {
  usePromptInspectorStore,
  useSelectedAgentId,
} from '../../stores/promptInspectorStore';

export function AgentSelector() {
  useLocale();
  const agents = useWorldStore((state) => state.agents);
  const selectedAgentId = useSelectedAgentId();
  const [savedAgents, setSavedAgents] = useState<Array<{ id: string; llmType: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    void promptLogDescriptors().then(logs => {
      if (!cancelled) setSavedAgents([...new Map(logs.filter(log => log.agent).map(log => [log.agent!, { id: log.agent!, llmType: String(log.summary?.llmType ?? 'unknown') }])).values()]);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const { setSelectedAgent } = usePromptInspectorStore();

  return (
    <div>
      <label className="block text-xs font-medium text-city-text-muted mb-1.5">{translate("Select Agent")}</label>
      <select
        aria-label={translate("Select Agent")}
        value={selectedAgentId ?? ''}
        onChange={(e) => setSelectedAgent(e.target.value || null)}
        className="w-full px-3 py-2 bg-city-bg border border-city-border rounded text-sm text-city-text focus:outline-none focus:border-city-accent"
      >
        <option value="">{translate("-- Choose an agent --")}</option>
        {savedAgents.filter(saved => !agents.some(agent => agent.id === saved.id)).map(agent => (
          <option key={agent.id} value={agent.id}>{agent.llmType} ({agent.id.slice(0, 8)}{translate(") - saved")}</option>
        ))}
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name ?? agent.llmType} ({agent.id.slice(0, 8)}) - {formatActionLabel(agent.state)}
          </option>
        ))}
      </select>

      {agents.length === 0 && savedAgents.length === 0 && (
        <p className="text-xs text-city-text-muted mt-2">{translate("No agents found. Start a simulation to see agents.")}</p>
      )}

      {selectedAgentId && (
        <div className="mt-2 p-2 bg-city-bg rounded border border-city-border/50">
          {(() => {
            const agent = agents.find((a) => a.id === selectedAgentId);
            if (!agent) return null;
            return (
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-city-text-muted">{translate("Type:")}</span>
                  <span className="text-city-text font-medium">{agent.llmType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-city-text-muted">{translate("State:")}</span>
                  <span className="text-city-text">{formatActionLabel(agent.state)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-city-text-muted">{translate("Position:")}</span>
                  <span className="text-city-text">({agent.x}, {agent.y})</span>
                </div>
                {agent.personality && (
                  <div className="flex justify-between">
                    <span className="text-city-text-muted">{translate("Personality:")}</span>
                    <span className="text-city-text">{agent.personality}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
