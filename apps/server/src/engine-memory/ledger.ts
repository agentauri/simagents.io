import { v4 as uuid } from 'uuid';
import type { LedgerEntry } from '../db/schema';
import { store } from './store';

export type TransactionCategory =
  | 'salary'
  | 'purchase'
  | 'consumption'
  | 'transfer'
  | 'tax'
  | 'welfare';

export interface TransactionResult {
  success: boolean;
  txId: string;
  entries: LedgerEntry[];
  fromNewBalance?: number;
  toNewBalance?: number;
  error?: string;
}

export async function getBalance(agentId: string): Promise<number> {
  return store.agents.get(agentId)?.balance ?? 0;
}

export async function transfer(
  fromAgentId: string | null,
  toAgentId: string | null,
  amount: number,
  category: TransactionCategory,
  description: string,
  tick: number
): Promise<TransactionResult> {
  const txId = uuid();

  if (amount <= 0) {
    return {
      success: false,
      txId,
      entries: [],
      error: 'Amount must be positive',
    };
  }

  let fromBalance: number | undefined;
  if (fromAgentId) {
    fromBalance = await getBalance(fromAgentId);
    if (fromBalance < amount) {
      return {
        success: false,
        txId,
        entries: [],
        error: `Insufficient balance: need ${amount}, have ${fromBalance}`,
      };
    }
  }

  const now = new Date();
  const entries: LedgerEntry[] = [
    {
      id: uuid(),
      tenantId: null,
      txId,
      tick,
      fromAgentId,
      toAgentId,
      amount: -amount,
      category,
      description,
      createdAt: now,
    },
    {
      id: uuid(),
      tenantId: null,
      txId,
      tick,
      fromAgentId,
      toAgentId,
      amount,
      category,
      description,
      createdAt: now,
    },
  ];
  store.ledgerEntries.push(...entries);

  let fromNewBalance: number | undefined;
  let toNewBalance: number | undefined;

  if (fromAgentId) {
    fromNewBalance = fromBalance! - amount;
    const fromAgent = store.agents.get(fromAgentId);
    if (fromAgent) {
      store.agents.set(fromAgentId, { ...fromAgent, balance: fromNewBalance, updatedAt: now });
    }
  }

  if (toAgentId) {
    const toBalance = await getBalance(toAgentId);
    toNewBalance = toBalance + amount;
    const toAgent = store.agents.get(toAgentId);
    if (toAgent) {
      store.agents.set(toAgentId, { ...toAgent, balance: toNewBalance, updatedAt: now });
    }
  }

  return {
    success: true,
    txId,
    entries,
    fromNewBalance,
    toNewBalance,
  };
}

export async function paySalary(
  agentId: string,
  amount: number,
  tick: number,
  description = 'Work salary'
): Promise<TransactionResult> {
  return transfer(null, agentId, amount, 'salary', description, tick);
}

export async function chargePurchase(
  agentId: string,
  amount: number,
  tick: number,
  description = 'Item purchase'
): Promise<TransactionResult> {
  return transfer(agentId, null, amount, 'purchase', description, tick);
}

export async function transferBetweenAgents(
  fromAgentId: string,
  toAgentId: string,
  amount: number,
  tick: number,
  description = 'Agent transfer'
): Promise<TransactionResult> {
  return transfer(fromAgentId, toAgentId, amount, 'transfer', description, tick);
}

export async function getTransactionHistory(agentId: string, limit = 50): Promise<LedgerEntry[]> {
  return store.ledgerEntries
    .filter((entry) => entry.fromAgentId === agentId || entry.toAgentId === agentId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function getTotalMoneySupply(): Promise<number> {
  return [...store.agents.values()].reduce((sum, agent) => sum + (agent.balance ?? 0), 0);
}
