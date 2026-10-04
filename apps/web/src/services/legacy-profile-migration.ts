import { defaultConnection, getProviderCatalogEntry, isLLMProviderId, validateConnectionProfile, validateRoster, type AgentRosterEntry, type ConnectionProfile } from '@simagents/shared';
export const LEGACY_ROSTER_BACKUP_KEY = 'simagents_roster_before_profiles_v1';
const ROSTER_KEY = 'simagents_agent_roster';
const PROFILES_KEY = 'simagents_connections_v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
/** Reversible metadata migration only: no keys are read and no network requests are made. */
export function migrateLegacyProfiles(storage: StorageLike, fallbackRoster: AgentRosterEntry[]) {
  const oldRoster = storage.getItem(ROSTER_KEY);
  const oldProfiles = storage.getItem(PROFILES_KEY);
  let roster: AgentRosterEntry[];
  let profiles: ConnectionProfile[];
  try {
    roster = validateRoster(oldRoster === null ? fallbackRoster : JSON.parse(oldRoster));
    const parsed = JSON.parse(oldProfiles ?? '[]');
    if (!Array.isArray(parsed) || parsed.length > 100) throw new Error();
    profiles = parsed.map(validateConnectionProfile);
    if (new Set(profiles.map((p) => p.id)).size !== profiles.length) throw new Error();
  } catch { throw new Error('Stored roster or connection metadata is invalid. Original data was preserved.'); }
  const proxy = storage.getItem('simagents_proxy_url') ?? '';
  const notices: string[] = [];
  let changed = false;
  const nextRoster = roster.map((entry) => {
    if (!isLLMProviderId(entry.provider) || entry.connectionId) return entry;
    let profile = defaultConnection(entry.provider, proxy);
    if (entry.provider === 'codex') profile = { ...profile, protocol: 'chat-completions', endpoint: getProviderCatalogEntry('codex')!.endpoint };
    try { profile = validateConnectionProfile(profile); }
    catch { notices.push(`${entry.name}: create a connection or configure the existing HTTPS relay before conversion.`); return entry; }
    const previous = profiles.find((p) => p.id.startsWith('migrated:') && p.providerId === profile.providerId && p.credentialRef === profile.credentialRef && p.protocol === profile.protocol && p.endpoint === profile.endpoint && p.transport === profile.transport && (p.relayUrl ?? '') === (profile.relayUrl ?? ''));
    if (previous) profile = previous;
    else {
      let id = `migrated:${entry.provider}`; let suffix = 1;
      while (profiles.some((p) => p.id === id)) id = `migrated:${entry.provider}:${suffix++}`;
      profile = { ...profile, id, name: `${profile.name} (converted)` };
      profiles.push(profile);
    }
    changed = true;
    return { ...entry, connectionId: profile.id };
  });
  if (profiles.length > 100) throw new Error('Too many connection profiles; original roster was preserved');
  if (changed) {
    if (oldRoster !== null && storage.getItem(LEGACY_ROSTER_BACKUP_KEY) === null) storage.setItem(LEGACY_ROSTER_BACKUP_KEY, oldRoster);
    const encodedProfiles = JSON.stringify(profiles);
    storage.setItem(PROFILES_KEY, encodedProfiles);
    if (storage.getItem(PROFILES_KEY) !== encodedProfiles) throw new Error('Connection metadata could not be saved; original roster was preserved');
    const encodedRoster = JSON.stringify(nextRoster);
    storage.setItem(ROSTER_KEY, encodedRoster);
    if (storage.getItem(ROSTER_KEY) !== encodedRoster) throw new Error('Roster migration could not be verified; the original backup was preserved');
  }
  return { roster: nextRoster, profiles, notices, changed };
}
