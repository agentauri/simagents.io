/**
 * Witness Discovery Utility
 *
 * Shared logic for finding nearby agents who witnessed an action.
 * Used by harm and steal handlers to determine witnesses.
 */

import type { Agent } from '../../db/schema';
import { getAliveAgents } from '../../db/queries/agents';
import { getVisibleAgents } from '../../world/grid';

export interface Position {
  x: number;
  y: number;
}

/**
 * Find agents who witnessed an action at a given position.
 *
 * @param actorId - ID of the agent performing the action
 * @param targetId - ID of the target agent (excluded from witnesses)
 * @param position - Position where the action occurred
 * @param witnessRadius - Maximum distance to be considered a witness
 * @returns Array of agent objects who witnessed the action
 */
export async function findWitnesses(
  actorId: string,
  targetId: string,
  position: Position,
  witnessRadius: number
): Promise<Agent[]> {
  const allAgents = await getAliveAgents();

  // Filter out actor and target, then find those within witness radius
  const eligibleAgents = allAgents.filter(
    (a) => a.id !== actorId && a.id !== targetId
  );

  return getVisibleAgents(eligibleAgents, position, witnessRadius);
}
