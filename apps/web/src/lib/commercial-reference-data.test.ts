import assert from "node:assert/strict";
import test from "node:test";
import { getCommercialReference } from "./commercial-reference-data";
import { serializeStoredPriceListDetail } from "./price-list-storage";
import { businessResult } from "./test-fixtures/pricing-business";
import { POST } from "../app/api/price-list/reference/route";

test("usa la evaluacion diaria vinculada al Excel activo, pagina 1001 filas y entrega solo coincidencias exactas", async () => {
  const original = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const offsets: number[] = [];
  const fixture = businessResult();
  const stored = serializeStoredPriceListDetail(fixture);
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://supabase.example.test");
    if (url.pathname.endsWith("price_list_runs")) {
      if (url.searchParams.get("select") === "id") {
        if (url.searchParams.has("or")) {
          assert.match(url.searchParams.get("or")!, /sourceRunId.eq.manual/);
          return Response.json([{ id: "daily" }]);
        } else {
          assert.equal(url.searchParams.get("metadata->>origin"), "eq.manual_import");
        }
        assert.equal(url.searchParams.get("status"), "neq.archived");
        assert.equal(url.searchParams.get("limit"), "1");
        return Response.json([{ id: "manual" }]);
      }
      assert.equal(url.searchParams.get("id"), "eq.daily");
      return Response.json([{ id: "daily", list_name: "Excel prueba", created_at: "2026-09-22", searched_at: "2026-09-22", metadata: { origin: "scheduled_catalog", sourceRunId: "manual" } }]);
    }
    if (url.pathname.endsWith("price_list_run_sources")) return Response.json([]);
    if (url.pathname.endsWith("price_list_run_items")) {
      const offset = Number(url.searchParams.get("offset"));
      offsets.push(offset);
      return Response.json(Array.from({ length: Math.min(500, 1001 - offset) }, (_, index) => ({
        id: String(index + offset), row_number: index + offset + 1, current_price: 115,
        code: index + offset === 0 ? "123" : `other-${index + offset}`,
        match_status: "matched", source_prices: stored,
      })));
    }
    throw new Error("Unexpected request");
  };
  try {
    const result = await getCommercialReference();
    assert.equal(result.runId, "daily");
    assert.equal(result.results.length, 1001);
    assert.deepEqual(offsets, [0, 500, 1000]);
    assert.deepEqual(result.results[0].input.businessActivity, fixture.input.businessActivity);
    assert.equal(result.results[0].ownPrice!.tokinPrice, 70);
    const filtered = await POST(new Request("https://web.example.test/api/price-list/reference", { method: "POST", body: JSON.stringify({
      products: [{ sourceId: "aguiar-arcor-resistencia", storeName: "Tokin", storeType: "mayorista", sku: "ARC-123" }],
    }) }));
    assert.equal(filtered.status, 200);
    assert.equal((await filtered.json()).results.length, 1);
    const invalid = await POST(new Request("https://web.example.test/api/price-list/reference", { method: "POST", body: '{"products":[null]}' }));
    assert.equal(invalid.status, 400);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    const failed = await getCommercialReference();
    assert.equal(failed.results.length, 0);
    assert.match(failed.errorMessage!, /No se pudo/);
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
