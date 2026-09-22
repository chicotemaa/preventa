import test from "node:test";
import assert from "node:assert/strict";
import { selectCommercialReference, type CommercialReference } from "./commercial-reference";
import { analyzePriceListDecision } from "./price-list-decision";
import { businessResult, NOW } from "./test-fixtures/pricing-business";
import type { ProductSearchResult } from "@/types/search";

function product(patch: Partial<ProductSearchResult> = {}): ProductSearchResult {
  return { sourceId: "aguiar-resistencia", storeName: "Aguiar Resistencia", storeType: "mayorista", price: 99999,
    rawName: "Alfajor 60 g", normalizedName: "alfajor 60 g", currency: "ARS", confidenceScore: 95,
    barcodes: ["7790040405608"], productUrl: null, imageUrl: null, ...patch };
}
function reference(): CommercialReference {
  return { enabled: true, runId: "saved", listName: "Excel", evaluatedAt: new Date(NOW).toISOString(), results: [businessResult()] };
}

test("categoria y busqueda usan exactamente la misma evaluacion guardada que importacion", () => {
  const saved = reference();
  const selected = selectCommercialReference([product()], saved);
  assert.equal(selected.results.length, 1);
  assert.strictEqual(selected.results[0], saved.results[0]);
  assert.deepEqual(analyzePriceListDecision(selected.results[0], NOW), analyzePriceListDecision(saved.results[0], NOW));
  assert.equal(selected.results[0].ownPrice!.excelPrice, 115);
});

test("no enlaza solo por nombre, EAN de bulto ni SKU de otra empresa", () => {
  for (const p of [product({ barcodes: [] }), product({ barcodes: ["17790040405605"] }),
    product({ barcodes: [], sku: "123", sourceId: "maxiconsumo-web", storeName: "Maxiconsumo" })]) {
    assert.equal(selectCommercialReference([p], reference()).results.length, 0);
  }
});

test("SKU ARC exacto identifica Tokin; deduplica y rechaza IDs ambiguos", () => {
  const saved = reference();
  const p = product({ barcodes: [], sku: "ARC-123" });
  assert.equal(selectCommercialReference([p, p], saved).results.length, 1);
  saved.results.push({ ...businessResult(), input: { ...businessResult().input, rowNumber: 2 } });
  assert.equal(selectCommercialReference([p], saved).results.length, 0);
  assert.equal(selectCommercialReference([p], saved).ambiguous, 1);
});

test("Tokin nunca sustituye un Excel ausente ni renueva fechas de evaluaciones viejas", () => {
  const saved = reference();
  saved.results[0].ownPrice!.excelPrice = null;
  saved.results[0].input.currentPrice = undefined;
  const [selected] = selectCommercialReference([product()], saved).results;
  assert.equal(analyzePriceListDecision(selected, NOW).kind, "missing_own_price");
  assert.equal(selected.ownPrice!.tokinPrice, 70);
  saved.results[0].ownPrice!.excelPrice = 115;
  assert.equal(analyzePriceListDecision(selected, NOW + 3 * 86400000).kind, "outdated_reference");
});
