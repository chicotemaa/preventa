import assert from "node:assert/strict";
import test from "node:test";
import { buildCarrefourComercianteBrowserImportSnapshot } from "./carrefour-comerciante.js";
import { scrapingSources } from "./sources/argentina.js";

const source = scrapingSources.find((source) => source.id === "carrefour-comerciante-maxi")!;
const products = [{ name: "Alfajor Tatin Negro 60 g", price: 100, sku: "1" }];

test("Carrefour conserva captura manual y no usa la fecha de importacion como vigencia", () => {
  const capturedAt = "2020-01-01T00:00:00Z";
  const snapshot = buildCarrefourComercianteBrowserImportSnapshot(source, { query: "alfajor", capturedAt, products });
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.products[0]?.observedAt, capturedAt);
  const legacy = buildCarrefourComercianteBrowserImportSnapshot(source, { query: "alfajor", products });
  assert.equal(legacy.products[0]?.observedAt, undefined);
});

test("Carrefour al agregar un lote mantiene la fecha de los productos conservados", () => {
  const old = buildCarrefourComercianteBrowserImportSnapshot(source, { query: "alfajor", capturedAt: "2020-01-01T00:00:00Z", products });
  const capturedAt = new Date().toISOString();
  const appended = buildCarrefourComercianteBrowserImportSnapshot(source, { mode: "append", query: "alfajor", capturedAt,
    products: [{ name: "Alfajor Tatin Blanco 60 g", price: 150, sku: "2" }],
  }, old);
  assert.equal(appended.products.length, 2);
  assert.equal(appended.products.find((product) => product.sku === "1")?.observedAt, old.products[0]?.observedAt);
  assert.equal(appended.products.find((product) => product.sku === "2")?.observedAt, capturedAt);
});
