import { formatIssue } from '../i18n/errors';
import type { AppIssue } from '@simagents/shared';
import { internalFixturesEnabled } from './byok-preflight';
import { isLLMProviderId, defaultCapabilities, type AgentRosterEntry, type ConnectionProfile } from '@simagents/shared';
import { verificationSignature } from './connection-verification';
import { useApiKeysStore } from '../stores/apiKeys';
import { useConnectionVerificationStore } from '../stores/connectionVerification';
import { useSessionLimitsStore } from '../stores/sessionLimits';
export function profileVerificationProblem(roster: AgentRosterEntry[], profiles: ConnectionProfile[]): AppIssue | undefined {
  for (const entry of roster) {
    if (!isLLMProviderId(entry.provider)) continue;
    if (!entry.connectionId) {
      if (internalFixturesEnabled()) continue;
      return { code: 'BYOK_MIGRATION', parameters: { agent: entry.name } };
    }
    const profile = profiles.find((p) => p.id === entry.connectionId);
    if (!profile) return { code: 'BYOK_CONNECTION', parameters: { agent: entry.name } };
    const signature = verificationSignature(profile, entry.modelId, entry.capabilities ?? defaultCapabilities(profile.providerId, entry.modelId, profile.protocol), entry.reasoningLevel,
      useSessionLimitsStore.getState().limits.maxOutputTokens, useApiKeysStore.getState().credentialRevision);
    if (useConnectionVerificationStore.getState().results[signature]?.status !== 'verified') return { code: 'MODEL_VERIFY_REQUIRED', parameters: { agent: entry.name } };
  }
}

export function profileVerificationIssue(...args: Parameters<typeof profileVerificationProblem>): string | undefined {
  const issue = profileVerificationProblem(...args);
  return issue ? formatIssue(issue) : undefined;
}
