import assert from "node:assert/strict";
import test from "node:test";
import { summarizePriceListOwnPrices } from "./price-list-own-price-summary";
import type { PriceListItemResult } from "@/types/search";

test("resume Excel, Tokin y faltantes sin contar precios de mercado", () => {
  const summary = summarizePriceListOwnPrices([
    buildResult(1, 1_100, 1_000),
    buildResult(2, null, 900),
    buildResult(3, null, null, 850),
    buildResult(4, null, null),
  ]);

  assert.deepEqual(summary, {
    itemsCount: 4,
    ownPriceCount: 3,
    excelPriceCount: 2,
    tokinPriceCount: 2,
    missingOwnPriceCount: 1,
    coverageRatio: 0.75,
    canPersist: true,
    coverageComplete: false,
  });
});

test("bloquea persistencia si no existe ninguna referencia propia", () => {
  const summary = summarizePriceListOwnPrices([buildResult(1, null, null)]);

  assert.equal(summary.canPersist, false);
  assert.equal(summary.missingOwnPriceCount, 1);
});

function buildResult(
  rowNumber: number,
  excelPrice: number | null,
  tokinPrice: number | null,
  inputPrice?: number,
): PriceListItemResult {
  const normalizedExcelPrice = excelPrice ?? inputPrice ?? null;
  const selectedPrice = normalizedExcelPrice ?? tokinPrice;

  return {
    input: {
      rowNumber,
      description: `Producto ${rowNumber}`,
      currentPrice: inputPrice,
    },
    ownPrice: {
      excelPrice,
      tokinPrice,
      selectedPrice,
      selectedSource: normalizedExcelPrice ? "excel" : tokinPrice ? "tokin" : null,
      selectionReason: normalizedExcelPrice
        ? tokinPrice
          ? "excel_priority"
          : "excel_only"
        : tokinPrice
          ? "tokin_fallback"
          : "missing",
      excelVsTokinGapRatio: null,
    },
    queryUsed: null,
    status: "not_found",
    bestPrice: null,
    bestSource: null,
    sourcePrices: [],
    matchedCount: 0,
  };
}
