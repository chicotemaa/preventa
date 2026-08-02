import type {
  PriceListInputItem,
  PriceListResponse,
} from "@/types/search";
import { repairLegacyText } from "./legacy-text";
import { savePriceListRun } from "./price-list-persistence";
import { parseStoredPriceListDetail } from "./price-list-storage";
import { isSupabaseConfigured, selectSupabaseRows } from "./supabase-admin";

const MAX_WATCHLIST_ITEMS = 1_500;
const WATCHLIST_RUN_CANDIDATES = 20;
const SNAPSHOT_BATCH_SIZE = 10;
const SNAPSHOT_BATCH_CONCURRENCY = 2;
const WORKER_SNAPSHOT_TIMEOUT_MS = 45_000;
const ARGENTINA_TIME_ZONE = "America/Argentina/Cordoba";

type WatchlistRunRow = {
  id: string;
  list_name: string;
  metadata: unknown;
};

export type WatchlistItemRow = {
  row_number: number | null;
  rubro: string | null;
  description: string | null;
  code: string | null;
  ean13_di: string | null;
  ean13_bu: string | null;
  source_prices: unknown;
};

export type DailyEvolutionSnapshotResult = {
  enabled: boolean;
  attempted: boolean;
  saved: boolean;
  skippedReason?: "already_saved" | "missing_watchlist";
  runId?: string;
  sourceRunId?: string;
  itemsCount?: number;
  errorMessage?: string;
};

export async function refreshDailyEvolutionSnapshot({
  workerUrl,
  now = new Date(),
}: {
  workerUrl: string;
  now?: Date;
}): Promise<DailyEvolutionSnapshotResult> {
  if (
    process.env.SUPABASE_PERSIST_PRICE_LISTS === "false" ||
    !isSupabaseConfigured()
  ) {
    return { enabled: false, attempted: false, saved: false };
  }

  const dateKey = formatArgentinaDateKey(now);
  const listName = `Actualizacion diaria ${dateKey}`;

  try {
    const existingRuns = await selectSupabaseRows<Array<{ id: string }>>(
      "price_list_runs",
      {
        select: "id",
        filters: { list_name: `eq.${listName}` },
        limit: 1,
      },
    );

    if (existingRuns.length > 0) {
      return {
        enabled: true,
        attempted: false,
        saved: false,
        skippedReason: "already_saved",
        runId: existingRuns[0]?.id,
      };
    }

    const watchlist = await loadLatestManualWatchlist();

    if (!watchlist) {
      return {
        enabled: true,
        attempted: false,
        saved: false,
        skippedReason: "missing_watchlist",
        errorMessage:
          "No hay una lista importada con articulos para generar la evolucion diaria.",
      };
    }

    const response = await requestCatalogPriceListInBatches(
      workerUrl,
      watchlist.items,
    );
    const persistence = await savePriceListRun(response, {
      origin: "scheduled_catalog",
      listName,
      sourceRunId: watchlist.runId,
      allowWithoutOwnPrice: true,
    });

    return {
      enabled: persistence.enabled,
      attempted: true,
      saved: persistence.saved === true,
      runId: persistence.runId,
      sourceRunId: watchlist.runId,
      itemsCount: response.itemsCount,
      errorMessage: persistence.errorMessage,
    };
  } catch (error) {
    return {
      enabled: true,
      attempted: true,
      saved: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la captura diaria de evolucion.",
    };
  }
}

