/**
 * Environment Utilities
 */

/**
 * Check if we're running in development mode
 */
export function isDevelopment(): boolean {
  if (import.meta.env.VITE_DEV_MODE === 'true') {
    return true;
  }

  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local')
  );
}

/**
 * Check if we're running in production mode
 */
export function isProduction(): boolean {
  return !isDevelopment();
}
