import type {
  PriceListItemResult,
  PriceListResponse,
} from "@/types/search";
import {
  analyzePriceListDecision,
  getPriceListOwnPrice,
} from "./price-list-decision";
import { DEFAULT_TARGET_GROSS_MARGIN_RATIO } from "./price-list-commercial";
import { parseCostConditions } from "./cost-structure";
import { parseBusinessActivity } from "./business-activity";
import { summarizePriceListOwnPrices } from "./price-list-own-price-summary";
import {
  PRICE_LIST_STORAGE_VERSION,
  serializeStoredPriceListDetail,
} from "./price-list-storage";
import {
  deleteSupabaseRows,
  insertSupabaseRows,
  isSupabaseConfigured,
  updateSupabaseRows,
} from "./supabase-admin";

const INSERT_CHUNK_SIZE = 20;

type PersistenceResult = {
  enabled: boolean;
  requested?: boolean;
  saved?: boolean;
  runId?: string;
  errorMessage?: string;
};

export type PriceListRunSaveOptions = {
  signal?: AbortSignal;
  origin?: "manual_import" | "scheduled_catalog";
  listName?: string;
  sourceRunId?: string | null;
  allowWithoutOwnPrice?: boolean;
};

export async function savePriceListRun(
  response: PriceListResponse,
  options: PriceListRunSaveOptions = {},
): Promise<PersistenceResult> {
  if (
    process.env.SUPABASE_PERSIST_PRICE_LISTS === "false" ||
    !isSupabaseConfigured()
  ) {
    return { enabled: false, requested: true, saved: false };
  }

  const ownPriceSummary = summarizePriceListOwnPrices(response.results);
  if (response.results.some(row => row.input.businessActivity != null && !parseBusinessActivity(row.input.businessActivity))) {
    return { enabled: true, requested: true, saved: false, errorMessage: "Datos de ventas/stock invalidos. No se guardo la carga." };
  }

  if (response.results.some((row) => row.costConditions != null && !parseCostConditions(row.costConditions))) {
    return { enabled: true, requested: true, saved: false, errorMessage: "Condiciones de costo invalidas. Revisar los importes y porcentajes antes de guardar." };
  }

  if (!ownPriceSummary.canPersist && !options.allowWithoutOwnPrice) {
    return {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage:
        "No se guardo la carga: ningun articulo tiene precio de venta en el Excel. Tokin se conserva como costo proveedor, pero no reemplaza al Excel.",
    };
  }

  const weekStart = getWeekStart(new Date(response.searchedAt));
  const origin = options.origin ?? "manual_import";
  const runPayload = {
    list_name:
      options.listName ?? `Lista semanal ${formatDateKey(weekStart)}`,
    week_start: formatDateKey(weekStart),
    searched_at: response.searchedAt,
    duration_ms: response.durationMs,
    items_count: response.itemsCount,
    matched_count: response.matchedCount,
    unmatched_count: response.unmatchedCount,
    catalog_status: response.catalog.status,
    catalog_last_synced_at: response.catalog.lastSyncedAt ?? null,
    // Keep unfinished writes out of the active Excel and daily idempotency checks.
    status: "archived",
    metadata: {
      origin,
      sourceRunId: options.sourceRunId ?? null,
      region: response.catalog.region,
      brands: response.catalog.brands,
      productsCount: response.catalog.productsCount,
      storageVersion: PRICE_LIST_STORAGE_VERSION,
      ownPricePolicy: "excel_sale_tokin_supplier_cost",
      targetGrossMarginRatio: DEFAULT_TARGET_GROSS_MARGIN_RATIO,
      ownPriceCount: ownPriceSummary.ownPriceCount,
      excelPriceCount: ownPriceSummary.excelPriceCount,
      tokinPriceCount: ownPriceSummary.tokinPriceCount,
      missingOwnPriceCount: ownPriceSummary.missingOwnPriceCount,
      ownPriceCoverageRatio: ownPriceSummary.coverageRatio,
      catalogUsingLastGoodSnapshot:
        response.catalog.usingLastGoodSnapshot === true,
      catalogLastSyncAttemptAt:
        response.catalog.lastSyncAttemptAt ?? response.catalog.lastSyncedAt,
    },
  };
  let runRows: Array<{ id: string }> | null;

  try {
    runRows = await insertSupabaseRows<Array<{ id: string }>>(
      "price_list_runs",
      runPayload,
      { returning: "representation", select: "id", signal: options.signal },
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
      await insertSupabaseRows("price_list_run_sources", sourcesPayload, { signal: options.signal });
    }

    if (itemsPayload.length > 0) {
      await insertRowsInChunks("price_list_run_items", itemsPayload, options.signal);
    }
    await updateSupabaseRows("price_list_runs", {
      status: ownPriceSummary.coverageComplete ? "review" : "draft",
    }, { filters: { id: `eq.${runId}` }, signal: options.signal });
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

async function insertRowsInChunks(table: string, rows: unknown[], signal?: AbortSignal) {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    await insertSupabaseRows(
      table,
      rows.slice(index, index + INSERT_CHUNK_SIZE),
      { signal },
    );
  }
}

export function buildPriceListItemPayload(runId: string, result: PriceListItemResult) {
  const decision = analyzePriceListDecision(result);
  const referenceSource = decision.referenceSource;
  const commercial = decision.commercial;

  return {
    run_id: runId,
    row_number: result.input.rowNumber,
    rubro: result.input.rubro ?? null,
    description: result.input.description ?? null,
    code: result.input.code ?? null,
    ean13_di: result.input.ean13Di ?? null,
    ean13_bu: result.input.ean13Bu ?? null,
    current_price: getPriceListOwnPrice(result),
    current_cost: commercial.effectiveUnitCost,
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
    margin_percent:
      commercial.grossMarginRatio === null
        ? null
        : commercial.grossMarginRatio * 100,
    gap_percent:
      decision.gapRatio === null ? null : decision.gapRatio * 100,
    suggested_price: calculateSuggestedPrice(decision),
    decision_status: decision.kind,
    decision_label: decision.label,
    matched_count: result.matchedCount,
    source_prices: serializeStoredPriceListDetail({
      sourcePrices: result.sourcePrices,
      ownPrice: result.ownPrice,
      diagnostics: result.diagnostics,
      costConditions: result.costConditions,
      input: result.input,
    }),
  };
}

function calculateSuggestedPrice(
  decision: ReturnType<typeof analyzePriceListDecision>,
) {
  return decision.commercial.supplierCostComparable
    ? decision.commercial.minimumPriceForTargetMargin
    : null;
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
