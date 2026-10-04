import { SimEngine } from '../../packages/engine/src/engine/engine';
import { setRuntimeConfig, resetRuntimeConfig, CONFIG } from '../../packages/engine/src/config';
import { validateWorldSnapshotV1 } from '../../packages/engine/src/engine/persistence';
import { emptyMetrics, accumulateMetrics } from '../../packages/engine/src/engine/metrics';
import type { AgentRosterEntry, ConnectionProfile } from '@simagents/shared';
/** Explicit synthetic preconditioning, not elapsed runtime or recorded provider decisions. */
export async function buildSoakWorld() {
  const profile: ConnectionProfile = { id: 'soak:connection', name: 'Simulated soak transport', providerId: 'claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages', credentialRef: 'soak:provider-key', transport: 'direct' };
  const roster: AgentRosterEntry[] = Array.from({ length: 20 }, (_, index) => ({ id: `soak:roster:${index + 1}`, name: `Soak agent ${index + 1}`, provider: 'claude', modelId: 'soak-fixture', connectionId: profile.id, color: ['#e07a5f', '#8fb6dc', '#81b29a'][index % 3], capabilities: { temperature: false, output: 'text-json', tokenParameter: 'max_tokens', reasoning: 'none', maxOutputTokens: 128 } }));
  const overrides = { agent: { startingBalance: 100, startingHunger: 100, startingEnergy: 100, startingHealth: 100 }, needs: { hungerDecay: 0, energyDecay: 0 } };
  resetRuntimeConfig(); setRuntimeConfig(overrides);
  const engine = new SimEngine({ speed: 1, worldSeed: 'controlled-real-time-soak', providerFactory: () => { throw new Error('Fixture seeding must never infer'); } });
  try {
    await engine.seed({ roster });
    const snapshot = engine.snapshot();
    const tick = 120, time = tick * 60000, createdAt = new Date();
    snapshot.savedAtSimTimeMs = time; snapshot.speed = 1;
    snapshot.store.worldState.currentTick = tick; snapshot.store.worldState.isPaused = true;
    snapshot.engine.vitalsMeta = snapshot.store.agents.map(agent => [agent.id, { vitalsUpdatedAt: time, criticalSince: {} }]);
    snapshot.engine.agentMeta = snapshot.store.agents.map(agent => [agent.id, { busyUntil: time }]);
    snapshot.engine.heartbeat.lastCurrencyDecayBoundaryTick = tick;
    snapshot.store.events = Array.from({ length: 10000 }, (_, index) => ({ id: index + 1, version: index + 1, tenantId: null, agentId: null, eventType: 'world_tick', category: 'infrastructure' as const, tick: index % 120 + 1, payload: { syntheticPreconditioning: true }, createdAt }));
    snapshot.store.nextEventId = 10001; snapshot.store.nextEventVersion = 10001;
    snapshot.metrics = emptyMetrics();
    for (const event of snapshot.store.events) accumulateMetrics(snapshot.metrics, event, 'unknown', 20);
    snapshot.store.memories = snapshot.store.agents.flatMap(agent => Array.from({ length: CONFIG.memory.maxPerAgent }, (_, index) => ({ id: `soak:memory:${agent.id}:${index}`, tenantId: null, agentId: agent.id, type: 'observation', content: 'Synthetic preconditioning memory; not an observed decision.', importance: 5, emotionalValence: 0, involvedAgentIds: [], x: agent.x, y: agent.y, tick, createdAt })));
    snapshot.configuration = { overrides, customPrompt: null, connections: [profile], roster };
    const validated = validateWorldSnapshotV1(JSON.parse(JSON.stringify(snapshot)));
    return { file: { snapshot: validated, events: snapshot.store.events.map(event => ({ id: `precondition:${event.id}`, type: event.eventType, tick: event.tick, timestamp: createdAt.getTime(), payload: { syntheticPreconditioning: true } })) }, roster, profile, preconditioning: { savedAtSimTimeMs: time, events: 10000, metricTicks: 120, memories: 20 * CONFIG.memory.maxPerAgent, note: 'Synthetic imported history pre-fills resident bounds. None of this time/history counts toward the real-time soak.' } };
  } finally { await engine.reset(); resetRuntimeConfig(); }
}
if (import.meta.main) {
  const fixture = await buildSoakWorld();
  console.log(JSON.stringify({ agents: fixture.file.snapshot.store.agents.length, speed: fixture.file.snapshot.speed, preconditioning: fixture.preconditioning }));
}
