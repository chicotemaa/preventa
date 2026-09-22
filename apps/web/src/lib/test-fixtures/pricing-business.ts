import type { PriceListItemResult, PriceListSourcePrice } from "@/types/search";
import { confirmedCostConditions } from "./cost-conditions";

export const NOW = Date.parse("2026-09-22T15:00:00Z");
export function wholesale(price = 100, sourceId = "maxi"): PriceListSourcePrice {
  return { sourceId, storeName: sourceId, storeType: "mayorista", productName: "Alfajor 60 g",
    price, comparisonPrice: price, confidenceScore: 95, availability: "in_stock",
    observedAt: new Date(NOW).toISOString(), productUrl: null, currency: "ARS" };
}
export function businessResult(price = 115, unitsSold = 100): PriceListItemResult {
  const source = wholesale();
  return { input: { rowNumber: 1, code: "123", ean13Di: "7790040405608", ean13Bu: "17790040405605", description: "Alfajor 60 g", currentPrice: price,
    businessActivity: { unitsSold, periodDays: 30, salesThrough: "2026-09-22", stockUnits: 50, stockAsOf: "2026-09-22" } },
    costConditions: confirmedCostConditions,
    ownPrice: { excelPrice: price, tokinPrice: 70, tokinObservedAt: new Date(NOW).toISOString(), selectedPrice: price, selectedSource: "excel", excelVsTokinGapRatio: null },
    status: "matched", queryUsed: null, bestPrice: 100, bestSource: source, sourcePrices: [source], matchedCount: 1 };
}
