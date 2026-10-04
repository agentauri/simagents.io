import { AppError, type AppIssue } from '@simagents/shared';
import { getRuntimeConfig } from '@simagents/engine/config';
import { expect, test } from 'bun:test';
import type { WorkerCommand } from '../engine-host/engine-client';

test('worker experiments cancel, fail incomplete targets and restore the original world/configuration', async () => {
  let receive: ((event: { data: unknown }) => void) | undefined;
  const waiting = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
  const scope = {
    set onmessage(value: typeof receive) { receive = value; },
    postMessage(message: { type: string; requestId?: string; payload?: unknown; message?: string; issue?: AppIssue }) {
      if (!message.requestId) return;
      const pending = waiting.get(message.requestId);
      if (!pending) return;
      waiting.delete(message.requestId);
      if (message.type === 'error') pending.reject(new AppError(message.issue ?? { code: 'INTERNAL_ERROR' }));
      else pending.resolve(message.payload);
    },
  };
  Object.assign(globalThis, { self: scope });
  await import('../engine-host/worker');
  let seq = 0;
  function command(value: WorkerCommand): Promise<any> {
    const requestId = `test-${++seq}`;
    return new Promise((resolve, reject) => {
      waiting.set(requestId, { resolve, reject });
      receive!({ data: { ...value, sessionId: 'test-session', requestId } });
    });
  }
  try {
    const state = await command({ cmd: 'init', payload: { roster: [], keys: {}, speed: 1 } });
    expect(state.lifecycle).toBe('initialized');
    const original = await command({ cmd: 'snapshot' });
    const invalid = structuredClone(original.snapshot);
    invalid.store.agents = [{}];
    await expect(command({ cmd: 'validateSnapshot', snapshot: invalid })).rejects.toThrow();
    expect((await command({ cmd: 'getState' })).simTimeMs).toBe(state.simTimeMs);
    const originalNeeds = structuredClone(getRuntimeConfig().needs);
    const failed = await command({ cmd: 'runExperiment', requestId: '', definition: { ticks: 1, wallStepMs: 1, configOverrides: { needs: { hungerDecay: 99 } } } });
    expect(failed.status).toBe('failed');
    expect(failed.ticksCompleted).toBe(0);
    const restored = await command({ cmd: 'snapshot' });
    expect(restored.snapshot.savedAtSimTimeMs).toBe(original.snapshot.savedAtSimTimeMs);
    expect(getRuntimeConfig().needs).toEqual(originalNeeds);
    expect(restored.snapshot.configuration.customPrompt).toBe(original.snapshot.configuration.customPrompt);
    const running = command({ cmd: 'runExperiment', requestId: '', definition: { ticks: 500, wallStepMs: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await expect(command({ cmd: 'runExperiment', requestId: '', definition: { ticks: 1 } })).rejects.toThrow('EXPERIMENT_BUSY');
    await expect(command({ cmd: 'setSpeed', speed: 2 })).rejects.toThrow('EXPERIMENT_BUSY');
    await command({ cmd: 'cancelExperiment', requestId: '' });
    expect((await running).status).toBe('cancelled');
    const completed = await command({ cmd: 'runExperiment', requestId: '', definition: { ticks: 1, wallStepMs: 60000 } });
    expect(completed.status).toBe('completed');
    expect(completed.ticksCompleted).toBeGreaterThanOrEqual(1);
    expect((await command({ cmd: 'getState' })).simTimeMs).toBe(0);
    await command({ cmd: 'init', payload: { roster: [], speed: 1, keys: { 'relay:access': 'first-token' }, connections: [{
      id: 'relay-profile', name: 'Claude', providerId: 'claude', protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages',
      credentialRef: 'claude', transport: 'official-relay', relayUrl: 'https://relay.example.test', relayCredentialRef: 'relay:access',
    }] } });
    await command({ cmd: 'suspendRelayAccess', relayUrl: 'https://relay.example.test' });
    await expect(command({ cmd: 'resume' })).rejects.toThrow('RELAY_ACCESS');
    await expect(command({ cmd: 'start' })).rejects.toThrow('RELAY_ACCESS');
    const beforeRenewal = await command({ cmd: 'snapshot' });
    expect(await command({ cmd: 'updateRelayToken', relayUrl: 'https://relay.example.test', token: 'renewed-token' })).toEqual({ updated: 1 });
    const afterRenewal = await command({ cmd: 'snapshot' });
    expect(afterRenewal.snapshot).toEqual(beforeRenewal.snapshot);
    expect(JSON.stringify(afterRenewal)).not.toContain('renewed-token');
    await expect(command({ cmd: 'updateRelayToken', relayUrl: 'https://other.example.test', token: 'token' })).rejects.toThrow();
    await expect(command({ cmd: 'updateRelayToken', relayUrl: 'https://relay.example.test', token: '' })).rejects.toThrow();
  } finally {
    await command({ cmd: 'reset' });
  }
});
