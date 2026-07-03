/**
 * In-Memory Store — Phase 1 spike
 *
 * A database-free backing store for the simulation engine. It mirrors the
 * subset of Drizzle tables the core tick loop needs (agents, world state,
 * resource spawns, shelters, inventory, events) as plain in-memory
 * collections.
 *
 * The in-memory query modules under `./queries/*` operate on this store and
 * preserve the exact signatures of `db/queries/*`, so engine code can run
 * unchanged against memory instead of PostgreSQL.
 *
 * NOTE (spike scope): types are imported type-only from `db/schema` — that is
 * safe because importing the schema does not open a database connection
 * (`db/index.ts`, which instantiates the postgres client, is never imported).
 */

import type {
  Agent,
  WorldState,
  ResourceSpawn,
  Shelter,
  InventoryItem,
  Event,
  AgentMemory,
  AgentRelationship,
  JobOffer,
  Employment,
  ReproductionState,
  AgentLineage,
  GossipEvent,
  AgentCredential,
  InformationBelief,
  AgentRole,
  RetaliationChain,
  AgentClaim,
  AgentKnowledge,
  LocationName,
  PuzzleGame,
  PuzzleTeam,
  PuzzleFragment,
  PuzzleParticipant,
  PuzzleAttempt,
  LedgerEntry,
} from '../db/schema';
import type { PublicWorkSession } from '../actions/state/public-work-sessions';
import {
  reset as resetForageCooldowns,
  setBackingStore as setForageCooldownBackingStore,
} from '../actions/state/forage-cooldowns';
import {
  reset as resetPublicWorkSessions,
  setBackingStore as setPublicWorkSessionBackingStore,
} from '../actions/state/public-work-sessions';

export interface InMemoryStore {
  worldState: WorldState;
  agents: Map<string, Agent>;
  resourceSpawns: Map<string, ResourceSpawn>;
  shelters: Map<string, Shelter>;
  /** Inventory keyed by `${agentId}:${itemType}` (mirrors the unique index). */
  inventory: Map<string, InventoryItem>;
  /** Append-only event log. */
  events: Event[];
  /** Agent episodic memories keyed by memory id. */
  memories: Map<string, AgentMemory>;
  /** Relationships keyed by `${agentId}:${otherAgentId}` (mirrors the unique index). */
  relationships: Map<string, AgentRelationship>;
  /** Stigmergy scents keyed by `${x}:${y}` (replaces the Redis scent keys). */
  scents: Map<string, { agentId: string; tick: number; strength: number }>;
  /** Per-agent/location forage cooldowns. */
  forageCooldowns: Map<string, number>;
  /** Public-work progress keyed by agent id. */
  publicWorkSessions: Map<string, PublicWorkSession>;
  /** Append-only double-entry ledger rows. */
  ledgerEntries: LedgerEntry[];

  // --- Employment ---
  jobOffers: Map<string, JobOffer>;
  employments: Map<string, Employment>;

  // --- Reproduction ---
  reproductionStates: Map<string, ReproductionState>;
  /** Keyed by lineage `id`; `agentId` is unique within. */
  agentLineages: Map<string, AgentLineage>;

  // --- Gossip (bigint identity → array + counter) ---
  gossipEvents: GossipEvent[];
  nextGossipId: number;

  // --- Credentials ---
  agentCredentials: Map<string, AgentCredential>;

  // --- Information beliefs (cascade experiments) ---
  informationBeliefs: Map<string, InformationBelief>;

  // --- Roles & conflict ---
  /** Keyed by `agentId` (unique index). */
  agentRoles: Map<string, AgentRole>;
  retaliationChains: RetaliationChain[];

  // --- Claims & knowledge ---
  agentClaims: Map<string, AgentClaim>;
  agentKnowledge: Map<string, AgentKnowledge>;
  /** Emergent location names keyed by id. */
  locationNames: Map<string, LocationName>;

