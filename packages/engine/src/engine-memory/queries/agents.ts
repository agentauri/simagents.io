/**
 * Agent queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/agents.ts` so engine code can swap
 * the backing store without changes.
 */

import { v4 as uuid } from 'uuid';
import type { Agent, NewAgent } from '../../db/schema';
import { store } from '../store';

/** Stable ordering matching the SQL `orderBy` for deterministic iteration. */
function orderAgents(list: Agent[]): Agent[] {
  return [...list].sort(
    (a, b) =>
      a.llmType.localeCompare(b.llmType) ||
      a.x - b.x ||
      a.y - b.y ||
      a.state.localeCompare(b.state) ||
      a.color.localeCompare(b.color) ||
      a.balance - b.balance ||
      a.health - b.health ||
      a.energy - b.energy ||
      a.hunger - b.hunger
  );
}

export async function getAllAgents(): Promise<Agent[]> {
  return orderAgents([...store.agents.values()]);
}

export async function getAliveAgents(): Promise<Agent[]> {
  return orderAgents([...store.agents.values()].filter((a) => a.state !== 'dead'));
}

export async function getAgentById(id: string): Promise<Agent | undefined> {
  return store.agents.get(id);
}

export async function getAgentsAtPosition(x: number, y: number): Promise<Agent[]> {
  return [...store.agents.values()]
    .filter((a) => a.x === x && a.y === y && a.state !== 'dead')
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function createAgent(agent: NewAgent): Promise<Agent> {
  const now = new Date();
  const full: Agent = {
    id: agent.id ?? uuid(),
    tenantId: agent.tenantId ?? null,
    llmType: agent.llmType,
    x: agent.x ?? 0,
    y: agent.y ?? 0,
    hunger: agent.hunger ?? 100,
    energy: agent.energy ?? 100,
    health: agent.health ?? 100,
    balance: agent.balance ?? 100,
    state: agent.state ?? 'idle',
    color: agent.color ?? '#888888',
    personality: agent.personality ?? null,
    createdAt: agent.createdAt ?? now,
    updatedAt: agent.updatedAt ?? now,
    diedAt: agent.diedAt ?? null,
    ...((agent as NewAgent & { name?: string }).name ? { name: (agent as NewAgent & { name?: string }).name } : {}),
  };
  store.agents.set(full.id, full);
  return full;
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | undefined> {
  const agent = store.agents.get(id);
  if (!agent) return undefined;
  const updated: Agent = { ...agent, ...updates, updatedAt: new Date() };
  store.agents.set(id, updated);
  return updated;
}

export async function updateAgentNeeds(
  id: string,
  hunger: number,
  energy: number,
  health: number
): Promise<Agent | undefined> {
  return updateAgent(id, { hunger, energy, health });
}

export async function updateAgentPosition(id: string, x: number, y: number): Promise<Agent | undefined> {
  return updateAgent(id, { x, y });
}

export async function updateAgentBalance(id: string, balance: number): Promise<Agent | undefined> {
  return updateAgent(id, { balance });
}

export async function killAgent(id: string): Promise<Agent | undefined> {
  return updateAgent(id, { state: 'dead', diedAt: new Date() });
}

export async function deleteAllAgents(): Promise<void> {
  store.agents.clear();
}
