import { secureEndpoint, type ConnectionProfile } from '@simagents/shared';
/** A deployed operator-owned URL must be explicitly supplied by the build, never guessed. */
export function officialRelayUrl(): string | undefined {
  const value = import.meta.env?.VITE_OFFICIAL_RELAY_URL;
  if (!value) return undefined;
  try { const url = secureEndpoint(value); return new URL(url).pathname === '/' ? url : undefined; } catch { return undefined; }
}
export function officialAdmissionConfig(): { admissionUrl: string; siteKey: string; relayUrl: string } | undefined {
  const relayUrl = officialRelayUrl();
  const siteKey = import.meta.env?.VITE_TURNSTILE_SITE_KEY;
  const value = import.meta.env?.VITE_ADMISSION_URL;
  if (!relayUrl || !siteKey || !value) return;
  try { const url = secureEndpoint(value); if (new URL(url).pathname !== '/') return; return { relayUrl, siteKey, admissionUrl: `${url}/v1/session` }; } catch { return; }
}
export function assertOfficialRelay(profile: ConnectionProfile): void {
  if (profile.transport === 'official-relay' && (!officialAdmissionConfig() || profile.relayUrl !== officialRelayUrl())) {
    throw new Error('This official relay is not configured for this app build');
  }
}
