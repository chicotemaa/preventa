// A small daily window keeps all source requests and the final consolidation
// inside Vercel's five-minute cron execution limit. Snapshots are merged in
// Supabase, so subsequent days progressively cover the complete term list.
export const CATALOG_SYNC_MAX_TERMS = 12;
export const CATALOG_SOURCE_SYNC_TIMEOUT_MS = 150_000;
export const CATALOG_REBUILD_TIMEOUT_MS = 100_000;

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

export function getDailyCatalogSyncOffset(date = new Date()) {
  const utcDay = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      86_400_000,
  );

  return utcDay * CATALOG_SYNC_MAX_TERMS;
}
