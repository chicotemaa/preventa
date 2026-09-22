import assert from "node:assert/strict";
import test from "node:test";
import { buildPriceListItemPayload } from "./price-list-persistence";
import { parseStoredPriceListDetail } from "./price-list-storage";
import { confirmedCostConditions } from "./test-fixtures/cost-conditions";
import type { PriceListItemResult } from "@/types/search";

test("payload Supabase conserva Tokin original y guarda costo ajustado, condiciones y margen", () => {
  const result: PriceListItemResult = {
    input: { rowNumber: 2, currentPrice: 1500 }, ownPrice: { excelPrice: 1500,
      tokinPrice: 1000, tokinObservedAt: new Date().toISOString(), selectedPrice: 1500,
      selectedSource: "excel", excelVsTokinGapRatio: .5 },
    costConditions: { ...confirmedCostConditions, freightPerUnit: 200 },
    queryUsed: null, status: "matched", bestPrice: null, bestSource: null, sourcePrices: [], matchedCount: 0,
  };
  const payload = buildPriceListItemPayload("run", result);
  assert.equal(payload.current_cost, 1200);
  assert.equal(payload.current_price, 1500);
  assert.equal(payload.margin_percent, 20);
  assert.equal(payload.suggested_price, 1500);
  const stored = parseStoredPriceListDetail(payload.source_prices);
  assert.deepEqual(stored.costConditions, result.costConditions);
  assert.equal(stored.ownPrice?.tokinPrice, 1000);
  const withoutConditions = buildPriceListItemPayload("run", { ...result, costConditions: null });
  assert.equal(withoutConditions.current_cost, null);
  assert.equal(withoutConditions.margin_percent, null);
  assert.equal(withoutConditions.suggested_price, null);
  assert.equal(parseStoredPriceListDetail(withoutConditions.source_prices).ownPrice?.tokinPrice, 1000);
});
