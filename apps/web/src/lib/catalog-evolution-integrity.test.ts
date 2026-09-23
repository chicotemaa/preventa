import assert from "node:assert/strict";
import test from "node:test";
import { refreshDailyEvolutionSnapshot } from "./catalog-evolution-snapshot";

async function scenario(options: { count?: number; existing?: boolean; missing?: boolean; incomplete?: boolean; insertFailure?: boolean; expired?: boolean } = {}) {
  const savedEnv = { ...process.env };
  const fetchBefore = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: "https://db.example.test", SUPABASE_SERVICE_ROLE_KEY: "test-only", SUPABASE_PERSIST_PRICE_LISTS: "true", WORKER_URL: "https://worker.example.test" });
  const state = { evaluated: 0, inserted: 0, published: false, rollback: false, headersInserted: 0 };
  const count = options.count ?? 1;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "GET" && url.pathname.endsWith("/price_list_runs")) {
      assert.equal(url.searchParams.get("status"), "neq.archived");
      if (url.searchParams.has("list_name")) {
        assert.equal(url.searchParams.get("metadata->>sourceRunId"), "eq.active-excel");
        assert.equal(url.searchParams.get("metadata->>origin"), "eq.scheduled_catalog");
        return Response.json(options.existing ? [{ id: "already-complete" }] : []);
      }
      assert.equal(url.searchParams.get("limit"), "1", "no usar Excel anterior como fallback");
      assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
      return Response.json(options.missing ? [] : [{ id: "active-excel" }]);
    }
    if (method === "GET" && url.pathname.endsWith("/price_list_run_items")) {
      assert.equal(url.searchParams.get("run_id"), "eq.active-excel");
      const offset = Number(url.searchParams.get("offset"));
      return Response.json(Array.from({ length: Math.min(500, Math.max(0, count - offset)) }, (_, i) => ({
        row_number: offset + i + 1, code: String(offset + i + 1), description: "Alfajor", rubro: null,
        ean13_di: null, ean13_bu: null, current_price: 1000, source_prices: [],
      })));
    }
    if (url.pathname === "/catalog/price-list") {
      const { items } = JSON.parse(String(init?.body));
      state.evaluated += items.length;
      return Response.json({ searchedAt: new Date().toISOString(), itemsCount: items.length, matchedCount: 0, unmatchedCount: items.length, durationMs: 1,
        catalog: { status: "ready", sources: [], brands: [], productsCount: 2000, region: { id: "argentina" } }, sources: [],
        results: (options.incomplete ? items.slice(1) : items).map((item: { rowNumber: number }) => ({
          input: item, status: "not_found", bestPrice: null, bestSource: null, sourcePrices: [], matchedCount: 0,
          ownPrice: { excelPrice: 1000, tokinPrice: null, selectedPrice: 1000, selectedSource: "excel", excelVsTokinGapRatio: null },
        })),
      });
    }
    if (method === "POST" && url.pathname.endsWith("/price_list_runs")) {
      assert.equal(JSON.parse(String(init?.body)).status, "archived");
      state.headersInserted += 1;
      return Response.json([{ id: "new-run" }]);
    }
    if (method === "POST" && url.pathname.endsWith("/price_list_run_items")) {
      if (options.insertFailure) return Response.json({ error: "storage failed" }, { status: 503 });
      state.inserted += JSON.parse(String(init?.body)).length;
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH") {
      assert.equal(state.inserted, count, "solo activar la carga completa");
      state.published = true;
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      state.rollback = true;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  };
  try {
    const result = await refreshDailyEvolutionSnapshot({ workerUrl: "https://worker.example.test", ...(options.expired ? { deadline: Date.now() - 1 } : {}) });
    return { result, ...state };
  } finally {
    globalThis.fetch = fetchBefore;
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PERSIST_PRICE_LISTS", "WORKER_URL"]) {
      if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
    }
  }
}

test("captura las 1501 filas y publica solo despues de guardar todos los detalles", async () => {
  const check = await scenario({ count: 1501 });
  assert.equal(check.result.saved, true);
  assert.equal(check.evaluated, 1501);
  assert.equal(check.inserted, 1501);
  assert.equal(check.published, true);
});

test("solo una captura completa del mismo Excel bloquea la repeticion diaria", async () => {
  const check = await scenario({ existing: true });
  assert.equal(check.result.skippedReason, "already_saved");
  assert.equal(check.evaluated, 0);
  assert.equal(check.result.sourceRunId, "active-excel");
});

test("sin Excel activo no se adopta una captura historica ni se sustituye por Tokin", async () => {
  const check = await scenario({ missing: true });
  assert.equal(check.result.skippedReason, "missing_watchlist");
  assert.equal(check.evaluated, 0);
});

test("una respuesta parcial no genera una captura diaria aparentemente completa", async () => {
  const check = await scenario({ incomplete: true });
  assert.equal(check.result.saved, false);
  assert.equal(check.headersInserted, 0);
  assert.match(check.result.errorMessage ?? "", /incompleta/);
});

test("si falla el detalle, la carga no se activa y se intenta rollback", async () => {
  const check = await scenario({ insertFailure: true });
  assert.equal(check.result.saved, false);
  assert.equal(check.published, false);
  assert.equal(check.rollback, true);
});

test("cartera que excede capacidad o tiempo se rechaza sin recortarla", async () => {
  for (const options of [{ count: 10001 }, { expired: true }]) {
    const check = await scenario(options);
    assert.equal(check.result.saved, false);
    assert.equal(check.headersInserted, 0);
    assert.equal(check.evaluated, 0);
  }
});
