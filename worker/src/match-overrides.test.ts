import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInputFingerprints,
  buildProductFingerprint,
  getItemMatchOverrides,
  getProductOverrideStatus,
  type ProductMatchOverride,
} from "./match-overrides.js";
import type { PriceListInputItem, ProductSearchResult } from "./types.js";

test("conserva letras del codigo interno y prioriza EAN antes que texto", () => {
  const fingerprints = buildInputFingerprints({
    rowNumber: 2,
    code: "ARC-1014414",
    ean13Di: "7790-0404-0560-8",
    description: "Alfajor Hamlet",
  });

  assert.equal(fingerprints[0], "ean:7790040405608");
  assert.ok(fingerprints.includes("code:arc1014414"));
  assert.ok(fingerprints.includes("text:alfajor hamlet"));
});

test("encuentra una decision por identificador aunque cambie la descripcion", () => {
  const item: PriceListInputItem = {
    rowNumber: 8,
    code: "ARC-1014414",
    description: "Nombre actualizado",
  };
  const override = createOverride({
    inputFingerprint: "text:nombre anterior",
    inputCode: "ARC-1014414",
  });

  assert.deepEqual(getItemMatchOverrides(item, [override]), [override]);
});

test("reutiliza confirmacion por URL estable aunque cambien query params", () => {
  const product = createProduct();
  const override = createOverride({
    productFingerprint: buildProductFingerprint({
      sourceId: product.sourceId,
      productName: product.rawName,
      productUrl: `${product.productUrl}?utm_source=prueba`,
    }),
    status: "confirmed",
  });

  assert.equal(getProductOverrideStatus(product, [override]), "confirmed");
});

function createOverride(
  values: Partial<ProductMatchOverride> = {},
): ProductMatchOverride {
  return {
    id: "override-1",
    inputFingerprint: "code:arc1014414",
    inputDescription: "Alfajor Hamlet",
    inputCode: "ARC-1014414",
    inputEan13Di: null,
    inputEan13Bu: null,
    sourceId: "yaguar-chaco-auth",
    productFingerprint: "url:yaguar.com.ar/productos/alfajor-hamlet",
    productName: "Alfajor Hamlet Mousse Mani 34,5gr",
    productUrl: "https://yaguar.com.ar/productos/alfajor-hamlet",
    status: "rejected",
    updatedAt: "2026-07-20T12:00:00.000Z",
    ...values,
  };
}

function createProduct(): ProductSearchResult {
  return {
    sourceId: "yaguar-chaco-auth",
    storeName: "Yaguar",
    storeType: "mayorista",
    rawName: "Alfajor Hamlet Mousse Mani 34,5gr",
    normalizedName: "alfajor hamlet mousse mani 34 5gr",
    price: 500,
    currency: "ARS",
    productUrl: "https://yaguar.com.ar/productos/alfajor-hamlet",
    imageUrl: null,
    confidenceScore: 65,
  };
}
