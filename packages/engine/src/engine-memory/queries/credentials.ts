/**
 * Credential queries — in-memory implementation.
 *
 * Signature-compatible with `db/queries/credentials.ts`
 * (Phase 4: Verifiable Credentials, §34).
 */

import { v4 as uuid } from 'uuid';
import type { AgentCredential, NewAgentCredential } from '../../db/schema';
import { store } from '../store';

function credentialsFor(predicate: (c: AgentCredential) => boolean): AgentCredential[] {
  return [...store.agentCredentials.values()].filter(predicate);
}

// Mirrors `orderBy(desc(agentCredentials.tick))`.
const byTickDesc = (a: AgentCredential, b: AgentCredential) => b.tick - a.tick;

/**
 * Create a new credential
 */
export async function createCredential(credential: NewAgentCredential): Promise<AgentCredential> {
  const now = new Date();
  const result: AgentCredential = {
    id: credential.id ?? uuid(),
    tenantId: credential.tenantId ?? null,
    tick: credential.tick,
    issuerId: credential.issuerId,
    issuerSignature: credential.issuerSignature,
    subjectId: credential.subjectId,
    claimType: credential.claimType,
    claimDescription: credential.claimDescription,
    claimEvidence: credential.claimEvidence ?? null,
    claimLevel: credential.claimLevel ?? null,
    expiresAtTick: credential.expiresAtTick ?? null,
    revoked: credential.revoked ?? false,
    revokedAtTick: credential.revokedAtTick ?? null,
    createdAt: credential.createdAt ?? now,
    updatedAt: credential.updatedAt ?? now,
  };
  store.agentCredentials.set(result.id, result);
  return result;
}

/**
 * Get credential by ID
 */
export async function getCredentialById(id: string): Promise<AgentCredential | undefined> {
  return store.agentCredentials.get(id);
}

/**
 * Get all credentials issued by an agent
 */
export async function getCredentialsIssuedBy(issuerId: string): Promise<AgentCredential[]> {
  return credentialsFor((c) => c.issuerId === issuerId).sort(byTickDesc);
}

/**
 * Get all credentials received by an agent (subject)
 */
export async function getCredentialsReceivedBy(subjectId: string): Promise<AgentCredential[]> {
  return credentialsFor((c) => c.subjectId === subjectId).sort(byTickDesc);
}

/**
 * Get active (non-revoked, non-expired) credentials for an agent
 */
export async function getActiveCredentials(
  subjectId: string,
  currentTick: number
): Promise<AgentCredential[]> {
  return credentialsFor(
    (c) =>
      c.subjectId === subjectId &&
      c.revoked === false &&
      (c.expiresAtTick === null || c.expiresAtTick > currentTick)
  ).sort(byTickDesc);
}

/**
 * Get credentials by claim type
 */
export async function getCredentialsByType(
  subjectId: string,
  claimType: string
): Promise<AgentCredential[]> {
  return credentialsFor(
    (c) => c.subjectId === subjectId && c.claimType === claimType && c.revoked === false
  ).sort(byTickDesc);
}

/**
 * Revoke a credential
 */
export async function revokeCredential(
  credentialId: string,
  issuerId: string,
  currentTick: number
): Promise<{ success: boolean; error?: string }> {
  // First verify the issuer owns this credential
  const credential = store.agentCredentials.get(credentialId);

  if (!credential || credential.issuerId !== issuerId) {
    return { success: false, error: 'Credential not found or not owned by issuer' };
  }

  if (credential.revoked) {
    return { success: false, error: 'Credential already revoked' };
  }

  store.agentCredentials.set(credentialId, {
    ...credential,
    revoked: true,
    revokedAtTick: currentTick,
    updatedAt: new Date(),
  });

  return { success: true };
}

/**
 * Verify a credential signature
 */
export function verifyCredentialSignature(
  credential: AgentCredential,
  computedSignature: string
): boolean {
  return credential.issuerSignature === computedSignature;
}

/**
 * Get credential statistics for an agent
 */
export async function getCredentialStats(agentId: string): Promise<{
  issued: number;
  received: number;
  revoked: number;
}> {
  const issued = credentialsFor((c) => c.issuerId === agentId);
  const received = credentialsFor((c) => c.subjectId === agentId);
  const revoked = credentialsFor((c) => c.issuerId === agentId && c.revoked === true);

  return {
    issued: issued.length,
    received: received.length,
    revoked: revoked.length,
  };
}
