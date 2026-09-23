import type { PriceListSourcePrice } from "@/types/search";

// UxB is a count, never a weight or an expression such as "3 x 12".
export function parseUnitsPerPackage(value?: string | null): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,4})(?:[.,]0+)?\s*(?:uds?\.?|unid\.?|unidades?)?$/i);
  const quantity = match ? Number(match[1]) : NaN;
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000 ? quantity : null;
}

export function getPriceConditionWarning(source: PriceListSourcePrice): string | null {
  const conditional = /promo|oferta|descuento|segunda|bulto\s+cerrado|compra\s+m[ií]nima|a\s+partir|llevando|\b\d+\s*x\s*\d+\b/i;
  if (conditional.test(source.priceCondition ?? "")) return source.priceCondition!;
  const selected = source.comparisonPrice ?? source.price;
  const alternate = source.alternatePrices?.find(price => conditional.test(price.label) &&
    Math.abs((price.comparisonPrice ?? price.price) - selected) < 0.01);
  return alternate?.label ?? null;
}
