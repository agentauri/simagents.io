import {
  LLM_CATALOG,
  type LLMType,
} from '@simagents/shared';

export interface KeySource {
  getKey(provider: LLMType): string | undefined;
}

export type ProviderAvailability = Record<
  LLMType,
  { available: boolean; reason?: 'no-key' | 'needs-proxy' }
>;

export function providerAvailability(
  keySource: KeySource,
  proxyUrl?: string
): ProviderAvailability {
  const result: Partial<ProviderAvailability> = {};

  for (const provider of LLM_CATALOG) {
    const key = keySource.getKey(provider.id);
    if (!key) {
      result[provider.id] = { available: false, reason: 'no-key' };
      continue;
    }
    if (provider.cors === 'proxy' && !proxyUrl) {
      result[provider.id] = { available: false, reason: 'needs-proxy' };
      continue;
    }
    result[provider.id] = { available: true };
  }

  return result as ProviderAvailability;
}
