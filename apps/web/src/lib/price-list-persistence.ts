import type {
  PriceListItemResult,
  PriceListResponse,
} from "@/types/search";
import {
  analyzePriceListDecision,
  getPriceListOwnPrice,
} from "./price-list-decision";
import { serializeStoredPriceListDetail } from "./price-list-storage";
import {
  deleteSupabaseRows,
  insertSupabaseRows,
  isSupabaseConfigured,
} from "./supabase-admin";

const INSERT_CHUNK_SIZE = 20;

type PersistenceResult = {
  enabled: boolean;
  requested?: boolean;
  saved?: boolean;
  runId?: string;
  errorMessage?: string;
};

export async function savePriceListRun(
  response: PriceListResponse,
): Promise<PersistenceResult> {
  if (
    process.env.SUPABASE_PERSIST_PRICE_LISTS === "false" ||
    !isSupabaseConfigured()
  ) {
    return { enabled: false, requested: true, saved: false };
  }

  const weekStart = getWeekStart(new Date(response.searchedAt));
  const runPayload = {
    list_name: `Lista semanal ${formatDateKey(weekStart)}`,
    week_start: formatDateKey(weekStart),
    searched_at: response.searchedAt,
    duration_ms: response.durationMs,
    items_count: response.itemsCount,
    matched_count: response.matchedCount,
    unmatched_count: response.unmatchedCount,
    catalog_status: response.catalog.status,
    catalog_last_synced_at: response.catalog.lastSyncedAt ?? null,
    metadata: {
      region: response.catalog.region,
      brands: response.catalog.brands,
      productsCount: response.catalog.productsCount,
    },
  };
  let runRows: Array<{ id: string }> | null;

  try {
    runRows = await insertSupabaseRows<Array<{ id: string }>>(
      "price_list_runs",
      runPayload,
      { returning: "representation", select: "id" },
    );
  } catch (error) {
    return {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo guardar la corrida.",
    };
  }

  const runId = runRows?.[0]?.id;

  if (!runId) {
    return {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage: "Supabase no devolvio el ID de la corrida.",
    };
  }

  const sourcesPayload = response.sources.map((source) => ({
    run_id: runId,
    source_id: source.sourceId,
    store_name: source.storeName,
    store_type: source.storeType,
    status: source.status,
    results_count: source.resultsCount,
    duration_ms: source.durationMs,
    source_url: source.sourceUrl ?? null,
    data_origin: source.dataOrigin ?? null,
    source_scope: source.sourceScope ?? null,
    error_message: source.errorMessage ?? null,
  }));
  const itemsPayload = response.results.map((result) =>
    buildPriceListItemPayload(runId, result),
  );

  try {
    if (sourcesPayload.length > 0) {
      await insertSupabaseRows("price_list_run_sources", sourcesPayload);
    }

    if (itemsPayload.length > 0) {
      await insertRowsInChunks("price_list_run_items", itemsPayload);
    }
  } catch (error) {
    await rollbackPriceListRun(runId);

    return {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el detalle de la corrida.",
    };
  }

  return { enabled: true, requested: true, saved: true, runId };
}

async function rollbackPriceListRun(runId: string) {
  try {
    await deleteSupabaseRows("price_list_runs", {
      filters: { id: `eq.${runId}` },
    });
  } catch {
    // El historial filtra corridas sin items; este rollback evita dejarlas visibles.
  }
}

async function insertRowsInChunks(table: string, rows: unknown[]) {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    await insertSupabaseRows(
      table,
      rows.slice(index, index + INSERT_CHUNK_SIZE),
    );
  }
}

function buildPriceListItemPayload(runId: string, result: PriceListItemResult) {
  const decision = analyzePriceListDecision(result);
  const referenceSource = decision.referenceSource;

  return {
    run_id: runId,
    row_number: result.input.rowNumber,
    rubro: result.input.rubro ?? null,
    description: result.input.description ?? null,
    code: result.input.code ?? null,
    ean13_di: result.input.ean13Di ?? null,
    ean13_bu: result.input.ean13Bu ?? null,
    current_price: getPriceListOwnPrice(result),
    current_cost: null,
    query_used: result.queryUsed ?? null,
    match_status: result.status,
    best_price: decision.referencePrice,
    best_source_id: referenceSource?.sourceId ?? null,
    best_source_name: referenceSource?.storeName ?? null,
    best_source_type: referenceSource?.storeType ?? null,
    best_source_url: referenceSource?.sourceUrl ?? null,
    best_product_name: referenceSource?.productName ?? null,
    best_product_url: referenceSource?.productUrl ?? null,
    best_confidence_score: referenceSource?.confidenceScore ?? null,
    margin_percent: null,
    gap_percent:
      decision.gapRatio === null ? null : decision.gapRatio * 100,
    suggested_price: calculateSuggestedPrice(decision),
    decision_status: decision.kind,
    decision_label: decision.label,
    matched_count: result.matchedCount,
    source_prices: serializeStoredPriceListDetail({
      sourcePrices: result.sourcePrices,
      ownPrice: result.ownPrice,
      input: result.input,
    }),
  };
}

function calculateSuggestedPrice(
  decision: ReturnType<typeof analyzePriceListDecision>,
) {
  if (
    decision.referenceSource?.storeType !== "mayorista" ||
    decision.referenceSource.confidenceScore < 70 ||
    ![
      "above_wholesale_critical",
      "above_wholesale_warning",
    ].includes(decision.kind) ||
    !decision.referencePrice
  ) {
    return null;
  }

  return Math.round(decision.referencePrice * 0.99 * 100) / 100;
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + diff);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
