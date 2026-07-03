import { registerStoreResetHook } from '../engine-memory/store';

export interface VitalsMeta {
  vitalsUpdatedAt: number;
  criticalSince: {
    hunger?: number;
    energy?: number;
  };
}

const vitalsMetaByAgent = new Map<string, VitalsMeta>();

registerStoreResetHook(() => resetVitalsMeta());

export function getVitalsMeta(agentId: string): VitalsMeta | undefined {
  const meta = vitalsMetaByAgent.get(agentId);
  return meta ? cloneVitalsMeta(meta) : undefined;
}

export function getOrCreateVitalsMeta(agentId: string, vitalsUpdatedAt = 0): VitalsMeta {
  const existing = vitalsMetaByAgent.get(agentId);
  if (existing) return cloneVitalsMeta(existing);

  const created: VitalsMeta = {
    vitalsUpdatedAt,
    criticalSince: {},
  };
  vitalsMetaByAgent.set(agentId, created);
  return cloneVitalsMeta(created);
}

export function setVitalsMeta(agentId: string, meta: VitalsMeta): void {
  vitalsMetaByAgent.set(agentId, cloneVitalsMeta(meta));
}

export function deleteVitalsMeta(agentId: string): void {
  vitalsMetaByAgent.delete(agentId);
}

export function resetVitalsMeta(): void {
  vitalsMetaByAgent.clear();
}

/**
 * Drop metadata for agents that no longer exist or are dead (killed by paths
 * that don't go through the heartbeat, e.g. the harm handler). Mirrors the
 * legacy tick engine's periodic criticalTicksMap sweep.
 */
export function sweepVitalsMeta(isAlive: (agentId: string) => boolean): number {
  let removed = 0;
  for (const agentId of vitalsMetaByAgent.keys()) {
    if (!isAlive(agentId)) {
      vitalsMetaByAgent.delete(agentId);
      removed++;
    }
  }
  return removed;
}

function cloneVitalsMeta(meta: VitalsMeta): VitalsMeta {
  return {
    vitalsUpdatedAt: meta.vitalsUpdatedAt,
    criticalSince: { ...meta.criticalSince },
  };
}
