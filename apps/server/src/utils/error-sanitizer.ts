/**
 * Error Sanitizer
 *
 * Sanitizes error messages to prevent sensitive information disclosure.
 * Removes database URLs, API keys, file paths, and other sensitive patterns.
 */

// Patterns that match sensitive information
const SENSITIVE_PATTERNS = [
  // Database connection strings
  /postgres:\/\/[^@\s]+@[^/\s]+/gi,
  /postgresql:\/\/[^@\s]+@[^/\s]+/gi,
  /mysql:\/\/[^@\s]+@[^/\s]+/gi,
  /mongodb:\/\/[^@\s]+@[^/\s]+/gi,

  // Redis connection strings
  /redis:\/\/[^@\s]*@?[^/\s]+/gi,
  /rediss:\/\/[^@\s]*@?[^/\s]+/gi,

  // API keys and tokens
  /sk-[a-zA-Z0-9]{20,}/gi, // OpenAI/Anthropic style keys
  /api[_-]?key[=:]\s*\S+/gi,
  /bearer\s+[a-zA-Z0-9_\-.]+/gi,

  // AgentsCity agent keys
  /ac_[a-f0-9]{64}/gi,

  // Generic secrets
  /password[=:]\s*\S+/gi,
  /secret[=:]\s*\S+/gi,
  /token[=:]\s*\S+/gi,
];

// Patterns for file paths (only redact in production)
const FILE_PATH_PATTERN = /\/[^\s:]+\.(ts|js|tsx|jsx):\d+:\d+/g;

/**
 * Error codes for categorized error responses
 */
export enum ErrorCode {
  DATABASE_ERROR = 'DATABASE_ERROR',
  AUTHENTICATION_ERROR = 'AUTH_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * Sanitize an error message by removing sensitive patterns
 */
export function sanitizeErrorMessage(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = String(error);
  }

  // Replace sensitive patterns with [REDACTED]
  for (const pattern of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, '[REDACTED]');
  }

  // In production, also redact file paths with line numbers
  if (process.env.NODE_ENV === 'production') {
    message = message.replace(FILE_PATH_PATTERN, '[internal]');
  }

  return message;
}

/**
 * Get a generic error message for a given error code (used in production)
 */
function getGenericErrorMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.DATABASE_ERROR:
      return 'A database error occurred. Please try again later.';
    case ErrorCode.AUTHENTICATION_ERROR:
      return 'Authentication failed. Please check your credentials.';
    case ErrorCode.VALIDATION_ERROR:
      return 'Invalid request. Please check your input.';
    case ErrorCode.RATE_LIMIT_ERROR:
      return 'Rate limit exceeded. Please slow down.';
    case ErrorCode.NOT_FOUND_ERROR:
      return 'Resource not found.';
    case ErrorCode.CONFLICT_ERROR:
      return 'Conflict with current state. Please retry.';
    case ErrorCode.EXTERNAL_SERVICE_ERROR:
      return 'External service unavailable. Please try again later.';
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 'An internal error occurred. Please try again later.';
  }
}

/**
 * Create a safe error response object
 */
export function createSafeErrorResponse(
  error: unknown,
  code: ErrorCode = ErrorCode.INTERNAL_ERROR
): { error: string; code: ErrorCode; message: string } {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    error: code,
    code,
    message: isDev ? sanitizeErrorMessage(error) : getGenericErrorMessage(code),
  };
}

/**
 * Safely log an error without exposing sensitive information
 */
export function safeLogError(prefix: string, error: unknown): void {
  const sanitizedMessage = sanitizeErrorMessage(error);
  console.error(`[${prefix}] ${sanitizedMessage}`);

  // In development, also log the original error for debugging
  if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
    console.error('Stack trace:', error.stack);
  }
}

/**
 * Wrap an async function with safe error logging
 */
export function withSafeErrorLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  prefix: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      safeLogError(prefix, error);
      throw error;
    }
  }) as T;
}
