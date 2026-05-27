import type {
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
} from "@/types/search";
import { insertSupabaseRows, isSupabaseConfigured } from "./supabase-admin";

const MIN_MARGIN_PERCENT = 22;
const HIGH_PRICE_GAP_PERCENT = 12;
const OPPORTUNITY_GAP_PERCENT = -8;
const INSERT_CHUNK_SIZE = 20;

type DecisionStatus =
  | "ready"
  | "review_match"
  | "no_reference"
  | "missing_own_price"
  | "low_margin"
  | "above_reference"
  | "opportunity";

type PersistenceResult = {
  enabled: boolean;
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
    return { enabled: false };
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
    catalog_last_synced_at: response.catalog.lastSyncedAt,
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
    source_url: source.sourceUrl,
    data_origin: source.dataOrigin,
    source_scope: source.sourceScope,
    error_message: source.errorMessage,
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
    return {
      enabled: true,
      runId,
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el detalle de la corrida.",
    };
  }

  return { enabled: true, runId };
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
  const decision = analyzeDecision(result);

  return {
    run_id: runId,
    row_number: result.input.rowNumber,
    rubro: result.input.rubro,
    description: result.input.description,
    code: result.input.code,
    ean13_di: result.input.ean13Di,
    ean13_bu: result.input.ean13Bu,
    current_price: result.input.currentPrice,
    current_cost: result.input.currentCost,
    query_used: result.queryUsed,
    match_status: result.status,
    best_price: result.bestPrice,
    best_source_id: result.bestSource?.sourceId,
    best_source_name: result.bestSource?.storeName,
    best_source_type: result.bestSource?.storeType,
    best_source_url: result.bestSource?.sourceUrl,
    best_product_name: result.bestSource?.productName,
    best_product_url: result.bestSource?.productUrl,
    best_confidence_score: result.bestSource?.confidenceScore,
    margin_percent: decision.marginPercent,
    gap_percent: decision.gapPercent,
    suggested_price: decision.suggestedPrice,
    decision_status: decision.status,
    decision_label: getDecisionStatusLabel(decision.status),
    matched_count: result.matchedCount,
    source_prices: result.sourcePrices.map(serializeSourcePrice),
  };
}

function analyzeDecision(result: PriceListItemResult) {
  const currentPrice = normalizeOptionalNumber(result.input.currentPrice);
  const currentCost = normalizeOptionalNumber(result.input.currentCost);
  const referencePrice = normalizeOptionalNumber(result.bestPrice);
  const marginPercent =
    currentPrice && currentCost
      ? ((currentPrice - currentCost) / currentPrice) * 100
      : null;
  const gapPercent =
    currentPrice && referencePrice
      ? ((currentPrice - referencePrice) / referencePrice) * 100
      : null;
  const suggestedPrice = calculateSuggestedPrice(
    currentPrice,
    currentCost,
    referencePrice,
  );

  return {
    status: getDecisionStatus(
      result,
      currentPrice,
      referencePrice,
      marginPercent,
      gapPercent,
    ),
    marginPercent,
    gapPercent,
    suggestedPrice,
  };
}

function getDecisionStatus(
  result: PriceListItemResult,
  currentPrice: number | null,
  referencePrice: number | null,
  marginPercent: number | null,
  gapPercent: number | null,
): DecisionStatus {
  if (!referencePrice) {
    return "no_reference";
  }

  if (!currentPrice) {
    return "missing_own_price";
  }

  if (result.bestSource && result.bestSource.confidenceScore < 70) {
    return "review_match";
  }

  if (marginPercent !== null && marginPercent < MIN_MARGIN_PERCENT) {
    return "low_margin";
  }

  if (gapPercent !== null && gapPercent > HIGH_PRICE_GAP_PERCENT) {
    return "above_reference";
  }

  if (gapPercent !== null && gapPercent < OPPORTUNITY_GAP_PERCENT) {
    return "opportunity";
  }

  return "ready";
}

function calculateSuggestedPrice(
  currentPrice: number | null,
  currentCost: number | null,
  referencePrice: number | null,
) {
  if (!currentPrice && !referencePrice && !currentCost) {
    return null;
  }

  const marginFloor = currentCost
    ? currentCost / (1 - MIN_MARGIN_PERCENT / 100)
    : null;
  const target = Math.max(
    referencePrice ?? 0,
    marginFloor ?? 0,
    currentPrice ?? 0,
  );

  return roundPriceForList(target);
}

function roundPriceForList(value: number) {
  const step = value < 1_000 ? 10 : value < 10_000 ? 50 : 100;
  return Math.ceil(value / step) * step;
}

function getDecisionStatusLabel(status: DecisionStatus) {
  const labels: Record<DecisionStatus, string> = {
    ready: "Listo",
    review_match: "Revisar match",
    no_reference: "Sin referencia",
    missing_own_price: "Falta precio ARA",
    low_margin: "Margen bajo",
    above_reference: "Muy arriba",
    opportunity: "Oportunidad",
  };

  return labels[status];
}

function serializeSourcePrice(sourcePrice: PriceListSourcePrice) {
  return {
    sourceId: sourcePrice.sourceId,
    storeName: sourcePrice.storeName,
    storeType: sourcePrice.storeType,
    sourceUrl: sourcePrice.sourceUrl,
    dataOrigin: sourcePrice.dataOrigin,
    sourceScope: sourcePrice.sourceScope,
    price: sourcePrice.price,
    currency: sourcePrice.currency,
    productName: sourcePrice.productName,
    productUrl: sourcePrice.productUrl,
    confidenceScore: sourcePrice.confidenceScore,
  };
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
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
