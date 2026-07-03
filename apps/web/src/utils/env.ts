/**
 * Environment Utilities
 */

export type EngineMode = 'local' | 'remote';

const ENGINE_MODE: EngineMode = import.meta.env.VITE_ENGINE_MODE === 'remote' ? 'remote' : 'local';

export function getEngineMode(): EngineMode {
  return ENGINE_MODE;
}

export function isLocalEngineMode(): boolean {
  return ENGINE_MODE === 'local';
}

export function isRemoteEngineMode(): boolean {
  return ENGINE_MODE === 'remote';
}

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
