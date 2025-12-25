# Stack Rationale - Appendix

> Technical reasoning behind Agents City architectural decisions

## Table of Contents

1. [Decision Framework](#1-decision-framework)
2. [Runtime & Framework](#2-runtime--framework)
3. [Database & Event Store](#3-database--event-store)
4. [Real-time Communication](#4-real-time-communication)
5. [AI Integration](#5-ai-integration)
6. [Caching & Queuing](#6-caching--queuing)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Infrastructure](#8-infrastructure)
9. [Trade-offs Summary](#9-trade-offs-summary)

---

## 1. Decision Framework

### 1.1 Guiding Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                    DECISION PRIORITIES                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Simplicity over features (MVP mindset)                      │
│  2. Single source of truth (avoid dual writes)                  │
│  3. Horizontal scalability (stateless where possible)           │
│  4. Cost efficiency (optimize LLM spend first)                  │
│  5. Developer velocity (familiar tools > novel tools)           │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| MVP Speed | 30% | Time to first working prototype |
| Scalability | 25% | Path to 5000+ concurrent agents |
| Cost | 20% | Infrastructure and operational costs |
| Maintainability | 15% | Long-term development velocity |
| Community | 10% | Documentation, support, ecosystem |

---

## 2. Runtime & Framework

### 2.1 Bun vs Node.js

**Decision**: Bun

| Aspect | Node.js | Bun | Winner |
|--------|---------|-----|--------|
| Raw performance | 1x baseline | 3-4x faster | Bun |
| TypeScript support | Requires tsc/esbuild | Native | Bun |
| Package compatibility | 100% | 98%+ | Node.js |
| Production maturity | Excellent | Good | Node.js |
| Memory efficiency | Good | Better | Bun |

**Rationale**:
```
With 5000+ agents each making LLM calls, every millisecond matters.
Bun's 3-4x performance advantage directly translates to:
- More agents per server instance
- Lower latency per agent tick
- Reduced infrastructure costs

The 2% package incompatibility is acceptable for MVP.
```

**Migration Path**:
```typescript
// Bun is Node.js compatible
// Same code runs on both runtimes

// package.json
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "dev:node": "tsx src/index.ts"  // Fallback
  }
}
```

### 2.2 Fastify vs Hono

**Decision**: Fastify

| Aspect | Fastify | Hono | Winner |
|--------|---------|------|--------|
| Performance | Very fast | Faster (edge) | Hono |
| Plugin ecosystem | Extensive | Growing | Fastify |
| TypeScript types | Excellent | Excellent | Tie |
| Validation (Zod) | Native support | Good | Fastify |
| WebSocket/SSE | Built-in | Manual | Fastify |
| CQRS patterns | Better fit | Generic | Fastify |

**Rationale**:
```
Hono is optimized for edge/serverless with minimal overhead.
Fastify is optimized for long-running servers with complex routing.

Agents City needs:
- Complex routing (agents, events, projections)
- Plugin architecture (auth, validation, logging)
- Built-in WebSocket/SSE support
- Schema-based validation

Fastify's architecture aligns better with CQRS patterns.
```

**Code Comparison**:
```typescript
// Fastify - CQRS-friendly structure
fastify.register(async (instance) => {
  // Command handlers
  instance.post('/agents/:id/commands', commandHandler);

  // Query handlers (separate read models)
  instance.get('/projections/economy', economyProjection);

  // Event stream
  instance.get('/events/stream', eventStreamHandler);
});

// Hono - More generic
app.post('/agents/:id/commands', commandHandler);
app.get('/projections/economy', economyProjection);
```

---

## 3. Database & Event Store

### 3.1 PostgreSQL Only (vs PostgreSQL + EventStoreDB)

**Decision**: PostgreSQL as single database

| Approach | Pros | Cons |
|----------|------|------|
| PostgreSQL + EventStoreDB | Purpose-built event store | Dual write complexity, 2x infra |
| PostgreSQL only | Single source of truth | Must build event store abstractions |

**Rationale**:
```
EventStoreDB is excellent but adds:
- Operational complexity (2 databases to manage)
- Dual write risk (events must sync between systems)
- Learning curve for team

PostgreSQL with proper schema handles event sourcing well:
- JSONB for event payload
- Optimistic concurrency with version column
- Native pub/sub with LISTEN/NOTIFY
```

**PostgreSQL Event Store Schema**:
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id VARCHAR(255) NOT NULL,
  version BIGINT NOT NULL,
  type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(stream_id, version)  -- Optimistic concurrency
);

CREATE INDEX idx_events_stream ON events(stream_id, version);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_created ON events(created_at);

-- Append-only trigger
CREATE OR REPLACE FUNCTION prevent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Events are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 3.2 Snapshots Strategy

```sql
CREATE TABLE snapshots (
  stream_id VARCHAR(255) PRIMARY KEY,
  version BIGINT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Snapshot every 100 events
-- Rebuild: load snapshot + replay events since snapshot version
```

**Rebuild Algorithm**:
```typescript
async function rebuildAggregate(streamId: string): Promise<Aggregate> {
  // 1. Load latest snapshot
  const snapshot = await db.query(
    'SELECT * FROM snapshots WHERE stream_id = $1',
    [streamId]
  );

  // 2. Load events since snapshot
  const events = await db.query(
    `SELECT * FROM events
     WHERE stream_id = $1 AND version > $2
     ORDER BY version`,
    [streamId, snapshot?.version ?? 0]
  );

  // 3. Rebuild state
  let state = snapshot?.state ?? initialState();
  for (const event of events) {
    state = applyEvent(state, event);
  }

  return state;
}
```

---

## 4. Real-time Communication

### 4.1 SSE vs WebSocket

**Decision**: Server-Sent Events (SSE)

| Aspect | WebSocket | SSE | Winner |
|--------|-----------|-----|--------|
| Bidirectional | Yes | No (server → client only) | WebSocket |
| Connection overhead | High (stateful) | Low (HTTP/2 multiplexed) | SSE |
| Scalability | Complex (sticky sessions) | Simple (stateless) | SSE |
| Browser support | Universal | Universal | Tie |
| Load balancer friendly | No (sticky) | Yes | SSE |
| Reconnection | Manual | Automatic | SSE |

**Rationale**:
```
Agents City communication pattern:
- Server → Client: 95% (agent updates, events)
- Client → Server: 5% (commands via REST)

WebSocket is overkill when:
- Most traffic is unidirectional
- Commands can use REST API
- Horizontal scaling is priority

SSE advantages:
- Works with standard HTTP/2
- No sticky sessions needed
- Automatic reconnection with Last-Event-ID
- Simpler load balancing
```

**Implementation**:
```typescript
// SSE endpoint
fastify.get('/events/stream', async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const lastEventId = request.headers['last-event-id'];

  // Replay missed events if reconnecting
  if (lastEventId) {
    const missedEvents = await getEventsSince(lastEventId);
    for (const event of missedEvents) {
      reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  }

  // Subscribe to new events
  const unsubscribe = eventBus.subscribe((event) => {
    reply.raw.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  request.raw.on('close', unsubscribe);
});
```

### 4.2 Internal Pub/Sub

```typescript
// PostgreSQL LISTEN/NOTIFY for cross-instance events
import { createClient } from 'pg';

const pubsub = {
  async publish(channel: string, payload: object) {
    await db.query(
      `SELECT pg_notify($1, $2)`,
      [channel, JSON.stringify(payload)]
    );
  },

  subscribe(channel: string, handler: (payload: object) => void) {
    const client = createClient();
    client.on('notification', (msg) => {
      if (msg.channel === channel) {
        handler(JSON.parse(msg.payload));
      }
    });
    client.query(`LISTEN ${channel}`);
  }
};
```

---

## 5. AI Integration

### 5.1 Direct API vs LangChain

**Decision**: Direct OpenAI/Anthropic API

| Aspect | LangChain | Direct API | Winner |
|--------|-----------|------------|--------|
| Abstraction | High (many layers) | Low (simple) | Direct |
| Flexibility | Limited by abstractions | Full control | Direct |
| Performance | Overhead | Minimal | Direct |
| Debugging | Complex chains | Straightforward | Direct |
| Learning curve | Steep | Minimal | Direct |
| Lock-in | LangChain patterns | Provider-specific | Direct |

**Rationale**:
```
LangChain is valuable for:
- Rapid prototyping with many integrations
- Complex RAG pipelines
- Teams unfamiliar with LLM APIs

Agents City doesn't need LangChain because:
- Single LLM provider (initially)
- Custom memory system (not LangChain memory)
- Custom agent loop (not LangChain agents)
- Simpler debugging without chain abstractions
```

**Direct API Pattern**:
```typescript
// Simple, debuggable, no abstractions
async function agentDecision(agent: Agent, context: Context): Promise<Action> {
  const prompt = buildPrompt(agent, context);

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: agent.personality },
      { role: 'user', content: prompt }
    ],
    temperature: 0,  // Reproducibility
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  return parseAction(response.choices[0].message.content);
}
```

### 5.2 LLM Response Caching

```typescript
// Cache deterministic responses
const llmCache = new Map<string, CachedResponse>();

async function cachedLLMCall(
  prompt: string,
  options: LLMOptions
): Promise<string> {
  const cacheKey = hash({ prompt, options });

  if (llmCache.has(cacheKey)) {
    const cached = llmCache.get(cacheKey);
    return cached.response;
  }

  const response = await openai.chat.completions.create(options);
  const result = response.choices[0].message.content;

  llmCache.set(cacheKey, {
    response: result,
    timestamp: Date.now()
  });

  return result;
}
```

---

## 6. Caching & Queuing

### 6.1 Redis for Projections

**Decision**: Redis single instance (MVP), Redis Cluster (scale)

```typescript
// Read model projections in Redis
const projections = {
  async updateAgentPosition(agentId: string, position: Position) {
    await redis.hset(`agent:${agentId}`, {
      x: position.x,
      y: position.y,
      zone: position.zone,
      updatedAt: Date.now()
    });

    // Geospatial index for proximity queries
    await redis.geoadd('agents:geo', position.x, position.y, agentId);
  },

  async getNearbyAgents(position: Position, radius: number) {
    return redis.georadius('agents:geo', position.x, position.y, radius, 'km');
  }
};
```

### 6.2 BullMQ for Async LLM Calls

**Decision**: BullMQ (Redis-backed job queue)

**Rationale**:
```
LLM calls are:
- Slow (500ms - 3s)
- Expensive (rate limited)
- Non-blocking (agent can wait)

BullMQ provides:
- Reliable job processing
- Automatic retries with backoff
- Rate limiting
- Job prioritization
- Dead letter queue
```

**Implementation**:
```typescript
import { Queue, Worker } from 'bullmq';

const llmQueue = new Queue('llm-calls', { connection: redis });

// Producer: Queue LLM call
async function queueAgentDecision(agentId: string, context: Context) {
  await llmQueue.add('decision', { agentId, context }, {
    priority: context.urgency,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  });
}

// Consumer: Process LLM calls
const worker = new Worker('llm-calls', async (job) => {
  const { agentId, context } = job.data;

  const decision = await cachedLLMCall(
    buildPrompt(context),
    { temperature: 0 }
  );

  await eventStore.append(`agent-${agentId}`, {
    type: 'AgentDecisionMade',
    payload: { decision }
  });
}, {
  concurrency: 10,  // Parallel LLM calls
  limiter: { max: 100, duration: 60000 }  // Rate limit
});
```

---

## 7. Frontend Architecture

### 7.1 React + Vite + Zustand

**Decision**: React ecosystem with Zustand for state

| Choice | Rationale |
|--------|-----------|
| React | Team familiarity, ecosystem |
| Vite | Fast HMR, native ESM |
| Zustand | Simpler than Redux, sufficient for needs |
| TailwindCSS | Utility-first, fast iteration |
| D3.js | Complex visualizations (city map) |

**State Architecture**:
```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface CityState {
  agents: Map<string, Agent>;
  events: Event[];
  selectedAgent: string | null;

  // Actions
  updateAgent: (id: string, update: Partial<Agent>) => void;
  selectAgent: (id: string) => void;
}

const useCityStore = create<CityState>()(
  subscribeWithSelector((set) => ({
    agents: new Map(),
    events: [],
    selectedAgent: null,

    updateAgent: (id, update) => set((state) => {
      const agents = new Map(state.agents);
      const agent = agents.get(id);
      if (agent) {
        agents.set(id, { ...agent, ...update });
      }
      return { agents };
    }),

    selectAgent: (id) => set({ selectedAgent: id }),
  }))
);
```

### 7.2 SSE Client

```typescript
// Auto-reconnecting SSE client
function useEventStream(url: string) {
  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      useCityStore.getState().handleEvent(data);
    };

    eventSource.onerror = () => {
      // Automatic reconnection with Last-Event-ID
      console.log('SSE reconnecting...');
    };

    return () => eventSource.close();
  }, [url]);
}
```

---

## 8. Infrastructure

### 8.1 Fly.io vs Railway vs Others

**Decision**: Fly.io

| Platform | Pros | Cons |
|----------|------|------|
| Fly.io | Edge deployment, managed Postgres, good pricing | Learning curve |
| Railway | Simple, good DX | Less edge presence |
| Render | Simple | Higher latency |
| AWS/GCP | Full control | Operational overhead |

**Rationale**:
```
Fly.io advantages for Agents City:
- Managed PostgreSQL with replicas
- Edge deployment (lower latency globally)
- Simple scaling (fly scale count)
- Built-in metrics and logging
- Reasonable pricing for MVP
```

### 8.2 Deployment Architecture

```yaml
# fly.toml
app = "agents-city"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true

  [[http_service.checks]]
    interval = "10s"
    timeout = "2s"
    path = "/health"

[[services]]
  protocol = "tcp"
  internal_port = 5432

  [services.concurrency]
    type = "connections"
    hard_limit = 100
    soft_limit = 80
```

### 8.3 Scaling Strategy

```
MVP (500 agents):
├── 1x web server (shared-cpu-1x)
├── 1x PostgreSQL (shared-cpu-1x, 1GB)
├── 1x Redis (Upstash free tier)
└── Cost: ~$30/month

Growth (5000 agents):
├── 3x web servers (dedicated-cpu-2x)
├── 1x PostgreSQL (dedicated-cpu-2x, 8GB)
├── 1x Redis (dedicated)
├── 2x worker instances (BullMQ)
└── Cost: ~$300/month
```

---

## 9. Trade-offs Summary

### 9.1 Decisions Made

| Decision | Trade-off | Accepted Risk |
|----------|-----------|---------------|
| Bun over Node.js | Less ecosystem maturity | 2% package incompatibility |
| PostgreSQL only | Build event store abstractions | More initial development |
| SSE over WebSocket | No bidirectional real-time | Commands via REST |
| No LangChain | Build abstractions ourselves | More boilerplate |
| Fly.io | Platform lock-in | Migration effort later |

### 9.2 Reversible Decisions

```
These can be changed later with moderate effort:

✓ Bun → Node.js (same code)
✓ SSE → WebSocket (protocol change)
✓ Redis → Valkey (drop-in replacement)
✓ Fly.io → any container platform
```

### 9.3 Irreversible Decisions

```
These are hard to change once committed:

⚠ Event schema design (migration required)
⚠ Agent message protocol (all agents affected)
⚠ PostgreSQL as event store (data migration)
```

---

## Conclusion

This stack prioritizes:
1. **Speed to MVP** - Familiar tools, minimal complexity
2. **Horizontal scalability** - Stateless services, SSE
3. **Cost efficiency** - Single database, efficient caching
4. **Developer experience** - TypeScript everywhere, good tooling

The architecture allows future evolution without rewriting:
- Add EventStoreDB if PostgreSQL hits limits
- Switch to WebSocket if bidirectional needed
- Add Redis Cluster when single instance saturates
- Deploy to any cloud if Fly.io unsuitable

---

*Stack decisions are documented as ADRs (Architecture Decision Records) in `/docs/adr/` for historical context.*
