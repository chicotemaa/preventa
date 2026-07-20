import type { PriceListOwnPrice } from "./types.js";

export function buildPriceListOwnPrice(
  excelPriceValue: number | null | undefined,
  tokinPriceValue: number | null | undefined,
): PriceListOwnPrice {
  const excelPrice = normalizePrice(excelPriceValue);
  const tokinPrice = normalizePrice(tokinPriceValue);
  const selectedPrice = excelPrice ?? tokinPrice;
  const selectedSource = excelPrice ? "excel" : tokinPrice ? "tokin" : null;
  const selectionReason = excelPrice
    ? tokinPrice
      ? "excel_priority"
      : "excel_only"
    : tokinPrice
      ? "tokin_fallback"
      : "missing";

  return {
    excelPrice,
    tokinPrice,
    selectedPrice,
    selectedSource,
    selectionReason,
    excelVsTokinGapRatio:
      excelPrice && tokinPrice ? (excelPrice - tokinPrice) / tokinPrice : null,
  };
}

function normalizePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
