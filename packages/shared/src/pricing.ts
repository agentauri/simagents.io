import catalog from './provider-prices.json';
export interface PublishedPrice {
  providerId: string; modelId: string; endpoint: string; currency: string;
  inputPerMillion: number; outputPerMillion: number; retrievedAt: string; source: string;
  conditions: string[]; maximumInputTokensPerRequest: number | null;
}
export const PRICE_CATALOG_VERSION = catalog.version;
export const PUBLISHED_PRICES: readonly PublishedPrice[] = catalog.prices;
/** Match the exact commercial route and requested SKU; never substitute another model's price. */
export function publishedPrice(context: { providerId: string; modelId: string; endpoint: string } | undefined): PublishedPrice | undefined {
  if (!context) return;
  return PUBLISHED_PRICES.find(price => price.providerId === context.providerId && price.modelId === context.modelId && price.endpoint === context.endpoint);
}
