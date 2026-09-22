import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogFreshness } from "./catalog-freshness";
import type { CatalogMetadata } from "@/types/search";

const NOW = new Date("2026-07-20T15:00:00.000Z").getTime();

test("marca como fresco un catálogo diario reciente", () => {
  const freshness = getCatalogFreshness(
    buildCatalog("2026-07-20T14:00:00.000Z"),
    NOW,
  );

  assert.equal(freshness.tone, "success");
  assert.equal(freshness.label, "Precios con fecha vigente");
});

test("avisa cuando se conserva el último snapshot válido", () => {
  const freshness = getCatalogFreshness(
    {
      ...buildCatalog("2026-07-19T15:00:00.000Z"),
      usingLastGoodSnapshot: true,
    },
    NOW,
  );

  assert.equal(freshness.tone, "warning");
  assert.match(freshness.label, /último catálogo válido/i);
});

test("bloquea confianza ejecutiva si el catálogo supera 72 horas", () => {
  const freshness = getCatalogFreshness(
    buildCatalog("2026-07-16T14:00:00.000Z"),
    NOW,
  );

  assert.equal(freshness.tone, "danger");
  assert.match(freshness.detail, /no justifican recomendaciones/i);
});

function buildCatalog(lastSyncedAt: string): CatalogMetadata {
  return {
    priceObservations: {
      totalProducts: 10, datedProducts: 10,
      oldestObservedAt: lastSyncedAt, newestObservedAt: lastSyncedAt,
    },
    status: "ready",
    region: { id: "argentina", name: "Argentina", scopeLabel: "Nacional" },
    brands: [],
    lastSyncedAt,
    durationMs: 1_000,
    productsCount: 10,
    sources: [],
    pendingSources: [],
  };
}

test("un cron reciente no renueva precios retenidos antiguos", () => {
  const catalog = buildCatalog("2026-07-16T14:00:00Z");
  catalog.lastSyncedAt = new Date(NOW).toISOString();
  assert.equal(getCatalogFreshness(catalog, NOW).tone, "danger");
});

test("catálogos legacy y mezclas sin fecha no aparecen como actualizados", () => {
  const catalog = buildCatalog(new Date(NOW).toISOString());
  catalog.priceObservations!.datedProducts = 8;
  assert.equal(getCatalogFreshness(catalog, NOW).tone, "warning");
  assert.match(getCatalogFreshness(catalog, NOW).detail, /2 precios sin fecha/);
  delete catalog.priceObservations;
  assert.equal(getCatalogFreshness(catalog, NOW).label, "Vigencia de precios sin verificar");
});
