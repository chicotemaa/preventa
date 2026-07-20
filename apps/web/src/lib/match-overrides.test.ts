import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInputFingerprint,
  buildProductFingerprint,
} from "./match-overrides";

test("fingerprint prioriza EAN y normaliza sus separadores", () => {
  assert.equal(
    buildInputFingerprint({
      rowNumber: 1,
      ean13Di: "7790-0404-0560-8",
      code: "ARC-1014414",
      description: "Alfajor Hamlet",
    }),
    "ean:7790040405608",
  );
});

test("fingerprint de codigo conserva letras y elimina separadores", () => {
  assert.equal(
    buildInputFingerprint({ rowNumber: 1, code: "ARC-1014414" }),
    "code:arc1014414",
  );
});

test("fingerprint de producto ignora query params de la URL", () => {
  assert.equal(
    buildProductFingerprint({
      sourceId: "maxiconsumo-chaco-auth",
      productName: "Alfajor de prueba",
      productUrl: "https://maxiconsumo.com/producto/1/?utm_source=prueba",
    }),
    "url:maxiconsumo.com/producto/1",
  );
});
