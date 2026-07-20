import type { PriceListItemResult } from "@/types/search";

export type PriceListOwnPriceSummary = {
  itemsCount: number;
  ownPriceCount: number;
  excelPriceCount: number;
  tokinPriceCount: number;
  missingOwnPriceCount: number;
  coverageRatio: number;
  canPersist: boolean;
  coverageComplete: boolean;
};

export function summarizePriceListOwnPrices(
  results: PriceListItemResult[],
): PriceListOwnPriceSummary {
  let ownPriceCount = 0;
  let excelPriceCount = 0;
  let tokinPriceCount = 0;

  for (const result of results) {
    const excelPrice = normalizePrice(
      result.ownPrice?.excelPrice ?? result.input.currentPrice,
    );
    const tokinPrice = normalizePrice(result.ownPrice?.tokinPrice);
    const selectedPrice = normalizePrice(
      result.ownPrice?.selectedPrice ?? excelPrice ?? tokinPrice,
    );

    if (excelPrice !== null) {
      excelPriceCount += 1;
    }

    if (tokinPrice !== null) {
      tokinPriceCount += 1;
    }

    if (selectedPrice !== null) {
      ownPriceCount += 1;
    }
  }

  const itemsCount = results.length;
  const missingOwnPriceCount = Math.max(itemsCount - ownPriceCount, 0);

  return {
    itemsCount,
    ownPriceCount,
    excelPriceCount,
    tokinPriceCount,
    missingOwnPriceCount,
    coverageRatio: itemsCount > 0 ? ownPriceCount / itemsCount : 0,
    canPersist: ownPriceCount > 0,
    coverageComplete: itemsCount > 0 && missingOwnPriceCount === 0,
  };
}

function normalizePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
