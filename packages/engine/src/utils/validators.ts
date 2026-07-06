/**
 * Input Validators
 *
 * Centralized input validation utilities for API endpoints.
 * Provides consistent validation and bounds checking.
 */

// =============================================================================
// Tick Validation
// =============================================================================

export const TICK_LIMITS = {
  MIN: 0,
  MAX: 10_000_000,
  DEFAULT_RANGE: 1000,
  MAX_RANGE: 10000,
} as const;

/**
 * Validate and sanitize a tick value
 */
export function validateTick(
  value: string | number | undefined | null,
  defaultValue = 0
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const tick = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(tick)) {
    return defaultValue;
  }

  return Math.max(TICK_LIMITS.MIN, Math.min(TICK_LIMITS.MAX, tick));
}

/**
 * Validate a tick range (from/to)
 */
export function validateTickRange(
  from: string | undefined,
  to: string | undefined
): { fromTick: number; toTick: number; error?: string } {
  const fromTick = validateTick(from, 0);
  const toTick = validateTick(to, fromTick + TICK_LIMITS.DEFAULT_RANGE);

  // Ensure toTick is greater than fromTick
  if (toTick <= fromTick) {
    return {
      fromTick,
      toTick: fromTick + TICK_LIMITS.DEFAULT_RANGE,
      error: 'toTick must be greater than fromTick',
    };
  }

  // Limit range to prevent excessive queries
  if (toTick - fromTick > TICK_LIMITS.MAX_RANGE) {
    return {
      fromTick,
      toTick: fromTick + TICK_LIMITS.MAX_RANGE,
      error: `Range limited to ${TICK_LIMITS.MAX_RANGE} ticks`,
    };
  }

  return { fromTick, toTick };
}

// =============================================================================
// Agent Name Validation
// =============================================================================

export const AGENT_NAME_LIMITS = {
  MIN_LENGTH: 1,
  MAX_LENGTH: 64,
} as const;

// Allowed characters: alphanumeric, underscore, hyphen, space
const AGENT_NAME_PATTERN = /^[a-zA-Z0-9_\-\s]+$/;

/**
 * Validate agent name
 */
export function validateAgentName(
  name: string | undefined | null
): { valid: true; sanitized: string } | { valid: false; error: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Agent name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < AGENT_NAME_LIMITS.MIN_LENGTH) {
    return { valid: false, error: 'Agent name cannot be empty' };
  }

  if (trimmed.length > AGENT_NAME_LIMITS.MAX_LENGTH) {
    return {
      valid: false,
      error: `Agent name must be ${AGENT_NAME_LIMITS.MAX_LENGTH} characters or less`,
    };
  }

  if (!AGENT_NAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: 'Agent name can only contain letters, numbers, underscores, hyphens, and spaces',
    };
  }

  return { valid: true, sanitized: trimmed };
}

// =============================================================================
// URL Validation
// =============================================================================

// Blocked hostnames in production (internal/loopback addresses)
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];

/**
 * Validate endpoint URL for external agents
 */
export function validateEndpointUrl(
  url: string | undefined | null
): { valid: true; url?: string } | { valid: false; error: string } {
  // URL is optional
  if (!url) {
    return { valid: true };
  }

  if (typeof url !== 'string') {
    return { valid: false, error: 'Endpoint URL must be a string' };
  }

  // Check URL length
  if (url.length > 2048) {
    return { valid: false, error: 'Endpoint URL is too long (max 2048 characters)' };
  }

  try {
    const parsed = new URL(url);

    // In production, require HTTPS
    if (process.env.NODE_ENV === 'production') {
      if (parsed.protocol !== 'https:') {
        return { valid: false, error: 'HTTPS is required for endpoint URLs in production' };
      }

      // Block internal/loopback addresses in production
      if (BLOCKED_HOSTS.includes(parsed.hostname.toLowerCase())) {
        return { valid: false, error: 'Internal hostnames are not allowed in production' };
      }

      // Block private IP ranges
      if (isPrivateIP(parsed.hostname)) {
        return { valid: false, error: 'Private IP addresses are not allowed in production' };
      }
    }

    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check if an IP address is in a private range
 */
function isPrivateIP(hostname: string): boolean {
  // Simple check for common private IP patterns
  const privatePatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^fc[0-9a-f]{2}:/i, // IPv6 unique local
    /^fd[0-9a-f]{2}:/i, // IPv6 unique local
  ];

  return privatePatterns.some((pattern) => pattern.test(hostname));
}

// =============================================================================
// Pagination Validation
// =============================================================================

export const PAGINATION_LIMITS = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 1000,
  DEFAULT_OFFSET: 0,
} as const;

/**
 * Validate pagination parameters
 */
export function validatePagination(
  limit: string | number | undefined,
  offset: string | number | undefined
): { limit: number; offset: number } {
  let parsedLimit =
    typeof limit === 'string'
      ? parseInt(limit, 10)
      : limit ?? PAGINATION_LIMITS.DEFAULT_LIMIT;

  let parsedOffset =
    typeof offset === 'string'
      ? parseInt(offset, 10)
      : offset ?? PAGINATION_LIMITS.DEFAULT_OFFSET;

  // Ensure valid values
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    parsedLimit = PAGINATION_LIMITS.DEFAULT_LIMIT;
  }
  if (parsedLimit > PAGINATION_LIMITS.MAX_LIMIT) {
    parsedLimit = PAGINATION_LIMITS.MAX_LIMIT;
  }

  if (isNaN(parsedOffset) || parsedOffset < 0) {
    parsedOffset = PAGINATION_LIMITS.DEFAULT_OFFSET;
  }

  return { limit: parsedLimit, offset: parsedOffset };
}

// =============================================================================
// UUID Validation
// =============================================================================

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 */
export function isValidUUID(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return UUID_PATTERN.test(id);
}

/**
 * Validate UUID with error message
 */
export function validateUUID(
  id: string | undefined | null,
  fieldName = 'ID'
): { valid: true; id: string } | { valid: false; error: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (!UUID_PATTERN.test(id)) {
    return { valid: false, error: `Invalid ${fieldName} format` };
  }

  return { valid: true, id: id.toLowerCase() };
}
