import { workerFetch } from "@/lib/worker-request";
import type {
  PriceListInputItem,
  PriceListResponse,
} from "@/types/search";
import { repairLegacyText } from "./legacy-text";
import { savePriceListRun } from "./price-list-persistence";
import { parseStoredPriceListDetail } from "./price-list-storage";
import { isSupabaseConfigured, selectSupabaseRows } from "./supabase-admin";
import { getLatestImportIds } from "./commercial-reference-data";

const MAX_WATCHLIST_ITEMS = 10_000;
const SNAPSHOT_BATCH_SIZE = 10;
const SNAPSHOT_BATCH_CONCURRENCY = 2;
const WORKER_SNAPSHOT_TIMEOUT_MS = 45_000;
const ARGENTINA_TIME_ZONE = "America/Argentina/Cordoba";

export type WatchlistItemRow = {
  row_number: number | null;
  rubro: string | null;
  description: string | null;
  code: string | null;
  ean13_di: string | null;
  ean13_bu: string | null;
  current_price?: number | string | null;
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
  deadline = Date.now() + 240_000,
}: {
  workerUrl: string;
  now?: Date;
  deadline?: number;
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
    const [activeRun] = await getLatestImportIds(1);
    if (!activeRun) {
      return {
        enabled: true, attempted: false, saved: false,
        skippedReason: "missing_watchlist",
        errorMessage: "No hay un Excel activo. Importar y guardar la lista de venta para generar evolucion.",
      };
    }
    const existingRuns = await selectSupabaseRows<Array<{ id: string }>>(
      "price_list_runs",
      {
        select: "id",
        filters: {
          list_name: `eq.${listName}`, status: "neq.archived",
          "metadata->>origin": "eq.scheduled_catalog",
          "metadata->>sourceRunId": `eq.${activeRun.id}`,
        },
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
        sourceRunId: activeRun.id,
      };
    }

    const watchlist = await loadActiveWatchlist(activeRun.id, deadline);

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
      deadline,
    );
    response.results = attachWatchlistContext(response.results, watchlist.rows);
    if (Date.now() + 10_000 >= deadline) {
      throw new Error("No queda tiempo para guardar una captura completa; se conserva la evaluacion anterior.");
    }
    const persistence = await savePriceListRun(response, {
      origin: "scheduled_catalog",
      listName,
      sourceRunId: watchlist.runId,
      allowWithoutOwnPrice: true,
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
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

async function loadActiveWatchlist(runId: string, deadline: number) {
  const itemRows: WatchlistItemRow[] = [];
  while (true) {
    if (Date.now() >= deadline) throw new Error("La lectura del Excel activo excedio el tiempo disponible.");
    const page = await selectSupabaseRows<WatchlistItemRow[]>("price_list_run_items", {
      select:
        "row_number,rubro,description,code,ean13_di,ean13_bu,current_price,source_prices",
      filters: { run_id: `eq.${runId}` },
      order: "row_number.asc,id.asc",
      limit: 500, offset: itemRows.length,
      signal: AbortSignal.timeout(Math.min(15_000, Math.max(1, deadline - Date.now()))),
    });
    itemRows.push(...page);
    if (itemRows.length > MAX_WATCHLIST_ITEMS) {
      throw new Error(`El Excel supera ${MAX_WATCHLIST_ITEMS} filas. Requiere procesamiento por trabajos; no se guardo una captura recortada.`);
    }
    if (page.length < 500) break;
  }
  const items = buildWatchlistItems(itemRows);

  if (items.length > 0) {
    return { runId, items, rows: itemRows };
  }

  return null;
}

export function attachWatchlistContext(results: PriceListResponse["results"], rows: WatchlistItemRow[]) {
  const byRow = new Map(rows.map(row => [row.row_number, row]));
  return results.map(result => {
    const row = byRow.get(result.input.rowNumber);
    if (!row) return result;
    const sameIdentity = Boolean(row.code || row.ean13_di) &&
      (normalizeOptionalString(row.code) ?? "") === (result.input.code ?? "") &&
      (normalizeOptionalString(row.ean13_di) ?? "") === (result.input.ean13Di ?? "");
    if (!sameIdentity) return result;
    const saved = parseStoredPriceListDetail(row.source_prices);
    if ((saved.dimensions.uxb ?? "") !== (result.input.uxb ?? "")) return result;
    return { ...result, costConditions: saved.costConditions,
      input: { ...result.input, businessActivity: saved.dimensions.businessActivity } };
  });
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
        currentPrice:
          (storedDetail.ownPrice ? storedDetail.ownPrice.excelPrice : normalizeOptionalPrice(row.current_price)) ??
          undefined,
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

async function requestCatalogPriceListInBatches(
  workerUrl: string,
  items: PriceListInputItem[],
  deadline: number,
) {
  const startedAt = Date.now();
  const responses = await mapWithConcurrency(
    chunkItems(items, SNAPSHOT_BATCH_SIZE),
    SNAPSHOT_BATCH_CONCURRENCY,
    (batch) => requestCatalogPriceListBatch(workerUrl, batch, deadline),
  );
  const firstResponse = responses[0];

  if (!firstResponse) {
    throw new Error("La cartera diaria no contiene articulos para evaluar.");
  }

  const results = responses
    .flatMap((response) => response.results)
    .sort((first, second) => first.input.rowNumber - second.input.rowNumber);
  const resultRows = new Set(results.map(result => result.input.rowNumber));
  if (results.length !== items.length || resultRows.size !== items.length || items.some(item => !resultRows.has(item.rowNumber))) {
    throw new Error("La captura diaria esta incompleta; se conserva la evaluacion anterior.");
  }
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
  deadline: number,
) {
  if (Date.now() >= deadline) throw new Error("La captura diaria excedio el tiempo disponible; no se guardaron resultados incompletos.");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(WORKER_SNAPSHOT_TIMEOUT_MS, Math.max(1, deadline - Date.now())),
  );

  try {
    const response = await workerFetch(
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
  let stopped = false;

  async function worker() {
    while (!stopped && nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];

      if (value !== undefined) {
        try {
          results[index] = await mapper(value);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    }
  }

  const settled = await Promise.allSettled(
    Array.from(
      { length: Math.min(Math.max(concurrency, 1), values.length) },
      () => worker(),
    ),
  );
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;

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

function normalizeOptionalPrice(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
