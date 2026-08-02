import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWatchlistItems,
  formatArgentinaDateKey,
  refreshDailyEvolutionSnapshot,
} from "./catalog-evolution-snapshot";
import { serializeStoredPriceListDetail } from "./price-list-storage";

test("reconstruye la cartera diaria desde la ultima lista manual", () => {
  const sourcePrices = serializeStoredPriceListDetail({
    sourcePrices: [],
    ownPrice: {
      excelPrice: 1_100,
      tokinPrice: 1_000,
      selectedPrice: 1_100,
      selectedSource: "excel",
      excelVsTokinGapRatio: 0.1,
    },
    diagnostics: undefined,
    input: {
      rowNumber: 7,
      business: "Alimentos",
      segment: "Alfajores",
      subrubro: "Triples",
      line: "Chocolate",
      uxb: "24",
    },
  });
  const items = buildWatchlistItems([
    {
      row_number: 7,
      rubro: "CHOCOLATES",
      description: "BAÃ\u0091O REP AGUILA * 150 GRS",
      code: "1013331",
      ean13_di: "7790580133313",
      ean13_bu: null,
      source_prices: sourcePrices,
    },
  ]);

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    rowNumber: 7,
    business: "Alimentos",
    rubro: "CHOCOLATES",
    segment: "Alfajores",
    subrubro: "Triples",
    line: "Chocolate",
    uxb: "24",
    description: "BAÑO REP AGUILA * 150 GRS",
    code: "1013331",
    ean13Di: "7790580133313",
    ean13Bu: undefined,
    currentPrice: 1_100,
  });
});

test("no convierte el precio Tokin anterior en precio Excel", () => {
  const sourcePrices = serializeStoredPriceListDetail({
    sourcePrices: [],
    ownPrice: {
      excelPrice: null,
      tokinPrice: 900,
      selectedPrice: 900,
      selectedSource: "tokin",
      excelVsTokinGapRatio: null,
    },
    diagnostics: undefined,
    input: { rowNumber: 1 },
  });
  const [item] = buildWatchlistItems([
    {
      row_number: 1,
      rubro: "GOLOSINAS",
      description: "ALFAJOR TATIN",
      code: "1004056",
      ean13_di: null,
      ean13_bu: null,
      source_prices: sourcePrices,
    },
  ]);

  assert.equal(item?.currentPrice, undefined);
});

test("usa la fecha de Argentina para evitar duplicados diarios", () => {
  assert.equal(
    formatArgentinaDateKey(new Date("2026-08-02T01:30:00.000Z")),
    "2026-08-01",
  );
});

test("el cron evalua la ultima lista manual y guarda una captura diaria", async () => {
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalPersist = process.env.SUPABASE_PERSIST_PRICE_LISTS;
  const insertedRuns: Array<Record<string, unknown>> = [];
  let workerRequests = 0;

  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.SUPABASE_PERSIST_PRICE_LISTS = "true";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.startsWith("https://worker.example.test/catalog/price-list")) {
      workerRequests += 1;
      const request = JSON.parse(String(init?.body)) as {
        items: Array<{
          rowNumber: number;
          description: string;
          code: string;
        }>;
      };

      return Response.json({
        searchedAt: "2026-08-01T15:00:00.000Z",
        durationMs: 25,
        itemsCount: request.items.length,
        matchedCount: request.items.length,
        unmatchedCount: 0,
        sources: [],
        catalog: {
          status: "ready",
          region: {
            id: "argentina",
            name: "Argentina",
            scopeLabel: "Nacional",
          },
          brands: [],
          lastSyncedAt: "2026-08-01T15:00:00.000Z",
          durationMs: 20,
          productsCount: 100,
          sources: [],
          pendingSources: [],
        },
        results: request.items.map((input) => ({
          input,
          ownPrice: {
            excelPrice: null,
            tokinPrice: 700,
            selectedPrice: 700,
            selectedSource: "tokin",
            excelVsTokinGapRatio: null,
          },
          queryUsed: "alfajor tatin",
          status: "matched",
          bestPrice: 900,
          bestSource: null,
          sourcePrices: [],
          matchedCount: 1,
        })),
      });
    }

    if (method === "GET" && url.includes("list_name=eq.")) {
      return Response.json([]);
    }

    if (method === "GET" && url.includes("price_list_runs")) {
      return Response.json([
        { id: "manual-run", list_name: "Lista semanal", metadata: {} },
      ]);
    }

    if (method === "GET" && url.includes("price_list_run_items")) {
      return Response.json(
        Array.from({ length: 21 }, (_, index) => ({
          row_number: index + 1,
          rubro: "GOLOSINAS",
          description: `ALFAJOR TATIN ${index + 1}`,
          code: String(1_004_056 + index),
          ean13_di: null,
          ean13_bu: null,
          source_prices: [],
        })),
      );
    }

    if (method === "POST" && url.includes("price_list_runs")) {
      insertedRuns.push(JSON.parse(String(init?.body)));
      return Response.json([{ id: "daily-run" }]);
    }

    if (method === "POST" && url.includes("price_list_run_items")) {
      return new Response(null, { status: 201 });
    }

    throw new Error(`Solicitud inesperada en test: ${method} ${url}`);
  };

  try {
    const result = await refreshDailyEvolutionSnapshot({
      workerUrl: "https://worker.example.test",
      now: new Date("2026-08-01T15:00:00.000Z"),
    });

    assert.equal(result.saved, true);
    assert.equal(result.runId, "daily-run");
    assert.equal(result.sourceRunId, "manual-run");
    assert.equal(result.itemsCount, 21);
    assert.equal(workerRequests, 3);
    assert.equal(insertedRuns[0]?.list_name, "Actualizacion diaria 2026-08-01");
    assert.deepEqual(insertedRuns[0]?.metadata, {
      region: {
        id: "argentina",
        name: "Argentina",
        scopeLabel: "Nacional",
      },
      brands: [],
      productsCount: 100,
      storageVersion: 4,
      ownPricePolicy: "excel_first_then_tokin",
      ownPriceCount: 21,
      excelPriceCount: 0,
      tokinPriceCount: 21,
      missingOwnPriceCount: 0,
      ownPriceCoverageRatio: 1,
      catalogUsingLastGoodSnapshot: false,
      catalogLastSyncAttemptAt: "2026-08-01T15:00:00.000Z",
      origin: "scheduled_catalog",
      sourceRunId: "manual-run",
    });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseKey);
    restoreEnv("SUPABASE_PERSIST_PRICE_LISTS", originalPersist);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
