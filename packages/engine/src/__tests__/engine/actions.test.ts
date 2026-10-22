import { beforeEach, describe, expect, test } from 'bun:test';
import { ActionExecutor } from '../../engine/executor';
import { createIntent } from '../../actions';
import type { ActionParams, ActionType } from '../../actions/types';
import { createAgent, getAgentById, updateAgent } from '../../engine-memory/queries/agents';
import { resetStore, store } from '../../engine-memory/store';
import { resetRuntimeConfig } from '../../config';
import { materializeVitals } from '../../engine/vitals';
import { getAgentBusyUntil } from '../../engine/agent-meta';
import { expireJobOffers } from '../../engine-memory/queries/employment';
import { hydrateWorld, serializeWorld, validateWorldSnapshotV1 } from '../../engine/persistence';

let now = 0;
let executor: ActionExecutor;
beforeEach(() => { resetStore(); resetRuntimeConfig(); now = 0; executor = new ActionExecutor({ nowMs: () => now }); });
const act = (agentId: string, type: ActionType, params: ActionParams) => executor.submit(createIntent(agentId, type, params, 0));
async function pair() {
  const employer = await createAgent({ id: 'employer', llmType: 'fixture', balance: 200 });
  const worker = await createAgent({ id: 'worker', llmType: 'fixture', balance: 0 });
  return { employer, worker };
}
async function contract(paymentType: 'upfront' | 'on_completion' | 'per_tick', duration = 1) {
  const { employer, worker } = await pair();
  expect((await act(employer.id, 'offer_job', { salary: 40, duration, paymentType, escrowPercent: 50 })).result.success).toBe(true);
  const offer = [...store.jobOffers.values()][0];
  expect((await act(worker.id, 'accept_job', { jobOfferId: offer.id })).result.success).toBe(true);
  return { employer, worker, employment: [...store.employments.values()][0] };
}
function money() {
  return [...store.agents.values()].reduce((sum, a) => sum + a.balance, 0)
    + [...store.employments.values()].reduce((sum, e) => sum + e.escrowAmount, 0)
    + [...store.jobOffers.values()].filter((o) => o.status === 'open').reduce((sum, o) => sum + o.escrowAmount, 0);
}

describe('action invariants', () => {
  test.each([NaN, Infinity, -1, 0])('rejects invalid quantities %s before mutation', async (quantity) => {
    const agent = await createAgent({ llmType: 'fixture' });
    const result = await act(agent.id, 'gather', { quantity });
    expect(result.result.success).toBe(false);
    expect(store.inventory.size).toBe(0);
    expect((await getAgentById(agent.id))?.balance).toBe(100);
  });
  test('rejects fractional coordinates and missing duration', async () => {
    const agent = await createAgent({ llmType: 'fixture' });
    expect((await act(agent.id, 'move', { toX: 0.5, toY: 0 })).result.success).toBe(false);
    expect((await act(agent.id, 'sleep', {})).result.success).toBe(false);
    expect((await getAgentById(agent.id))?.x).toBe(0);
  });
  test('undefined changes never erase existing values', async () => {
    const agent = await createAgent({ llmType: 'fixture', balance: 73 });
    await updateAgent(agent.id, { balance: undefined });
    expect((await getAgentById(agent.id))?.balance).toBe(73);
  });
  test('sleep restores energy over its requested duration and wakes up', async () => {
    const agent = await createAgent({ llmType: 'fixture', energy: 40 });
    expect((await act(agent.id, 'sleep', { duration: 2 })).result.success).toBe(true);
    expect((await getAgentById(agent.id))?.energy).toBe(40);
    expect(getAgentBusyUntil(agent.id)).toBe(120000);
    await materializeVitals(agent.id, 60000);
    expect((await getAgentById(agent.id))?.state).toBe('sleeping');
    expect((await getAgentById(agent.id))!.energy).toBeGreaterThan(40);
    await materializeVitals(agent.id, 120000);
    expect((await getAgentById(agent.id))?.state).toBe('idle');
  });
});

