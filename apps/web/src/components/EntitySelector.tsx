import { useAllAgentStats } from '../stores/agentStats';
import { useMemo } from 'react';
import { useAgents, useResourceSpawns, useWorldStore } from '../stores/world';
import { translate, translateLabel, useLocale } from '../i18n';
/** A native keyboard/screen-reader alternative to clicking entities on either canvas. */
export function EntitySelector() {
  useLocale();
  const stats = useAllAgentStats();
  const agents = useAgents(), resources = useResourceSpawns();
  const selectedAgent = useWorldStore(state => state.selectedAgentId), selectedResource = useWorldStore(state => state.selectedResourceId);
  const selectAgent = useWorldStore(state => state.selectAgent), selectResource = useWorldStore(state => state.selectResource);
  const value = selectedAgent ? `agent:${selectedAgent}` : selectedResource ? `resource:${selectedResource}` : '';
  const ordered = useMemo(() => [...agents].sort((a, b) => (a.name ?? a.llmType).localeCompare(b.name ?? b.llmType)), [agents]);
  return <label className="entity-selector">{translate('Inspect agent or resource')}
    <select aria-label={translate('Inspect agent or resource')} value={value} onChange={event => {
      const [kind, ...parts] = event.target.value.split(':'); const id = parts.join(':');
      if (kind === 'agent') selectAgent(id);
      else if (kind === 'resource') selectResource(id);
      else selectAgent(null);
    }}>
      <option value="">{translate('Choose an entity')}</option>
      <optgroup label={translate('Agents')}>{ordered.map(agent => <option key={agent.id} value={`agent:${agent.id}`}>{agent.name ?? agent.llmType} · {stats[agent.id]?.lastModelId ?? agent.llmType} · ({agent.x}, {agent.y})</option>)}</optgroup>
      <optgroup label={translate('Resources')}>{resources.map(resource => <option key={resource.id} value={`resource:${resource.id}`}>{translateLabel(resource.resourceType.charAt(0).toUpperCase() + resource.resourceType.slice(1))} · ({resource.x}, {resource.y}) · {resource.currentAmount.toFixed(1)}</option>)}</optgroup>
    </select>
  </label>;
}
