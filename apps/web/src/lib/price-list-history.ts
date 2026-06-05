import type {
  PriceListHistoryResponse,
  PriceListRunDetail,
  PriceListRunDetailResponse,
  PriceListRunItem,
  PriceListRunSource,
  PriceListRunSummary,
  PriceListSourcePrice,
} from "@/types/search";
import {
  deleteSupabaseRows,
  isSupabaseConfigured,
  selectSupabaseRows,
} from "./supabase-admin";

const HISTORY_LIMIT = 20;
const INCOMPLETE_RUN_CLEANUP_AGE_MS = 5 * 60 * 1000;

type RunRow = {
  id: string;
  list_name: string;
  status: string;
  week_start: string | null;
  searched_at: string;
  created_at: string;
  duration_ms: number | null;
  items_count: number | null;
  matched_count: number | null;
  unmatched_count: number | null;
};

type SourceRow = {
  source_id: string;
  store_name: string;
  store_type: string;
  status: string;
  results_count: number | null;
  duration_ms: number | null;
  source_url: string | null;
  data_origin: string | null;
  source_scope: string | null;
  error_message: string | null;
};

type ItemRow = {
  id: string;
  row_number: number | null;
  rubro: string | null;
  description: string | null;
  code: string | null;
  ean13_di: string | null;
  ean13_bu: string | null;
  current_price: number | string | null;
  current_cost: number | string | null;
  match_status: string;
  best_price: number | string | null;
  best_source_name: string | null;
  best_source_type: string | null;
  best_product_name: string | null;
  best_product_url: string | null;
  best_confidence_score: number | null;
  margin_percent: number | string | null;
  gap_percent: number | string | null;
  suggested_price: number | string | null;
  decision_status: string;
  decision_label: string;
  matched_count: number | null;
  source_prices: unknown;
};

type RunItemProbeRow = {
  run_id: string;
};

export async function getPriceListHistory(): Promise<PriceListHistoryResponse> {
  if (!isSupabaseConfigured()) {
    return { enabled: false, runs: [] };
  }

  try {
    const rows = await selectSupabaseRows<RunRow[]>("price_list_runs", {
      select:
        "id,list_name,status,week_start,searched_at,created_at,duration_ms,items_count,matched_count,unmatched_count",
      order: "created_at.desc",
      limit: HISTORY_LIMIT,
    });
    const runIdsWithItems = await getRunIdsWithItems(
      rows.map((row) => row.id),
    );
    const visibleRows = rows.filter((row) => runIdsWithItems.has(row.id));
    await cleanupOldIncompleteRuns(
      rows.filter((row) => !runIdsWithItems.has(row.id)),
    );

    return {
      enabled: true,
      runs: visibleRows.map(mapRunRow),
    };
  } catch (error) {
    return {
      enabled: true,
      runs: [],
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo cargar el historial.",
    };
  }
}

export async function getPriceListRunDetail(
  runId: string,
): Promise<PriceListRunDetailResponse> {
  if (!isSupabaseConfigured()) {
    return { enabled: false, detail: null };
  }

  try {
    const [runRows, sourceRows, itemRows] = await Promise.all([
      selectSupabaseRows<RunRow[]>("price_list_runs", {
        select:
          "id,list_name,status,week_start,searched_at,created_at,duration_ms,items_count,matched_count,unmatched_count",
        filters: { id: `eq.${runId}` },
        limit: 1,
      }),
      selectSupabaseRows<SourceRow[]>("price_list_run_sources", {
        select:
          "source_id,store_name,store_type,status,results_count,duration_ms,source_url,data_origin,source_scope,error_message",
        filters: { run_id: `eq.${runId}` },
        order: "store_name.asc",
      }),
      selectSupabaseRows<ItemRow[]>("price_list_run_items", {
        select:
          "id,row_number,rubro,description,code,ean13_di,ean13_bu,current_price,current_cost,match_status,best_price,best_source_name,best_source_type,best_product_name,best_product_url,best_confidence_score,margin_percent,gap_percent,suggested_price,decision_status,decision_label,matched_count,source_prices",
        filters: { run_id: `eq.${runId}` },
        order: "row_number.asc",
      }),
    ]);

    const run = runRows[0];

    if (!run || itemRows.length === 0) {
      return { enabled: true, detail: null };
    }

    const detail: PriceListRunDetail = {
      run: mapRunRow(run),
      sources: sourceRows.map(mapSourceRow),
      items: itemRows.map(mapItemRow),
    };

    return { enabled: true, detail };
  } catch (error) {
    return {
      enabled: true,
      detail: null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo cargar el detalle.",
    };
  }
}