describe('employment money conservation', () => {
  test.each(['funds-exhausted', 'employer-dead'] as const)('%s after partial wages preserves the forfeited deposit on reload', async (failure) => {
    await createAgent({ id: 'employer', llmType: 'fixture', balance: 60 });
    await createAgent({ id: 'worker', llmType: 'fixture', balance: 0 });
    expect((await act('employer', 'offer_job', { salary: 40, duration: 2, paymentType: 'per_tick', escrowPercent: 100 })).result.success).toBe(true);
    const offer = [...store.jobOffers.values()][0];
    expect((await act('worker', 'accept_job', { jobOfferId: offer.id })).result.success).toBe(true);
    expect((await act('worker', 'work', {})).result.success).toBe(true);
    expect(store.agents.get('employer')!.balance).toBe(0);
    expect(store.agents.get('worker')!.balance).toBe(20);
    expect(money()).toBe(60);
    if (failure === 'employer-dead') await updateAgent('employer', { state: 'dead' });
    const result = await act('worker', 'work', {});
    expect(result.result.success).toBe(false);
    expect(result.events.map(event => event.type)).toEqual(['action_failed']);
    const employment = [...store.employments.values()][0];
    expect(employment).toMatchObject({ salary: 40, amountPaid: 60, escrowAmount: 0, ticksWorked: 1,
      status: failure === 'employer-dead' ? 'abandoned' : 'unpaid' });
    expect(store.agents.get('worker')!.balance).toBe(60);
    expect(money()).toBe(60);
    const snapshot = serializeWorld({ savedAtSimTimeMs: now, worldSeed: 'default-escrow', speed: 1 });
    expect(() => validateWorldSnapshotV1(snapshot)).not.toThrow();
    hydrateWorld(JSON.parse(JSON.stringify(snapshot)));
    expect(store.employments.get(employment.id)).toMatchObject({ amountPaid: 60, escrowAmount: 0 });
    expect(money()).toBe(60);
    expect((await act('worker', 'work', {})).result.success).toBe(false);
    expect(store.agents.get('worker')!.balance).toBe(60);
    expect(money()).toBe(60);
  });
  test('completed work remains payable exactly once, escrow retained until payment', async () => {
    const { employer, worker, employment } = await contract('on_completion');
    expect(money()).toBe(200);
    expect((await act(worker.id, 'work', {})).result.success).toBe(true);
    expect(store.employments.get(employment.id)?.status).toBe('active');
    expect(store.employments.get(employment.id)?.escrowAmount).toBe(20);
    expect((await getAgentById(worker.id))?.balance).toBe(0);
    expect((await act(worker.id, 'work', {})).result.success).toBe(false);
    expect((await act(employer.id, 'pay_worker', { employmentId: employment.id })).result.success).toBe(true);
    expect((await getAgentById(worker.id))?.balance).toBe(40);
    expect(money()).toBe(200);
    expect((await act(employer.id, 'pay_worker', { employmentId: employment.id })).result.success).toBe(false);
    expect(money()).toBe(200);
  });
  test.each(['upfront', 'per_tick'] as const)('%s never returns spent escrow or duplicates payment', async (paymentType) => {
    const { worker, employment } = await contract(paymentType);
    expect(money()).toBe(200);
    expect((await act(worker.id, 'work', {})).result.success).toBe(true);
    expect(store.employments.get(employment.id)?.status).toBe('completed');
    expect(store.employments.get(employment.id)?.amountPaid).toBe(40);
    expect((await getAgentById(worker.id))?.balance).toBe(40);
    expect(money()).toBe(200);
  });
  test('escrow claim uses actual work completion and cannot be paid again', async () => {
    const { employer, worker, employment } = await contract('on_completion');
    now = 20 * 60000;
    await act(worker.id, 'work', {});
    expect((await act(worker.id, 'claim_escrow', { employmentId: employment.id })).result.success).toBe(false);
    now = 30 * 60000;
    expect((await act(worker.id, 'claim_escrow', { employmentId: employment.id })).result.success).toBe(true);
    expect((await act(employer.id, 'pay_worker', { employmentId: employment.id })).result.success).toBe(false);
    expect(money()).toBe(200);
  });
  test.each(['quit_job', 'fire_worker'] as const)('%s settles escrow once', async (type) => {
    const { employer, worker, employment } = await contract('on_completion', 2);
    await act(worker.id, 'work', {});
    const actor = type === 'quit_job' ? worker : employer;
    expect((await act(actor.id, type, { employmentId: employment.id })).result.success).toBe(true);
    expect(money()).toBe(200);
    expect((await act(actor.id, type, { employmentId: employment.id })).result.success).toBe(false);
    expect(money()).toBe(200);
  });
  test('expired offers return their deposit only once', async () => {
    const { employer } = await pair();
    await act(employer.id, 'offer_job', { salary: 40, duration: 1, paymentType: 'upfront', expiresInTicks: 1 });
    expect(await expireJobOffers(1)).toBe(1);
    expect(await expireJobOffers(2)).toBe(0);
    expect(money()).toBe(200);
    expect((await getAgentById(employer.id))?.balance).toBe(200);
  });
});
