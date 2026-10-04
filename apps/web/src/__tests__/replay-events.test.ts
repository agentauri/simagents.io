import { expect, test } from 'bun:test';
import { worldEventToReplayEvent } from '../engine-host/replay-events';
import type { WorldEvent } from '../stores/world';

const event = (id: string): WorldEvent => ({ id, type: 'agent_signal', tick: 3, timestamp: 1000, agentId: 'agent-1', payload: { message: 'original response' } });

test('replay identities survive new events, reversal and bounded history eviction', () => {
  const old = [event('store-504'), event('store-503')].map(worldEventToReplayEvent);
  const next = [event('store-505'), event('store-504')].map(worldEventToReplayEvent);
  expect(old.map(row => row.id)).toEqual([504, 503]);
  expect(next.map(row => row.id)).toEqual([505, 504]);
  expect(next[1]).toEqual(old[0]);
  expect([event('store-503'), event('store-504')].map(worldEventToReplayEvent)[1]).toEqual(old[0]);
});

test('replay preserves the source payload, agent, time and event type', () => {
  const source = event('store-7');
  expect(worldEventToReplayEvent(source)).toEqual({ id: 7, eventType: source.type, tick: 3, agentId: 'agent-1', payload: source.payload, createdAt: '1970-01-01T00:00:01.000Z' });
});

test('invalid event identities never turn into unrelated list positions', () => {
  for (const id of ['store-0', 'store-01', 'store--1', 'store-1.5', 'store-9007199254740992', 'arbitrary-imported-id']) expect(() => worldEventToReplayEvent(event(id))).toThrow('valid stored engine event identity');
});