async function getRunIdsWithItems(runIds: string[]) {
  const validRunIds = await Promise.all(
    runIds.map(async (runId) => {
      const rows = await selectSupabaseRows<RunItemProbeRow[]>(
        "price_list_run_items",
        {
          select: "run_id",
          filters: { run_id: `eq.${runId}` },
          limit: 1,
        },
      );

      return rows.length > 0 ? runId : null;
    }),
  );

  return new Set(validRunIds.filter((runId): runId is string => Boolean(runId)));
}

async function cleanupOldIncompleteRuns(rows: RunRow[]) {
  const cutoff = Date.now() - INCOMPLETE_RUN_CLEANUP_AGE_MS;
  const staleRows = rows.filter((row) => {
    const createdAt = new Date(row.created_at).getTime();
    return Number.isFinite(createdAt) && createdAt < cutoff;
  });

  await Promise.allSettled(
    staleRows.map((row) =>
      deleteSupabaseRows("price_list_runs", {
        filters: { id: `eq.${row.id}` },
      }),
    ),
  );
}

function mapRunRow(row: RunRow): PriceListRunSummary {
  return {
    id: row.id,
    listName: row.list_name,
    status: row.status,
    weekStart: row.week_start,
    searchedAt: row.searched_at,
    createdAt: row.created_at,
    durationMs: row.duration_ms ?? 0,
    itemsCount: row.items_count ?? 0,
    matchedCount: row.matched_count ?? 0,
    unmatchedCount: row.unmatched_count ?? 0,
  };
}

function mapSourceRow(row: SourceRow): PriceListRunSource {
  return {
    sourceId: row.source_id,
    storeName: row.store_name,
    storeType: row.store_type === "minorista" ? "minorista" : "mayorista",
    status: row.status,
    resultsCount: row.results_count ?? 0,
    durationMs: row.duration_ms ?? 0,
    sourceUrl: row.source_url,
    dataOrigin: row.data_origin,
    sourceScope: row.source_scope,
    errorMessage: row.error_message,
  };
}

function mapItemRow(row: ItemRow): PriceListRunItem {
  return {
    id: row.id,
    rowNumber: row.row_number ?? 0,
    rubro: row.rubro,
    description: row.description,
    code: row.code,
    ean13Di: row.ean13_di,
    ean13Bu: row.ean13_bu,
    currentPrice: parseDatabaseNumber(row.current_price),
    currentCost: parseDatabaseNumber(row.current_cost),
    matchStatus: row.match_status === "matched" ? "matched" : "not_found",
    bestPrice: parseDatabaseNumber(row.best_price),
    bestSourceName: row.best_source_name,
    bestSourceType:
      row.best_source_type === "mayorista" || row.best_source_type === "minorista"
        ? row.best_source_type
        : null,
    bestProductName: row.best_product_name,
    bestProductUrl: row.best_product_url,
    bestConfidenceScore: row.best_confidence_score,
    marginPercent: parseDatabaseNumber(row.margin_percent),
    gapPercent: parseDatabaseNumber(row.gap_percent),
    suggestedPrice: parseDatabaseNumber(row.suggested_price),
    decisionStatus: row.decision_status,
    decisionLabel: row.decision_label,
    matchedCount: row.matched_count ?? 0,
    sourcePrices: parseSourcePrices(row.source_prices),
  };
}

function parseSourcePrices(value: unknown): PriceListSourcePrice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const sourcePrice = item as Partial<PriceListSourcePrice>;

    if (
      !sourcePrice.sourceId ||
      !sourcePrice.storeName ||
      !sourcePrice.productName ||
      typeof sourcePrice.price !== "number"
    ) {
      return [];
    }

    return [
      {
        sourceId: sourcePrice.sourceId,
        storeName: sourcePrice.storeName,
        storeType: sourcePrice.storeType === "minorista" ? "minorista" : "mayorista",
        sourceUrl: sourcePrice.sourceUrl ?? null,
        dataOrigin: sourcePrice.dataOrigin,
        sourceScope: sourcePrice.sourceScope,
        price: sourcePrice.price,
        comparisonPrice:
          typeof sourcePrice.comparisonPrice === "number"
            ? sourcePrice.comparisonPrice
            : sourcePrice.price,
        packageQuantity:
          typeof sourcePrice.packageQuantity === "number"
            ? sourcePrice.packageQuantity
            : null,
        packageLabel:
          typeof sourcePrice.packageLabel === "string"
            ? sourcePrice.packageLabel
            : null,
        category:
          typeof sourcePrice.category === "string"
            ? sourcePrice.category
            : undefined,
        currency: "ARS",
        productName: sourcePrice.productName,
        productUrl: sourcePrice.productUrl ?? null,
        confidenceScore:
          typeof sourcePrice.confidenceScore === "number"
            ? sourcePrice.confidenceScore
            : 0,
      },
    ];
  });
}

function parseDatabaseNumber(value: number | string | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
