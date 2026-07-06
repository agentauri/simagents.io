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

export async function removeFromInventoryIfAtLeast(
  agentId: string,
  itemType: string,
  quantity: number
): Promise<boolean> {
  const key = inventoryKey(agentId, itemType);
  const item = store.inventory.get(key);
  if (!item || item.quantity < quantity) return false;

  const newQuantity = item.quantity - quantity;
  if (newQuantity <= 0) {
    store.inventory.delete(key);
  } else {
    store.inventory.set(key, { ...item, quantity: newQuantity });
  }

  return true;
}

export async function swapInventoryForTrade(
  initiatorAgentId: string,
  targetAgentId: string,
  offeringItemType: string,
  offeringQuantity: number,
  requestingItemType: string,
  requestingQuantity: number,
  receivedQuantity: number
): Promise<{ success: boolean; error?: string }> {
  const initiatorRemoved = await removeFromInventoryIfAtLeast(
    initiatorAgentId,
    offeringItemType,
    offeringQuantity
  );
  if (!initiatorRemoved) {
    const initiatorItem = await getInventoryItem(initiatorAgentId, offeringItemType);
    const initiatorHas = initiatorItem?.quantity ?? 0;
    return {
      success: false,
      error: initiatorHas < offeringQuantity
        ? `Not enough ${offeringItemType} to offer (have: ${initiatorHas}, need: ${offeringQuantity})`
        : 'Failed to remove offering items - concurrent modification detected',
    };
  }

  const targetItem = await getInventoryItem(targetAgentId, requestingItemType);
  const targetHas = targetItem?.quantity ?? 0;
  if (targetHas < requestingQuantity) {
    await addToInventory(initiatorAgentId, offeringItemType, offeringQuantity);
    return {
      success: false,
      error: `Target agent doesn't have enough ${requestingItemType} (have: ${targetHas}, need: ${requestingQuantity})`,
    };
  }

  const targetRemoved = await removeFromInventoryIfAtLeast(
    targetAgentId,
    requestingItemType,
    requestingQuantity
  );
  if (!targetRemoved) {
    await addToInventory(initiatorAgentId, offeringItemType, offeringQuantity);
    return {
      success: false,
      error: 'Failed to remove target items - concurrent modification detected',
    };
  }

  await addToInventory(initiatorAgentId, requestingItemType, receivedQuantity);
  await addToInventory(targetAgentId, offeringItemType, offeringQuantity);

  return { success: true };
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
