import assert from "node:assert/strict";
import test from "node:test";
import { mergeLatestObservedProducts, stampObservedProducts, summarizePriceObservations } from "./price-observations.js";
import type { ProductSearchResult } from "./types.js";

const OLD = "2026-09-01T15:00:00.000Z";
const NEW = "2026-09-22T15:00:00.000Z";
function product(sku: string, price: number, observedAt?: string): ProductSearchResult {
  return { sourceId: "maxi", storeName: "Maxiconsumo", storeType: "mayorista", sku,
    rawName: "Alfajor 60 g", normalizedName: "alfajor 60 g", price,
    currency: "ARS", productUrl: null, imageUrl: null, confidenceScore: 95, observedAt };
}

test("una suba reemplaza el precio anterior del mismo SKU sin importar el orden", () => {
  const old = product("1", 100, OLD);
  const fresh = product("1", 150, NEW);
  assert.deepEqual(mergeLatestObservedProducts([old, fresh]), [fresh]);
  assert.deepEqual(mergeLatestObservedProducts([fresh, old]), [fresh]);
});

test("un sync parcial solo renueva los productos realmente consultados", () => {
  const retained = product("2", 200, OLD);
  const undated = product("3", 300);
  const incoming = stampObservedProducts([product("1", 150)], NEW);
  const merged = mergeLatestObservedProducts([product("1", 100, OLD), retained, undated, ...incoming]);
  assert.equal(merged.find((p) => p.sku === "2")?.observedAt, OLD);
  assert.equal(merged.find((p) => p.sku === "3")?.observedAt, undefined);
  assert.deepEqual(summarizePriceObservations(merged, Date.parse(NEW)), {
    totalProducts: 3, datedProducts: 2, oldestObservedAt: OLD, newestObservedAt: NEW,
    currentProducts: 1, outdatedProducts: 1, undatedProducts: 1, calculatedAt: NEW,
  });
  assert.deepEqual(mergeLatestObservedProducts(merged), merged);
});

test("una fecha futura o invalida no cuenta como precio vigente", () => {
  const summary = summarizePriceObservations([
    product("1", 100, "2099-01-01T00:00:00Z"), product("2", 100, "invalid"),
    product("3", 100, NEW), product("4", 100, OLD),
  ], Date.parse(NEW));
  assert.equal(summary.currentProducts, 1);
  assert.equal(summary.outdatedProducts, 1);
  assert.equal(summary.undatedProducts, 2);
  assert.equal(summary.newestObservedAt, NEW);
});

test("no reemplaza un precio fechado con una copia sin fecha ni mezcla bulto y unidad", () => {
  const fresh = product("1", 150, NEW);
  const pack = { ...fresh, packageQuantity: 40, price: 6000 };
  const merged = mergeLatestObservedProducts([fresh, product("1", 80), pack]);
  assert.deepEqual(merged, [fresh, pack]);
});

test("un stock mas reciente reemplaza el anterior y no colapsa SKU de otra fuente", () => {
  const old = product("1", 100, OLD);
  const fresh = { ...product("1", 150, NEW), availability: "out_of_stock" as const };
  const other = { ...old, sourceId: "vea" };
  assert.deepEqual(mergeLatestObservedProducts([old, fresh, other]), [fresh, other]);
});
