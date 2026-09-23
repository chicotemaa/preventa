import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalogReadiness, type CatalogOperationalStatus } from "./catalog-readiness";
import { GET } from "@/app/api/catalog-status/route";

function status(): CatalogOperationalStatus {
  return { checkedAt: new Date().toISOString(), excel: { status: "missing" }, cronConfigured: true,
    catalog: { status: "ready", productsCount: 12, lastSyncedAt: new Date().toISOString(), durationMs: 1,
      brands: [], region: { id: "argentina", name: "Argentina", scopeLabel: "Argentina" },
      sources: [{ sourceId: "maxiconsumo-chaco-auth", storeName: "Maxiconsumo Chaco", storeType: "mayorista", status: "success", resultsCount: 12, durationMs: 1 }], pendingSources: [] },
    observationsBySource: { "maxiconsumo-chaco-auth": { totalProducts: 12, datedProducts: 10,
      currentProducts: 4, outdatedProducts: 6, undatedProducts: 2,
      oldestObservedAt: "2026-01-01", newestObservedAt: new Date().toISOString() } },
  };
}

test("vigencia separada de exito del scraper, proveedor y mayoristas primero", () => {
  const readiness = buildCatalogReadiness(status());
  assert.equal(readiness.sources[0].channel, "own");
  assert.match(readiness.sources[0].name, /proveedor/);
  const maxi = readiness.sources.find(source => source.sourceId === "maxiconsumo-chaco-auth")!;
  assert.equal(maxi.state, "Parcial");
  assert.equal(maxi.current, 4);
  assert.equal(maxi.total, 12);
  const firstRetail = readiness.sources.findIndex(source => source.channel === "minorista");
  assert.ok(readiness.sources.slice(firstRetail).every(source => source.channel === "minorista"));
  assert.equal(readiness.sources.find(source => source.sourceId === "vital-online")?.state, "Sin datos");
  assert.ok(readiness.criticalWholesalersWithoutCurrentPrices > 0);
});

test("snapshot legacy o backend caido no se presentan como precios vigentes", () => {
  const input = status();
  input.observationsBySource = {};
  const maxi = buildCatalogReadiness(input).sources.find(source => source.sourceId === "maxiconsumo-chaco-auth")!;
  assert.equal(maxi.state, "Revisar vigencia");
  assert.equal(maxi.current, 0);
  input.catalog = null;
  assert.ok(buildCatalogReadiness(input).sources.every(source => source.state === "Sin verificar"));
});

test("estado operativo no permite consultar worker sin autenticar", async () => {
  const username = process.env.APP_ACCESS_USERNAME;
  const password = process.env.APP_ACCESS_PASSWORD;
  const originalFetch = globalThis.fetch;
  process.env.APP_ACCESS_USERNAME = "test";
  process.env.APP_ACCESS_PASSWORD = "secret".repeat(6);
  globalThis.fetch = async () => { throw new Error("No debe consultar ningun servidor"); };
  try {
    assert.equal((await GET(new Request("https://app.example.test/api/catalog-status"))).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    if (username === undefined) delete process.env.APP_ACCESS_USERNAME; else process.env.APP_ACCESS_USERNAME = username;
    if (password === undefined) delete process.env.APP_ACCESS_PASSWORD; else process.env.APP_ACCESS_PASSWORD = password;
  }
});
