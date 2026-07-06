import { execSync } from 'child_process';

let cachedHash: string | null = null;

/**
 * Get the current git commit hash (short, 7 chars).
 * Cached after first call since it doesn't change during runtime.
 */
export function getGitCommitHash(): string {
  if (cachedHash) return cachedHash;
  try {
    cachedHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    cachedHash = 'unknown';
  }
  return cachedHash;
}
