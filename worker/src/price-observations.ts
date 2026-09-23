import type { PriceObservationSummary, ProductSearchResult } from "./types.js";

export function isPriceObservationCurrent(observedAt?: string | null, now = Date.now()) {
  const timestamp = Date.parse(observedAt ?? "");
  return Number.isFinite(timestamp) &&
    timestamp <= now + 5 * 60_000 &&
    now - timestamp <= 36 * 3_600_000;
}

export function stampObservedProducts(
  products: ProductSearchResult[],
  observedAt = new Date().toISOString(),
) {
  return products.map((product) => ({ ...product, observedAt }));
}

export function summarizePriceObservations(
  products: ProductSearchResult[],
  now = Date.now(),
): PriceObservationSummary {
  let oldest = Infinity;
  let newest = -Infinity;
  let datedProducts = 0;
  let currentProducts = 0;
  for (const product of products) {
    const timestamp = Date.parse(product.observedAt ?? "");
    if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000) continue;
    datedProducts += 1;
    if (isPriceObservationCurrent(product.observedAt, now)) currentProducts += 1;
    oldest = Math.min(oldest, timestamp);
    newest = Math.max(newest, timestamp);
  }
  return {
    totalProducts: products.length,
    datedProducts,
    oldestObservedAt: datedProducts ? new Date(oldest).toISOString() : null,
    newestObservedAt: datedProducts ? new Date(newest).toISOString() : null,
    currentProducts,
    outdatedProducts: datedProducts - currentProducts,
    undatedProducts: products.length - datedProducts,
    calculatedAt: new Date(now).toISOString(),
  };
}

export function summarizeSourcePriceObservations(products: ProductSearchResult[], now = Date.now()) {
  const groups = new Map<string, ProductSearchResult[]>();
  for (const product of products) {
    const group = groups.get(product.sourceId) ?? [];
    group.push(product);
    groups.set(product.sourceId, group);
  }
  return Object.fromEntries([...groups].map(([sourceId, group]) => [sourceId, summarizePriceObservations(group, now)]));
}

export function mergeLatestObservedProducts(products: ProductSearchResult[]) {
  const latest = new Map<string, ProductSearchResult>();
  for (const product of products) {
    // Price is not identity: a price increase must replace the older cheap quote.
    const identity = product.sku || `${product.normalizedName}|${product.productUrl ?? ""}`;
    const key = JSON.stringify([
      product.sourceId, identity, product.packageQuantity ?? 1,
      product.packageLabel ?? "", product.priceCondition ?? "",
    ]);
    const previous = latest.get(key);
    const timestamp = Date.parse(product.observedAt ?? "");
    const previousTimestamp = Date.parse(previous?.observedAt ?? "");
    if (!previous || !Number.isFinite(previousTimestamp) || timestamp >= previousTimestamp) {
      latest.set(key, product);
    }
  }
  return [...latest.values()];
}
