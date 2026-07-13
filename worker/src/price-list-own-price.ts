import type { PriceListOwnPrice } from "./types.js";

export function buildPriceListOwnPrice(
  excelPriceValue: number | null | undefined,
  tokinPriceValue: number | null | undefined,
): PriceListOwnPrice {
  const excelPrice = normalizePrice(excelPriceValue);
  const tokinPrice = normalizePrice(tokinPriceValue);
  const selectedPrice = tokinPrice ?? excelPrice;
  const selectedSource = tokinPrice ? "tokin" : excelPrice ? "excel" : null;

  return {
    excelPrice,
    tokinPrice,
    selectedPrice,
    selectedSource,
    excelVsTokinGapRatio:
      excelPrice && tokinPrice ? (excelPrice - tokinPrice) / tokinPrice : null,
  };
}

function normalizePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
