/**
 * Animation Manager for isometric agent movement
 * Handles smooth interpolation between grid positions and animation frame cycling
 */

import { ANIM_FRAME_DURATION, MOVE_SPEED, getFacingDirection } from './agentSprites';

export interface AnimationState {
  // Current visual position (interpolated)
  visualX: number;
  visualY: number;
  // Target grid position
  targetGridX: number;
  targetGridY: number;
  // Previous target (for direction calculation)
  prevGridX: number;
  prevGridY: number;
  // Animation state
  animFrame: number;       // Current frame index (0-2 for walk)
  facing: 'se' | 'sw';     // Current facing direction
  isMoving: boolean;       // Whether currently moving
  // Timing
  lastFrameTime: number;   // Last animation frame change time
}

export class AgentAnimationManager {
  private states: Map<string, AnimationState> = new Map();
  private lastUpdateTime: number = 0;

  /**
   * Set a new target position for an agent
   */
  setTarget(agentId: string, gridX: number, gridY: number): void {
    const existing = this.states.get(agentId);

    if (existing) {
      // Only update if target changed
      if (existing.targetGridX !== gridX || existing.targetGridY !== gridY) {
        existing.prevGridX = existing.targetGridX;
        existing.prevGridY = existing.targetGridY;
        existing.targetGridX = gridX;
        existing.targetGridY = gridY;

        // Calculate facing direction from movement
        const dx = gridX - existing.prevGridX;
        const dy = gridY - existing.prevGridY;
        if (dx !== 0 || dy !== 0) {
          existing.facing = getFacingDirection(dx, dy);
        }
      }
    } else {
      // New agent - start at target position
      this.states.set(agentId, {
        visualX: gridX,
        visualY: gridY,
        targetGridX: gridX,
        targetGridY: gridY,
        prevGridX: gridX,
        prevGridY: gridY,
        animFrame: 0,
        facing: 'se',
        isMoving: false,
        lastFrameTime: performance.now(),
      });
    }
  }

  /**
   * Update all agent animations
   * @param currentTime Current timestamp from performance.now()
   */
  update(currentTime: number): void {
    const deltaTime = this.lastUpdateTime > 0
      ? (currentTime - this.lastUpdateTime) / 1000
      : 0;
    this.lastUpdateTime = currentTime;

    const moveAmount = MOVE_SPEED * deltaTime;

    for (const [agentId, state] of this.states) {
      // Calculate distance to target
      const dx = state.targetGridX - state.visualX;
      const dy = state.targetGridY - state.visualY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.01) {
        // Moving towards target
        state.isMoving = true;

        if (dist <= moveAmount) {
          // Arrived at target
          state.visualX = state.targetGridX;
          state.visualY = state.targetGridY;
        } else {
          // Interpolate towards target
          const ratio = moveAmount / dist;
          state.visualX += dx * ratio;
          state.visualY += dy * ratio;
        }

        // Update animation frame
        if (currentTime - state.lastFrameTime >= ANIM_FRAME_DURATION) {
          state.animFrame = (state.animFrame + 1) % 3;
          state.lastFrameTime = currentTime;
        }
      } else {
        // At rest
        state.isMoving = false;
        state.animFrame = 0;
      }
    }
  }

  /**
   * Get current animation state for an agent
   */
  getState(agentId: string): AnimationState | null {
    return this.states.get(agentId) ?? null;
  }

  /**
   * Get all agent states for depth sorting
   */
  getAllStates(): Map<string, AnimationState> {
    return this.states;
  }

  /**
   * Remove an agent from tracking
   */
  removeAgent(agentId: string): void {
    this.states.delete(agentId);
  }

  /**
   * Clear all agent states
   */
  clear(): void {
    this.states.clear();
    this.lastUpdateTime = 0;
  }

  /**
   * Sync tracked agents with current agent list
   * Removes agents that are no longer present
   */
  syncAgents(currentAgentIds: Set<string>): void {
    for (const agentId of this.states.keys()) {
      if (!currentAgentIds.has(agentId)) {
        this.states.delete(agentId);
      }
    }
  }
}