async function loadLatestManualWatchlist() {
  const runRows = await selectSupabaseRows<WatchlistRunRow[]>(
    "price_list_runs",
    {
      select: "id,list_name,metadata",
      filters: { status: "neq.archived" },
      order: "created_at.desc",
      limit: WATCHLIST_RUN_CANDIDATES,
    },
  );
  const manualRuns = runRows.filter(
    (run) => getRunOrigin(run.metadata) !== "scheduled_catalog",
  );

  for (const run of manualRuns) {
    const itemRows = await selectSupabaseRows<WatchlistItemRow[]>(
      "price_list_run_items",
      {
        select:
          "row_number,rubro,description,code,ean13_di,ean13_bu,source_prices",
        filters: { run_id: `eq.${run.id}` },
        order: "row_number.asc",
        limit: MAX_WATCHLIST_ITEMS,
      },
    );
    const items = buildWatchlistItems(itemRows);

    if (items.length > 0) {
      return { runId: run.id, items };
    }
  }

  return null;
}

export function buildWatchlistItems(rows: WatchlistItemRow[]) {
  return rows.flatMap((row, index): PriceListInputItem[] => {
    const storedDetail = parseStoredPriceListDetail(row.source_prices);
    const description = repairLegacyText(row.description) ?? undefined;
    const code = normalizeOptionalString(row.code);
    const ean13Di = normalizeOptionalString(row.ean13_di);
    const ean13Bu = normalizeOptionalString(row.ean13_bu);

    if (!description && !code && !ean13Di && !ean13Bu) {
      return [];
    }

    return [
      {
        rowNumber: row.row_number ?? index + 1,
        business: storedDetail.dimensions.business,
        rubro: repairLegacyText(row.rubro) ?? undefined,
        segment: storedDetail.dimensions.segment,
        subrubro: storedDetail.dimensions.subrubro,
        line: storedDetail.dimensions.line,
        uxb: storedDetail.dimensions.uxb,
        description,
        code,
        ean13Di,
        ean13Bu,
        currentPrice: storedDetail.ownPrice?.excelPrice ?? undefined,
      },
    ];
  });
}

export function formatArgentinaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getRunOrigin(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return "legacy";
  }

  const origin = (metadata as Record<string, unknown>).origin;
  return origin === "scheduled_catalog" ? origin : "manual_import";
}

async function requestCatalogPriceListInBatches(
  workerUrl: string,
  items: PriceListInputItem[],
) {
  const startedAt = Date.now();
  const responses = await mapWithConcurrency(
    chunkItems(items, SNAPSHOT_BATCH_SIZE),
    SNAPSHOT_BATCH_CONCURRENCY,
    (batch) => requestCatalogPriceListBatch(workerUrl, batch),
  );
  const firstResponse = responses[0];

  if (!firstResponse) {
    throw new Error("La cartera diaria no contiene articulos para evaluar.");
  }

  const results = responses
    .flatMap((response) => response.results)
    .sort((first, second) => first.input.rowNumber - second.input.rowNumber);
  const matchedCount = results.filter(
    (result) => result.status === "matched",
  ).length;

  return {
    ...firstResponse,
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    itemsCount: results.length,
    matchedCount,
    unmatchedCount: results.length - matchedCount,
    results,
  } satisfies PriceListResponse;
}

async function requestCatalogPriceListBatch(
  workerUrl: string,
  items: PriceListInputItem[],
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WORKER_SNAPSHOT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/price-list`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error ??
          `El worker respondio con estado ${response.status} al generar evolucion.`,
      );
    }

    if (!isPriceListResponse(payload)) {
      throw new Error("El worker devolvio una captura de evolucion invalida.");
    }

    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "La captura diaria de evolucion excedio el tiempo disponible.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function chunkItems(items: PriceListInputItem[], size: number) {
  const chunks: PriceListInputItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];

      if (value !== undefined) {
        results[index] = await mapper(value);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), values.length) },
      () => worker(),
    ),
  );

  return results;
}

function isPriceListResponse(value: unknown): value is PriceListResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<PriceListResponse>;
  return (
    typeof response.searchedAt === "string" &&
    typeof response.itemsCount === "number" &&
    Array.isArray(response.results) &&
    Array.isArray(response.sources) &&
    Boolean(response.catalog)
  );
}

function normalizeOptionalString(value: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}
