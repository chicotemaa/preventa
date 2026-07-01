import type {
  SourceCatalogSnapshot,
  SourceSessionValidationSummary,
  StoredSessionRecord,
} from "./source-session-store.js";
import type { SourceSearchStatus, StoreType } from "./types.js";

type SourceStoreMode = "auto" | "supabase" | "file";

type SupabaseSourceSessionRow = {
  source_id: string;
  store_name: string;
  store_type: StoreType;
  kind: "cookie";
  cookie: StoredSessionRecord["cookie"];
  user_agent: string;
  saved_at: string;
  updated_at: string;
  last_validation: SourceSessionValidationSummary | null;
};

type SupabaseSourceSnapshotRow = {
  source_id: string;
  store_name: string;
  store_type: StoreType;
  source_url: string | null;
  data_origin: string | null;
  source_scope: string | null;
  status: SourceSearchStatus["status"];
  synced_at: string;
  duration_ms: number;
  queries: string[];
  products_count: number;
  private_products_count: number;
  visible_price_products_count: number;
  errors: string[];
  products: SourceCatalogSnapshot["products"];
};

export function shouldUseSupabaseSourceStore() {
  const mode = getSourceStoreMode();
  return mode !== "file" && isSupabaseSourceStoreConfigured();
}

export function requiresSupabaseSourceStore() {
  return getSourceStoreMode() === "supabase";
}

export function isSupabaseSourceStoreConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseServerKey());
}

export async function selectSourceSessionRecordsFromSupabase() {
  const rows = await requestSupabase<SupabaseSourceSessionRow[]>(
    "source_sessions",
    { method: "GET", searchParams: { select: "*" } },
  );

  return rows.map(mapSessionRowToRecord);
}

export async function upsertSourceSessionRecordsToSupabase(
  records: StoredSessionRecord[],
) {
  if (records.length === 0) {
    return;
  }

  await requestSupabase("source_sessions", {
    method: "POST",
    searchParams: { on_conflict: "source_id" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: records.map(mapSessionRecordToRow),
  });
}

export async function selectSourceCatalogSnapshotsFromSupabase() {
  const rows = await requestSupabase<SupabaseSourceSnapshotRow[]>(
    "source_catalog_snapshots",
    { method: "GET", searchParams: { select: "*" } },
  );

  return rows.map(mapSnapshotRowToRecord);
}

export async function upsertSourceCatalogSnapshotsToSupabase(
  snapshots: SourceCatalogSnapshot[],
) {
  if (snapshots.length === 0) {
    return;
  }

  await requestSupabase("source_catalog_snapshots", {
    method: "POST",
    searchParams: { on_conflict: "source_id" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: snapshots.map(mapSnapshotRecordToRow),
  });
}

function mapSessionRowToRecord(
  row: SupabaseSourceSessionRow,
): StoredSessionRecord {
  return {
    sourceId: row.source_id,
    storeName: row.store_name,
    storeType: row.store_type,
    kind: row.kind,
    cookie: row.cookie,
    userAgent: row.user_agent,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    lastValidation: row.last_validation ?? undefined,
  };
}

function mapSessionRecordToRow(
  record: StoredSessionRecord,
): SupabaseSourceSessionRow {
  return {
    source_id: record.sourceId,
    store_name: record.storeName,
    store_type: record.storeType,
    kind: record.kind,
    cookie: record.cookie,
    user_agent: record.userAgent,
    saved_at: record.savedAt,
    updated_at: record.updatedAt,
    last_validation: record.lastValidation ?? null,
  };
}

function mapSnapshotRowToRecord(
  row: SupabaseSourceSnapshotRow,
): SourceCatalogSnapshot {
  return {
    sourceId: row.source_id,
    storeName: row.store_name,
    storeType: row.store_type,
    sourceUrl: row.source_url,
    dataOrigin: row.data_origin ?? undefined,
    sourceScope: row.source_scope ?? undefined,
    status: row.status,
    syncedAt: row.synced_at,
    durationMs: row.duration_ms,
    queries: row.queries ?? [],
    productsCount: row.products_count,
    privateProductsCount: row.private_products_count,
    visiblePriceProductsCount: row.visible_price_products_count,
    errors: row.errors ?? [],
    products: row.products ?? [],
  };
}

function mapSnapshotRecordToRow(
  snapshot: SourceCatalogSnapshot,
): SupabaseSourceSnapshotRow {
  return {
    source_id: snapshot.sourceId,
    store_name: snapshot.storeName,
    store_type: snapshot.storeType,
    source_url: snapshot.sourceUrl ?? null,
    data_origin: snapshot.dataOrigin ?? null,
    source_scope: snapshot.sourceScope ?? null,
    status: snapshot.status,
    synced_at: snapshot.syncedAt,
    duration_ms: snapshot.durationMs,
    queries: snapshot.queries,
    products_count: snapshot.productsCount,
    private_products_count: snapshot.privateProductsCount,
    visible_price_products_count: snapshot.visiblePriceProductsCount,
    errors: snapshot.errors,
    products: snapshot.products,
  };
}

async function requestSupabase<T = null>(
  table: string,
  options: {
    method: "GET" | "POST";
    searchParams?: Record<string, string>;
    prefer?: string;
    body?: unknown;
  },
): Promise<T> {
  const supabaseUrl = getSupabaseUrl();
  const serverKey = getSupabaseServerKey();

  if (!supabaseUrl || !serverKey) {
    throw new Error("Supabase no esta configurado para el worker.");
  }

  const params = new URLSearchParams(options.searchParams ?? {});
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}${
    params.size ? `?${params.toString()}` : ""
  }`;
  const headers = buildSupabaseHeaders(serverKey, options.prefer);
  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Supabase respondio con estado ${response.status}.`,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function buildSupabaseHeaders(serverKey: string, prefer?: string) {
  const headers: Record<string, string> = {
    apikey: serverKey,
    "content-type": "application/json",
  };

  if (prefer) {
    headers.prefer = prefer;
  }

  if (!isSupabasePlatformKey(serverKey)) {
    headers.authorization = `Bearer ${serverKey}`;
  }

  return headers;
}

function getSourceStoreMode(): SourceStoreMode {
  const rawMode = (
    process.env.SOURCE_SESSION_STORE_BACKEND ??
    process.env.SOURCE_SESSION_STORE_DRIVER ??
    "auto"
  )
    .trim()
    .toLowerCase();

  if (rawMode === "supabase" || rawMode === "file") {
    return rawMode;
  }

  return "auto";
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim();
}

function getSupabaseServerKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  );
}

function isSupabasePlatformKey(key: string) {
  return key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
}
