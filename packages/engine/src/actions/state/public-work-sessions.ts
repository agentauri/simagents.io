export interface PublicWorkSession {
  startTick: number;
  taskType: string;
  ticksWorked: number;
}

let sessions = new Map<string, PublicWorkSession>();

export function setBackingStore(map: Map<string, PublicWorkSession>): void {
  sessions = map;
}

export function get(agentId: string): PublicWorkSession | undefined {
  return sessions.get(agentId);
}

export function set(agentId: string, session: PublicWorkSession): void {
  sessions.set(agentId, session);
}

export function remove(agentId: string): boolean {
  return sessions.delete(agentId);
}

export function serialize(): Array<[string, PublicWorkSession]> {
  return [...sessions.entries()].map(([agentId, session]) => [agentId, { ...session }]);
}

export function restore(entries: Array<[string, PublicWorkSession]>): void {
  sessions.clear();
  for (const [agentId, session] of entries) {
    sessions.set(agentId, { ...session });
  }
}

export function reset(): void {
  sessions.clear();
}
