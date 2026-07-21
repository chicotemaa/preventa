import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogSyncWindow,
  withProcessedCatalogTerms,
} from "./catalog-sync-window.js";

test("divide el catalogo en bloques sin exceder el total", () => {
  const window = buildCatalogSyncWindow(215, { maxTerms: 80, offset: 160 });

  assert.deepEqual(window, {
    totalTerms: 215,
    offset: 160,
    limit: 55,
    nextOffset: 0,
    complete: false,
  });
});

test("normaliza offsets diarios mayores que la cantidad de terminos", () => {
  const window = buildCatalogSyncWindow(200, { maxTerms: 80, offset: 240 });

  assert.equal(window.offset, 40);
  assert.equal(window.limit, 80);
  assert.equal(window.nextOffset, 120);
});

test("informa el avance real si una fuente corta antes del bloque previsto", () => {
  const window = buildCatalogSyncWindow(240, { maxTerms: 80, offset: 80 });

  assert.deepEqual(withProcessedCatalogTerms(window, 23), {
    totalTerms: 240,
    offset: 80,
    processedTerms: 23,
    nextOffset: 103,
    complete: false,
  });
});
