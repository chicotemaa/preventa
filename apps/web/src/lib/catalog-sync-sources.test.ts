import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOG_SYNC_MAX_TERMS,
  CATALOG_SYNC_SOURCE_IDS,
  getDailyCatalogSyncOffset,
  getDailyCatalogSyncSourceIds,
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
  assert.equal(CATALOG_SYNC_MAX_TERMS, 2);
});

test("consulta diariamente las fuentes prioritarias y rota las restantes", () => {
  const firstDay = getDailyCatalogSyncSourceIds(
    new Date("2026-07-20T15:00:00.000Z"),
  );
  const nextDay = getDailyCatalogSyncSourceIds(
    new Date("2026-07-21T15:00:00.000Z"),
  );

  assert.deepEqual(firstDay.slice(0, 2), CATALOG_SYNC_SOURCE_IDS.slice(0, 2));
  assert.deepEqual(nextDay.slice(0, 2), CATALOG_SYNC_SOURCE_IDS.slice(0, 2));
  assert.equal(firstDay.length, 4);
  assert.equal(nextDay.length, 4);
  assert.notDeepEqual(firstDay.slice(2), nextDay.slice(2));
});
