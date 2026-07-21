import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_SYNC_MAX_TERMS,
  CATALOG_SYNC_SOURCE_IDS,
  getDailyCatalogSyncOffset,
} from "./catalog-sync-sources";

test("prioriza las fuentes propias y mayoristas en el cron", () => {
  assert.deepEqual(CATALOG_SYNC_SOURCE_IDS.slice(0, 6), [
    "aguiar-arcor-resistencia",
    "maxiconsumo-chaco-auth",
    "maxiconsumo-web-moreno",
    "carrefour-comerciante-maxi",
    "yaguar-chaco-tienda-auth",
    "cucher-mercados-ofertas",
  ]);
});

test("rota el bloque de busqueda una vez por dia", () => {
  const firstDay = getDailyCatalogSyncOffset(
    new Date("2026-07-20T15:00:00.000Z"),
  );
  const nextDay = getDailyCatalogSyncOffset(
    new Date("2026-07-21T15:00:00.000Z"),
  );

  assert.equal(nextDay - firstDay, CATALOG_SYNC_MAX_TERMS);
});

test("usa un bloque diario compatible con el limite del cron", () => {
  assert.equal(CATALOG_SYNC_MAX_TERMS, 3);
});
