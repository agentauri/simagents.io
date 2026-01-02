/**
 * Utility functions for the simulation
 */

export {
  initializeRNG,
  resetRNG,
  getCurrentSeed,
  isSeeded,
  random,
  randomInt,
  randomBelow,
  randomChoice,
  randomBool,
  randomColor,
  shuffle,
  randomNormal,
} from './random';

// Error handling
export {
  sanitizeErrorMessage,
  createSafeErrorResponse,
  safeLogError,
  withSafeErrorLogging,
  ErrorCode,
} from './error-sanitizer';

// Input validation
export {
  validateTick,
  validateTickRange,
  validateAgentName,
  validateEndpointUrl,
  validatePagination,
  isValidUUID,
  validateUUID,
  TICK_LIMITS,
  AGENT_NAME_LIMITS,
  PAGINATION_LIMITS,
} from './validators';
