import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/price-list/route";
import { businessResult } from "./test-fixtures/pricing-business";

test("conserva actividad por fila al volver del worker y rechaza filas duplicadas o invalidas", async () => {
  const oldFetch = globalThis.fetch;
  const oldWorker = process.env.WORKER_URL;
  process.env.WORKER_URL = "https://worker.example.test";
  const result = businessResult();
  const request = (body: unknown) => new Request("https://web.example.test/api/price-list", { method: "POST", body: JSON.stringify(body) });
  globalThis.fetch = async input => {
    assert.equal(String(input), "https://worker.example.test/catalog/price-list");
    return Response.json({ results: [{ ...result, input: { ...result.input, businessActivity: undefined } }] });
  };
  try {
    const response = await POST(request({ items: [result.input], persist: false }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).results[0].input.businessActivity, result.input.businessActivity);
    for (const body of [null, { items: [null] }, { items: [result.input, result.input] },
      { items: [{ ...result.input, businessActivity: { unitsSold: -1 } }] }]) {
      assert.equal((await POST(request(body))).status, 400);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldWorker === undefined) delete process.env.WORKER_URL; else process.env.WORKER_URL = oldWorker;
  }
});
