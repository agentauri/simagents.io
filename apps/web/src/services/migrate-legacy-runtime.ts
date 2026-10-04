import { migrateLegacyProfiles } from './legacy-profile-migration';
import { internalFixturesEnabled } from './byok-preflight';
import { useConnectionsStore } from '../stores/connections';
import { useRosterStore } from '../stores/roster';
export function migrateLegacyRuntime(): void {
  if (internalFixturesEnabled()) return;
  try {
    const result = migrateLegacyProfiles(localStorage, useRosterStore.getState().roster);
    useConnectionsStore.setState({ profiles: result.profiles, migrationError: result.notices.join(' ') || undefined });
    useRosterStore.setState({ roster: result.roster });
  } catch (error) {
    useConnectionsStore.setState({ migrationError: error instanceof Error ? error.message : 'Legacy settings could not be converted' });
  }
}
