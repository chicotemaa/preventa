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
  assert.equal(freshness.label, "Catálogo actualizado");
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
  assert.match(freshness.detail, /No conviene/i);
});

function buildCatalog(lastSyncedAt: string): CatalogMetadata {
  return {
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
