import { translate, translateLabel, formatActionLabel } from './index';
import type { WorldEvent } from '../stores/world';
const technical = new Set(['needs_updated', 'needs_warning', 'items_spoiled', 'balance_changed', 'minute_elapsed', 'tick_start', 'tick_end', 'agent_born', 'agent_died', 'agent_spawned', 'resource_regenerated', 'resources_regenerated', 'needs_decay', 'hunger_decay', 'energy_decay', 'health_decay', 'metrics_snapshot', 'world_snapshot', 'puzzle_created', 'puzzle_expired']);
export function eventKindLabel(event: WorldEvent): string {
  if (event.type === 'action_failed' || (typeof event.payload.action === 'string' && event.type === `agent_${event.payload.action}`)) return translate('Decision');
  return translate(technical.has(event.type) ? 'Technical event' : 'Interaction');
}
export function eventLabel(event: WorldEvent): string {
  if (typeof event.payload.action === 'string' && event.type === `agent_${event.payload.action}`) return formatActionLabel(event.payload.action);
  const label = event.type.replace(/^agent_/, '').replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  return translateLabel(label || 'Unknown');
}
