/**
 * Sleep Action Handler
 *
 * Rest to restore energy.
 * Restores energy over time while sleeping.
 */

import { getRuntimeConfig } from '../../config';
import { TICK_MS } from '../../engine/time';
import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, SleepParams } from '../types';
import type { Agent } from '../../db/schema';
import { storeMemory } from '../../db/queries/memories';

export async function handleSleep(
  intent: ActionIntent<SleepParams>,
  agent: Agent
): Promise<ActionResult> {
  const CONFIG = getRuntimeConfig().actions.sleep;
  const { duration } = intent.params;

  // Validate duration
  if (duration < CONFIG.minDuration || duration > CONFIG.maxDuration) {
    return {
      success: false,
      error: `Invalid sleep duration: must be between ${CONFIG.minDuration} and ${CONFIG.maxDuration} ticks`,
    };
  }

  // Check if agent is already sleeping
  if (agent.state === 'sleeping') {
    return {
      success: false,
      error: 'Agent is already sleeping',
    };
  }

  // Store memory of sleeping
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Started sleeping for ${duration} tick(s). Energy recovers as simulation time advances.`,
    importance: 5,
    emotionalValence: 0.4,
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Success - return changes and events
  return {
    success: true,
    durationMs: duration * TICK_MS,
    changes: {
      state: 'sleeping',
    },
    events: [
      {
        id: uuid(),
        type: 'agent_sleeping',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          duration,
          energyBefore: agent.energy,
          energyRestored: 0,
        },
      },
    ],
  };
}

/**
 * Wake up handler (called when sleep duration ends)
 */
export function handleWakeUp(agent: Agent, tick: number): ActionResult {
  if (agent.state !== 'sleeping') {
    return {
      success: false,
      error: 'Agent is not sleeping',
    };
  }

  return {
    success: true,
    changes: {
      state: 'idle',
    },
    events: [
      {
        id: uuid(),
        type: 'agent_woke',
        tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          finalEnergy: agent.energy,
        },
      },
    ],
  };
}
