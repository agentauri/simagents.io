import { afterEach, beforeEach, expect, test } from 'bun:test';
import { EngineClient } from '../engine-host/engine-client';

class FakeWorker {
  static instances: FakeWorker[] = [];
  sent: Array<Record<string, unknown>> = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: Record<string, unknown>) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(index: number, payload: unknown) {
    const command = this.sent[index];
    this.onmessage?.({ data: { type: 'response', requestId: command.requestId, sessionId: command.sessionId, payload } });
  }
}
let client: EngineClient;
const oldWorker = globalThis.Worker;
beforeEach(() => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  client = new EngineClient();
});
afterEach(() => { client.resetHard(); globalThis.Worker = oldWorker; });

test('concurrent state requests are correlated even when responses arrive out of order', async () => {
  const a = client.getState();
  const b = client.getState();
  const worker = FakeWorker.instances[0];
  worker.reply(1, { tick: 2 });
  worker.reply(0, { tick: 1 });
  expect((await a).tick).toBe(1);
  expect((await b).tick).toBe(2);
});

test('start is acknowledged before client claims it is running', async () => {
  const start = client.start();
  expect(client.isRunning()).toBe(false);
  FakeWorker.instances[0].reply(0, undefined);
  await start;
  expect(client.isRunning()).toBe(true);
});

test('reset rejects pending calls and an old session cannot resolve the new one', async () => {
  const old = client.getState().catch((error: Error) => error.message);
  const previous = FakeWorker.instances[0];
  client.resetHard();
  expect(await old).toBe('Engine worker reset');
  expect(previous.terminated).toBe(true);
  const next = client.getState();
  previous.reply(0, { tick: 999 });
  FakeWorker.instances[1].reply(0, { tick: 3 });
  expect((await next).tick).toBe(3);
});

test('command timeout rejects, terminates the ambiguous session and never retries', async () => {
  client.resetHard();
  client = new EngineClient(5);
  const warning: string[] = [];
  client.onWarning((message) => warning.push(message));
  const result = client.start();
  const worker = FakeWorker.instances.at(-1)!;
  await expect(result).rejects.toThrow('timed out');
  expect(worker.terminated).toBe(true);
  expect(worker.sent.length).toBe(1);
  expect(warning[0]).toContain('not retried');
});

test('pause waits for asynchronous snapshot persistence after worker acknowledgement', async () => {
  let finishWrite!: () => void;
  client.onSnapshot(() => new Promise<void>(resolve => { finishWrite = resolve; }));
  const pause = client.pause();
  const worker = FakeWorker.instances[0];
  worker.onmessage?.({ data: { type: 'snapshot', sessionId: worker.sent[0].sessionId, snapshot: {}, recentEvents: [] } });
  worker.reply(0, undefined);
  let finished = false;
  void pause.then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 1));
  expect(finished).toBe(false);
  finishWrite();
  await pause;
  expect(finished).toBe(true);
});
