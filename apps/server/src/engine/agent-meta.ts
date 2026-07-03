import { registerStoreResetHook } from '../engine-memory/store';

export interface AgentEngineMeta {
  busyUntil: number;
}

const agentMetaById = new Map<string, AgentEngineMeta>();

registerStoreResetHook(() => resetAgentMeta());

export function getAgentMeta(agentId: string): AgentEngineMeta | undefined {
  const meta = agentMetaById.get(agentId);
  return meta ? { ...meta } : undefined;
}

export function getAgentBusyUntil(agentId: string): number {
  return agentMetaById.get(agentId)?.busyUntil ?? 0;
}

export function setAgentBusyUntil(agentId: string, busyUntil: number): void {
  agentMetaById.set(agentId, { busyUntil: Math.max(0, busyUntil) });
}

export function deleteAgentMeta(agentId: string): void {
  agentMetaById.delete(agentId);
}

export function resetAgentMeta(): void {
  agentMetaById.clear();
}

export function serializeAgentMeta(): Array<[string, AgentEngineMeta]> {
  return [...agentMetaById.entries()].map(([agentId, meta]) => [agentId, { ...meta }]);
}

export function restoreAgentMeta(entries: Array<[string, AgentEngineMeta]>): void {
  agentMetaById.clear();
  for (const [agentId, meta] of entries) {
    agentMetaById.set(agentId, { busyUntil: Math.max(0, meta.busyUntil) });
  }
}

export function sweepAgentMeta(isAlive: (agentId: string) => boolean): number {
  let removed = 0;
  for (const agentId of agentMetaById.keys()) {
    if (!isAlive(agentId)) {
      agentMetaById.delete(agentId);
      removed++;
    }
  }
  return removed;
}
