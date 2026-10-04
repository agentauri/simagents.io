import { publishedPrice, type PublishedPrice } from '@simagents/shared';
import type { AgentCounters } from '@simagents/engine/engine/metrics';
export type TokenCost = { available: true; amount: number; currency: string; price: PublishedPrice } | { available: false; reason: 'missing-usage' | 'mixed-context' | 'unknown-price' | 'outside-tier' | 'stale-price' };
/** Current published-rate estimate for recorded decisions; never an actual invoice total. */
export function estimateRecordedCost(agent: Pick<AgentCounters, 'actionsCount' | 'tokenUsage'> | undefined, now = Date.now()): TokenCost {
  const usage = agent?.tokenUsage;
  if (!agent || !usage || !agent.actionsCount || usage.completeSamples !== agent.actionsCount || usage.costEligibleSamples !== agent.actionsCount) return { available: false, reason: 'missing-usage' };
  if (usage.mixedContext) return { available: false, reason: 'mixed-context' };
  const price = publishedPrice(usage.pricingContext);
  if (!price) return { available: false, reason: 'unknown-price' };
  const age = now - Date.parse(`${price.retrievedAt}T00:00:00Z`);
  if (!Number.isFinite(age) || age < -86400000 || age > 30 * 86400000) return { available: false, reason: 'stale-price' };
  if (price.maximumInputTokensPerRequest !== null && usage.maximumInputTokens > price.maximumInputTokensPerRequest) return { available: false, reason: 'outside-tier' };
  return { available: true, amount: (usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion) / 1000000, currency: price.currency, price };
}
