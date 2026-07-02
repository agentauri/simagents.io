/**
 * Inventory queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/inventory.ts`. Backed by a Map keyed
 * by `${agentId}:${itemType}`, mirroring the agent+item unique index.
 */

import { v4 as uuid } from 'uuid';
import type { InventoryItem } from '../../db/schema';
import { store, inventoryKey } from '../store';

export async function getInventoryItem(
  agentId: string,
  itemType: string
): Promise<InventoryItem | undefined> {
  return store.inventory.get(inventoryKey(agentId, itemType));
}

export async function getAgentInventory(agentId: string): Promise<InventoryItem[]> {
  return [...store.inventory.values()].filter((i) => i.agentId === agentId);
}

export async function hasConsumableItems(agentId: string): Promise<boolean> {
  for (const item of store.inventory.values()) {
    if (item.agentId === agentId) return true;
  }
  return false;
}

export async function addToInventory(
  agentId: string,
  itemType: string,
  quantity: number = 1
): Promise<InventoryItem> {
  const key = inventoryKey(agentId, itemType);
  const existing = store.inventory.get(key);
  if (existing) {
    const updated = { ...existing, quantity: existing.quantity + quantity };
    store.inventory.set(key, updated);
    return updated;
  }
  const item: InventoryItem = {
    id: uuid(),
    tenantId: null,
    agentId,
    itemType,
    quantity,
    properties: {},
    createdAt: new Date(),
  };
  store.inventory.set(key, item);
  return item;
}

export async function removeFromInventory(
  agentId: string,
  itemType: string,
  quantity: number = 1
): Promise<number> {
  const key = inventoryKey(agentId, itemType);
  const item = store.inventory.get(key);
  if (!item || item.quantity < quantity) return -1;

  const newQuantity = item.quantity - quantity;
  if (newQuantity <= 0) {
    store.inventory.delete(key);
    return 0;
  }
  store.inventory.set(key, { ...item, quantity: newQuantity });
  return newQuantity;
}

export async function updateInventoryQuantity(
  agentId: string,
  itemType: string,
  newQuantity: number
): Promise<number> {
  const key = inventoryKey(agentId, itemType);
  const item = store.inventory.get(key);
  if (!item) return -1;
  if (newQuantity <= 0) {
    store.inventory.delete(key);
    return 0;
  }
  store.inventory.set(key, { ...item, quantity: newQuantity });
  return newQuantity;
}

export async function deleteAllInventory(): Promise<void> {
  store.inventory.clear();
}
