import { useSyncExternalStore } from 'react';
import { type ConnectionProfile } from '@simagents/shared';
import { getEngineClient } from '../engine-host/engine-client';
import { useEditorStore } from '../stores/editor';
import { officialAdmissionConfig } from './official-relay';
import { RelaySession } from './relay-session';
import { requestTurnstileProof } from './turnstile';
export const admissionConfig = officialAdmissionConfig;
const config = admissionConfig();
export const relaySession = new RelaySession({
  admissionUrl: config?.admissionUrl ?? '',
  obtainProof: requestTurnstileProof,
  onSuspend: async () => {
    const client = getEngineClient();
    if (config && client.usesRelay(config.relayUrl)) {
      useEditorStore.getState().setPaused(true);
      try { await client.suspendRelayAccess(config.relayUrl); } catch { client.resetHard(); }
    }
  },
  onToken: async token => {
    const client = getEngineClient();
    if (config && client.usesRelay(config.relayUrl)) await client.updateRelayToken(config.relayUrl, token);
  },
});
export function useRelaySession() { return useSyncExternalStore(relaySession.subscribe, relaySession.snapshot, relaySession.snapshot); }
/** Add runtime authorization without writing a vault key or changing provider credential revision. */
export function withRelayAuthorization(keys: Record<string, string>, profiles: ConnectionProfile[]): Record<string, string> {
  if (!config) return keys;
  const next = { ...keys };
  const providerRefs = new Set(profiles.map(profile => profile.credentialRef));
  for (const profile of profiles) if (profile.transport === 'official-relay' && profile.relayUrl === config.relayUrl && profile.relayCredentialRef) {
    // An imported reference cannot overwrite another profile's provider key.
    if (providerRefs.has(profile.relayCredentialRef)) continue;
    delete next[profile.relayCredentialRef];
    const token = relaySession.getToken();
    if (token) next[profile.relayCredentialRef] = token;
  }
  return next;
}
