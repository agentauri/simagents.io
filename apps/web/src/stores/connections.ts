import { assertOfficialRelay } from '../services/official-relay';
import { create } from 'zustand';
import { validateConnectionProfile, type ConnectionProfile } from '@simagents/shared';
const KEY = 'simagents_connections_v1';
function load(): ConnectionProfile[] {
  try { const data = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(data) ? data.map(validateConnectionProfile) : []; }
  catch { return []; } // Preserve invalid storage for recovery; never delete on read.
}
export const useConnectionsStore = create<{
  profiles: ConnectionProfile[];
  migrationError?: string;
  save: (profile: ConnectionProfile) => void;
  remove: (id: string) => void;
}>((set, get) => ({
  profiles: load(),
  save: (profile) => {
    const checked = validateConnectionProfile(profile);
    assertOfficialRelay(checked);
    const profiles = [...get().profiles.filter((p) => p.id !== checked.id), checked];
    if (profiles.length > 100) throw new Error('At most 100 connection profiles can be saved');
    localStorage.setItem(KEY, JSON.stringify(profiles)); set({ profiles });
  },
  remove: (id) => { const profiles = get().profiles.filter((p) => p.id !== id); localStorage.setItem(KEY, JSON.stringify(profiles)); set({ profiles }); },
}));
