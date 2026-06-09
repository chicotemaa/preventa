import { normalizeProductName } from "./normalizers.js";
import type { ProductSearchResult } from "./types.js";

export function productIsInStock(product: ProductSearchResult) {
  if (product.availability === "out_of_stock") {
    return false;
  }

  if (
    typeof product.stockQuantity === "number" &&
    Number.isFinite(product.stockQuantity) &&
    product.stockQuantity <= 0
  ) {
    return false;
  }

  return !textLooksOutOfStock(
    product.rawName,
    product.priceCondition,
    ...(product.alternatePrices ?? []).map((price) => price.label),
  );
}

export function textLooksOutOfStock(
  ...values: Array<string | null | undefined>
) {
  const normalizedText = normalizeProductName(
    values.filter(Boolean).join(" "),
  );

  if (!normalizedText) {
    return false;
  }

  return [
    /\bsin\s+stock\b/,
    /\bstock\s+agotad[oa]s?\b/,
    /\bagotad[oa]s?\b/,
    /\bno\s+disponible\b/,
    /\bsin\s+disponibilidad\b/,
    /\bfuera\s+de\s+stock\b/,
    /\bout\s+of\s+stock\b/,
    /\bsold\s+out\b/,
    /\bunavailable\b/,
  ].some((pattern) => pattern.test(normalizedText));
}

