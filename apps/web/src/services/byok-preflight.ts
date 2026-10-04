import { formatIssue } from '../i18n/errors';
import { byokPreflightIssue } from './byok-preflight-issue';
export { byokPreflightIssue, internalFixturesEnabled } from './byok-preflight-issue';

export function byokPreflight(...args: Parameters<typeof byokPreflightIssue>): string | undefined {
  const issue = byokPreflightIssue(...args);
  return issue ? formatIssue(issue) : undefined;
}
