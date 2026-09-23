// A small daily window keeps all source requests and the final consolidation
// inside Vercel's five-minute cron execution limit. Snapshots are merged in
// Supabase, so subsequent days progressively cover the complete term list.
export const CATALOG_SYNC_MAX_TERMS = 2;
export const CATALOG_SOURCE_SYNC_TIMEOUT_MS = 100_000;
export const CATALOG_REBUILD_TIMEOUT_MS = 45_000;
export const CATALOG_SYNC_CONCURRENCY = 2;

export const CATALOG_SYNC_SOURCE_IDS = [
  "aguiar-arcor-resistencia",
  "maxiconsumo-chaco-auth",
  "maxiconsumo-web-moreno",
  "carrefour-comerciante-maxi",
  "yaguar-chaco-tienda-auth",
  "cucher-mercados-ofertas",
  "cheek-resistencia-revista",
  "carrefour-argentina-vtex",
  "vea-argentina-vtex",
  "masonline-changomas-vtex",
  "jumbo-argentina-vtex",
  "disco-argentina-vtex",
  "dia-argentina-vtex",
  "laanonima-argentina-html",
  "cordiez-argentina-vtex",
  "depot-express-argentina",
] as const;

const DAILY_PRIORITY_SOURCE_IDS = CATALOG_SYNC_SOURCE_IDS.slice(0, 2);
const ROTATING_SOURCE_IDS = CATALOG_SYNC_SOURCE_IDS.slice(2);

export function getDailyCatalogSyncSourceIds(now = new Date()) {
  const utcDay = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) /
      86_400_000,
  );
  const rotatingStart = (utcDay * 2) % ROTATING_SOURCE_IDS.length;
  const rotating = [0, 1].map(
    (index) =>
      ROTATING_SOURCE_IDS[(rotatingStart + index) % ROTATING_SOURCE_IDS.length],
  );

  return [...DAILY_PRIORITY_SOURCE_IDS, ...rotating];
}

export function getDailyCatalogSyncOffset(date = new Date(), sourceId?: string) {
  const utcDay = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );

  // Rotating sources run once per cycle, not once per day. Advancing by calendar
  // day skips the same term blocks forever when the term count shares a divisor.
  const rotatingIndex = ROTATING_SOURCE_IDS.findIndex((id) => id === sourceId);
  const cycleDays = ROTATING_SOURCE_IDS.length / 2;
  const visit = rotatingIndex < 0
    ? utcDay
    : Math.floor((utcDay - Math.floor(rotatingIndex / 2)) / cycleDays);
  return visit * CATALOG_SYNC_MAX_TERMS;
}
