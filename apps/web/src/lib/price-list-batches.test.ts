import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePriceListInBatches, savePriceListForHistory } from "./price-list-batches";
import { buildPricingExample } from "./pricing-example";
import type { PriceListResponse } from "@/types/search";

function response(): PriceListResponse {
  const example = buildPricingExample();
  return { ...example, durationMs: 0, itemsCount: 10, matchedCount: 10, unmatchedCount: 0,
    sources: [], catalog: { status: "ready", region: { id: "argentina", name: "Demo", scopeLabel: "Demo" },
      brands: [], lastSyncedAt: null, durationMs: null, productsCount: 0, sources: [], pendingSources: [] } };
}

test("rechaza filas faltantes o duplicadas antes de guardar una importacion", async t => {
  for (const mode of ["missing", "duplicate", "unexpected"]) {
    const payload = response();
    if (mode === "missing") payload.results.pop();
    if (mode === "duplicate") payload.results[9] = payload.results[0];
    if (mode === "unexpected") payload.results[9].input.rowNumber = 999;
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json(payload); });
    await assert.rejects(evaluatePriceListInBatches({ items: response().results.map(row => row.input), persist: true }), /incompletas o duplicadas/);
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});

test("fallo de guardado conserva los resultados y devuelve un estado explicito", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (calls++ === 0) return Response.json(response());
    throw new TypeError("network failure");
  });
  const payload = await evaluatePriceListInBatches({ items: response().results.map(row => row.input), persist: true });
  assert.equal(payload.results.length, 10);
  assert.equal(payload.persistence?.saved, false);
  assert.match(payload.persistence?.errorMessage ?? "", /Revisar Historial/);
});

test("un timeout HTML al guardar no produce Unexpected token", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("An error occurred", { status: 504 }));
  const result = await savePriceListForHistory(response());
  assert.equal(result.saved, false);
  assert.ok(result.errorMessage);
});
