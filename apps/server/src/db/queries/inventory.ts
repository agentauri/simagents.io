/**
 * Inventory queries
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, inventory, type InventoryItem } from '../index';
import { v4 as uuid } from 'uuid';

/**
 * Get an inventory item for an agent
 */
export async function getInventoryItem(
  agentId: string,
  itemType: string
): Promise<InventoryItem | undefined> {
  const result = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.agentId, agentId), eq(inventory.itemType, itemType)))
    .limit(1);
  return result[0];
}

/**
 * Get all inventory items for an agent
 */
export async function getAgentInventory(agentId: string): Promise<InventoryItem[]> {
  return db.select().from(inventory).where(eq(inventory.agentId, agentId));
}

/**
 * Check if agent has any consumable items (food, water, medicine)
 */
export async function hasConsumableItems(agentId: string): Promise<boolean> {
  const items = await db
    .select()
    .from(inventory)
    .where(eq(inventory.agentId, agentId))
    .limit(1);
  return items.length > 0;
}

/**
 * Add items to inventory (upsert - insert or increment quantity)
 */
export async function addToInventory(
  agentId: string,
  itemType: string,
  quantity: number = 1
): Promise<InventoryItem> {
  const result = await db
    .insert(inventory)
    .values({
      id: uuid(),
      agentId,
      itemType,
      quantity,
    })
    .onConflictDoUpdate({
      target: [inventory.agentId, inventory.itemType],
      set: { quantity: sql`${inventory.quantity} + ${quantity}` },
    })
    .returning();
  return result[0];
}

/**
 * Remove items from inventory (decrement or delete if quantity reaches 0)
 * Returns the remaining quantity, or -1 if item not found
 */
export async function removeFromInventory(
  agentId: string,
  itemType: string,
  quantity: number = 1
): Promise<number> {
  const item = await getInventoryItem(agentId, itemType);

  if (!item || item.quantity < quantity) {
    return -1; // Not enough items
  }

  const newQuantity = item.quantity - quantity;

  if (newQuantity <= 0) {
    // Delete the record
    await db.delete(inventory).where(eq(inventory.id, item.id));
    return 0;
  } else {
    // Update quantity
    await db
      .update(inventory)
      .set({ quantity: newQuantity })
      .where(eq(inventory.id, item.id));
    return newQuantity;
  }
}

export async function removeFromInventoryIfAtLeast(
  agentId: string,
  itemType: string,
  quantity: number
): Promise<boolean> {
  const [updated] = await db
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${quantity}` })
    .where(
      and(
        eq(inventory.agentId, agentId),
        eq(inventory.itemType, itemType),
        sql`${inventory.quantity} >= ${quantity}`
      )
    )
    .returning();

  if (!updated) {
    return false;
  }

  if (updated.quantity <= 0) {
    await db.delete(inventory).where(eq(inventory.id, updated.id));
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
  let tradeError: string | null = null;

  try {
    await db.transaction(async (tx) => {
      const [initiatorItem] = await tx
        .select()
        .from(inventory)
        .where(
          and(
            eq(inventory.agentId, initiatorAgentId),
            eq(inventory.itemType, offeringItemType)
          )
        );

      const initiatorHas = initiatorItem?.quantity ?? 0;
      if (initiatorHas < offeringQuantity) {
        tradeError = `Not enough ${offeringItemType} to offer (have: ${initiatorHas}, need: ${offeringQuantity})`;
        throw new Error(tradeError);
      }

      const [targetItem] = await tx
        .select()
        .from(inventory)
        .where(
          and(
            eq(inventory.agentId, targetAgentId),
            eq(inventory.itemType, requestingItemType)
          )
        );

      const targetHas = targetItem?.quantity ?? 0;
      if (targetHas < requestingQuantity) {
        tradeError = `Target agent doesn't have enough ${requestingItemType} (have: ${targetHas}, need: ${requestingQuantity})`;
        throw new Error(tradeError);
      }

      const initiatorUpdate = await tx
        .update(inventory)
        .set({ quantity: sql`${inventory.quantity} - ${offeringQuantity}` })
        .where(
          and(
            eq(inventory.agentId, initiatorAgentId),
            eq(inventory.itemType, offeringItemType),
            sql`${inventory.quantity} >= ${offeringQuantity}`
          )
        )
        .returning();

      if (initiatorUpdate.length === 0) {
        tradeError = 'Failed to remove offering items - concurrent modification detected';
        throw new Error(tradeError);
      }

      if (initiatorUpdate[0].quantity <= 0) {
        await tx.delete(inventory).where(eq(inventory.id, initiatorUpdate[0].id));
      }

      const targetUpdate = await tx
        .update(inventory)
        .set({ quantity: sql`${inventory.quantity} - ${requestingQuantity}` })
        .where(
          and(
            eq(inventory.agentId, targetAgentId),
            eq(inventory.itemType, requestingItemType),
            sql`${inventory.quantity} >= ${requestingQuantity}`
          )
        )
        .returning();

      if (targetUpdate.length === 0) {
        tradeError = 'Failed to remove target items - concurrent modification detected';
        throw new Error(tradeError);
      }

      if (targetUpdate[0].quantity <= 0) {
        await tx.delete(inventory).where(eq(inventory.id, targetUpdate[0].id));
      }

      await tx
        .insert(inventory)
        .values({
          id: uuid(),
          agentId: initiatorAgentId,
          itemType: requestingItemType,
          quantity: receivedQuantity,
        })
        .onConflictDoUpdate({
          target: [inventory.agentId, inventory.itemType],
          set: { quantity: sql`${inventory.quantity} + ${receivedQuantity}` },
        });

      await tx
        .insert(inventory)
        .values({
          id: uuid(),
          agentId: targetAgentId,
          itemType: offeringItemType,
          quantity: offeringQuantity,
        })
        .onConflictDoUpdate({
          target: [inventory.agentId, inventory.itemType],
          set: { quantity: sql`${inventory.quantity} + ${offeringQuantity}` },
        });
    });
  } catch (error) {
    return {
      success: false,
      error: tradeError || (error instanceof Error ? error.message : 'Trade transaction failed'),
    };
  }

  return { success: true };
}

/**
 * Update inventory quantity directly (for spoilage system)
 * If newQuantity <= 0, deletes the item
 */
export async function updateInventoryQuantity(
  agentId: string,
  itemType: string,
  newQuantity: number
): Promise<number> {
  const item = await getInventoryItem(agentId, itemType);

  if (!item) {
    return -1; // Item not found
  }

  if (newQuantity <= 0) {
    // Delete the record
    await db.delete(inventory).where(eq(inventory.id, item.id));
    return 0;
  } else {
    // Update quantity
    await db
      .update(inventory)
      .set({ quantity: newQuantity })
      .where(eq(inventory.id, item.id));
    return newQuantity;
  }
}

/**
 * Delete all inventory items (for world reset)
 */
export async function deleteAllInventory(): Promise<void> {
  await db.delete(inventory);
}
