import type {
  PriceEvolutionPoint,
  PriceEvolutionProduct,
  PriceListSourcePrice,
} from "@/types/search";
import { repairLegacyText } from "@/lib/legacy-text";

export type EvolutionSourceIssue = {
  kind: "weak_match" | "variant_mismatch" | "presentation_mismatch";
  label: string;
};

const EXCLUSIVE_VARIANTS = [
  [
    { label: "negro", aliases: ["negro", "negra", "black"] },
    { label: "blanco", aliases: ["blanco", "blanca", "white"] },
  ],
] as const;

export function getEvolutionSourceIssue(
  product: PriceEvolutionProduct,
  sourcePrice: PriceListSourcePrice,
): EvolutionSourceIssue | null {
  const productText = normalizeEvolutionText(product.description);
  const sourceText = normalizeEvolutionText(sourcePrice.productName);
  const variantMismatch = findVariantMismatch(productText, sourceText);

  if (variantMismatch) {
    return {
      kind: "variant_mismatch",
      label: `Variante distinta: ${variantMismatch}`,
    };
  }

  const productPresentation = extractPresentation(productText);
  const sourcePresentation = extractPresentation(sourceText);

  if (
    productPresentation &&
    sourcePresentation &&
    productPresentation.dimension === sourcePresentation.dimension &&
    Math.abs(productPresentation.value - sourcePresentation.value) /
      Math.max(productPresentation.value, sourcePresentation.value) >
      0.08
  ) {
    return {
      kind: "presentation_mismatch",
      label: "Presentación distinta",
    };
  }

  if (sourcePrice.confidenceScore < 60) {
    return { kind: "weak_match", label: "Coincidencia débil" };
  }

  return null;
}

export function getComparableEvolutionWholesaleSource(
  product: PriceEvolutionProduct,
  point: PriceEvolutionPoint,
) {
  return (
    point.sourcePrices
      .filter(
        (price) =>
          price.storeType === "mayorista" &&
          !getEvolutionSourceIssue(product, price),
      )
      .sort(
        (first, second) =>
          getComparablePrice(first) - getComparablePrice(second),
      )[0] ?? null
  );
}

export function isLegacyEvolutionPoint(point: PriceEvolutionPoint) {
  return point.ownPriceSnapshotStatus === "not_stored_legacy";
}

function findVariantMismatch(productText: string, sourceText: string) {
  for (const variants of EXCLUSIVE_VARIANTS) {
    const productVariant = variants.find((variant) =>
      variant.aliases.some((alias) => hasWord(productText, alias)),
    );
    const sourceVariant = variants.find((variant) =>
      variant.aliases.some((alias) => hasWord(sourceText, alias)),
    );

    if (
      productVariant &&
      sourceVariant &&
      productVariant.label !== sourceVariant.label
    ) {
      return `${productVariant.label} vs ${sourceVariant.label}`;
    }
  }

  return null;
}

function extractPresentation(value: string) {
  const matches = Array.from(
    value.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|grs?|g|ml|cc|l)\b/g),
  );
  const match = matches.at(-1);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]?.replace(",", "."));
  const unit = match[2];

  if (!Number.isFinite(amount) || !unit) {
    return null;
  }

  if (unit === "kg") {
    return { dimension: "weight", value: amount * 1000 };
  }

  if (unit === "l") {
    return { dimension: "volume", value: amount * 1000 };
  }

  return {
    dimension: unit === "ml" || unit === "cc" ? "volume" : "weight",
    value: amount,
  };
}

function normalizeEvolutionText(value: string) {
  return repairLegacyText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(value: string, word: string) {
  return new RegExp(`(?:^|\\s)${word}(?:$|\\s)`).test(value);
}

function getComparablePrice(price: PriceListSourcePrice) {
  return typeof price.comparisonPrice === "number" && price.comparisonPrice > 0
    ? price.comparisonPrice
    : price.price;
}
