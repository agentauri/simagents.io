import type { Agent, Location } from '../db/schema';

export interface CachedWorldState {
  tick: number;
  timestamp: number;
  agentCount: number;
  isPaused: boolean;
}

let cachedWorldState: CachedWorldState | null = null;
let cachedTick = 0;
const cachedAgents = new Map<string, Agent>();
const cachedLocations = new Map<string, Location>();

export async function setCachedWorldState(state: CachedWorldState): Promise<void> {
  cachedWorldState = state;
}

export async function getCachedWorldState(): Promise<CachedWorldState | null> {
  return cachedWorldState;
}

export async function setCachedTick(tick: number): Promise<void> {
  cachedTick = tick;
}

export async function getCachedTick(): Promise<number> {
  return cachedTick;
}

export async function setCachedAgent(agent: Agent): Promise<void> {
  cachedAgents.set(agent.id, agent);
}

export async function getCachedAgent(id: string): Promise<Agent | null> {
  return cachedAgents.get(id) ?? null;
}

export async function getAllCachedAgents(): Promise<Agent[]> {
  return [...cachedAgents.values()];
}

export async function removeCachedAgent(id: string): Promise<void> {
  cachedAgents.delete(id);
}

export async function setCachedLocation(location: Location): Promise<void> {
  cachedLocations.set(location.id, location);
}

export async function getCachedLocation(id: string): Promise<Location | null> {
  return cachedLocations.get(id) ?? null;
}

export async function getAllCachedLocations(): Promise<Location[]> {
  return [...cachedLocations.values()];
}

export async function setCachedAgents(agents: Agent[]): Promise<void> {
  for (const agent of agents) {
    cachedAgents.set(agent.id, agent);
  }
}

export async function setCachedLocations(locations: Location[]): Promise<void> {
  for (const location of locations) {
    cachedLocations.set(location.id, location);
  }
}

export async function clearCache(): Promise<void> {
  cachedWorldState = null;
  cachedTick = 0;
  cachedAgents.clear();
  cachedLocations.clear();
}
