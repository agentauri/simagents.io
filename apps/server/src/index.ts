import Fastify from 'fastify';
import cors from '@fastify/cors';

const server = Fastify({
  logger: true,
});

await server.register(cors, {
  origin: true,
});

// Health check
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API routes
server.get('/api/world/state', async () => {
  return {
    tick: 0,
    agents: [],
    locations: [],
  };
});

// SSE endpoint for real-time updates
server.get('/api/events', async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const sendEvent = (data: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial connection event
  sendEvent({ type: 'connected', tick: 0 });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    sendEvent({ type: 'ping', timestamp: Date.now() });
  }, 30000);

  request.raw.on('close', () => {
    clearInterval(keepAlive);
  });
});

// Start server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🏙️ Agents City server running on http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