  // --- Puzzles ---
  puzzleGames: Map<string, PuzzleGame>;
  puzzleTeams: Map<string, PuzzleTeam>;
  puzzleFragments: Map<string, PuzzleFragment>;
  puzzleParticipants: Map<string, PuzzleParticipant>;
  puzzleAttempts: Map<string, PuzzleAttempt>;

  /** Monotonic counters replacing DB identity/sequence columns. */
  nextEventId: number;
  nextEventVersion: number;
}

export const STORE_EVENT_CAP = 10_000;

const WORLD_STATE_ID = 1;

function freshWorldState(): WorldState {
  return {
    id: WORLD_STATE_ID,
    currentTick: 0,
    startedAt: new Date(),
    lastTickAt: null,
    isPaused: false,
  };
}

/**
 * The singleton store for the current simulation. In the browser build this
 * is hydrated from / snapshotted to localStorage (see engine/persistence.ts);
 * in tests it lives only in memory for the duration of a run.
 */
export const store: InMemoryStore = {
  worldState: freshWorldState(),
  agents: new Map(),
  resourceSpawns: new Map(),
  shelters: new Map(),
  inventory: new Map(),
  events: [],
  memories: new Map(),
  relationships: new Map(),
  scents: new Map(),
  forageCooldowns: new Map(),
  publicWorkSessions: new Map(),
  ledgerEntries: [],
  jobOffers: new Map(),
  employments: new Map(),
  reproductionStates: new Map(),
  agentLineages: new Map(),
  gossipEvents: [],
  nextGossipId: 1,
  agentCredentials: new Map(),
  informationBeliefs: new Map(),
  agentRoles: new Map(),
  retaliationChains: [],
  agentClaims: new Map(),
  agentKnowledge: new Map(),
  locationNames: new Map(),
  puzzleGames: new Map(),
  puzzleTeams: new Map(),
  puzzleFragments: new Map(),
  puzzleParticipants: new Map(),
  puzzleAttempts: new Map(),
  nextEventId: 1,
  nextEventVersion: 1,
};

setForageCooldownBackingStore(store.forageCooldowns);
setPublicWorkSessionBackingStore(store.publicWorkSessions);

/** Key helper for the inventory map (matches the agent+item unique index). */
export function inventoryKey(agentId: string, itemType: string): string {
  return `${agentId}:${itemType}`;
}

/** Key helper for the relationships map (matches the agent-pair unique index). */
export function relationshipKey(agentId: string, otherAgentId: string): string {
  return `${agentId}:${otherAgentId}`;
}

/** Wipe the store back to an empty world (mirrors resetWorldData). */
export function resetStore(): void {
  store.worldState = freshWorldState();
  store.agents.clear();
  store.resourceSpawns.clear();
  store.shelters.clear();
  store.inventory.clear();
  store.events = [];
  store.memories.clear();
  store.relationships.clear();
  store.scents.clear();
  resetForageCooldowns();
  resetPublicWorkSessions();
  store.ledgerEntries = [];
  store.jobOffers.clear();
  store.employments.clear();
  store.reproductionStates.clear();
  store.agentLineages.clear();
  store.gossipEvents = [];
  store.nextGossipId = 1;
  store.agentCredentials.clear();
  store.informationBeliefs.clear();
  store.agentRoles.clear();
  store.retaliationChains = [];
  store.agentClaims.clear();
  store.agentKnowledge.clear();
  store.locationNames.clear();
  store.puzzleGames.clear();
  store.puzzleTeams.clear();
  store.puzzleFragments.clear();
  store.puzzleParticipants.clear();
  store.puzzleAttempts.clear();
  store.nextEventId = 1;
  store.nextEventVersion = 1;
  for (const hook of storeResetHooks) hook();
}

/**
 * Modules that keep simulation state OUTSIDE the store (e.g. the continuous-time
 * engine's vitals metadata and heartbeat boundaries) register a hook here so
 * resetStore() also resets them. Keeps the dependency direction engine -> store.
 */
const storeResetHooks: Array<() => void> = [];

export function registerStoreResetHook(hook: () => void): void {
  storeResetHooks.push(hook);
}
