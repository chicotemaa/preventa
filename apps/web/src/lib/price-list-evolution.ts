import type {
  PriceEvolutionPoint,
  PriceEvolutionProduct,
  PriceEvolutionResponse,
  PriceListRunSummary,
  PriceListSourcePrice,
} from "@/types/search";
import { isSupabaseConfigured, selectSupabaseRows } from "./supabase-admin";

const RUNS_LIMIT = 30;

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

type EvolutionItemRow = {
  run_id: string;
  rubro: string | null;
  description: string | null;
  code: string | null;
  ean13_di: string | null;
  ean13_bu: string | null;
  current_price: number | string | null;
  best_price: number | string | null;
  best_source_name: string | null;
  suggested_price: number | string | null;
  gap_percent: number | string | null;
  decision_label: string;
  source_prices: unknown;
};

export async function getPriceEvolution(): Promise<PriceEvolutionResponse> {
  if (!isSupabaseConfigured()) {
    return { enabled: false, products: [], runs: [] };
  }

  try {
    const runRows = await selectSupabaseRows<RunRow[]>("price_list_runs", {
      select:
        "id,list_name,status,week_start,searched_at,created_at,duration_ms,items_count,matched_count,unmatched_count",
      order: "created_at.desc",
      limit: RUNS_LIMIT,
    });
    const runs = runRows.map(mapRunRow);

    if (runs.length === 0) {
      return { enabled: true, products: [], runs: [] };
    }

    const runIds = runs.map((run) => run.id).join(",");
    const itemRows = await selectSupabaseRows<EvolutionItemRow[]>(
      "price_list_run_items",
      {
        select:
          "run_id,rubro,description,code,ean13_di,ean13_bu,current_price,best_price,best_source_name,suggested_price,gap_percent,decision_label,source_prices",
        filters: { run_id: `in.(${runIds})` },
        order: "row_number.asc",
      },
    );
    const runIdsWithItems = new Set(itemRows.map((row) => row.run_id));
    const visibleRuns = runs.filter((run) => runIdsWithItems.has(run.id));

    return {
      enabled: true,
      products: buildProducts(itemRows, visibleRuns),
      runs: visibleRuns,
    };
  } catch (error) {
    return {
      enabled: true,
      products: [],
      runs: [],
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo cargar la evolucion de precios.",
    };
  }
}

function buildProducts(
  rows: EvolutionItemRow[],
  runs: PriceListRunSummary[],
): PriceEvolutionProduct[] {
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const products = new Map<string, PriceEvolutionProduct>();

  for (const row of rows) {
    const run = runsById.get(row.run_id);

    if (!run) {
      continue;
    }

    const productKey = buildProductKey(row);
    const product = products.get(productKey) ?? {
      productKey,
      description: row.description || "Articulo sin descripcion",
      rubro: row.rubro,
      code: row.code,
      ean13Di: row.ean13_di,
      ean13Bu: row.ean13_bu,
      points: [],
      sourceNames: [],
    };
    const sourcePrices = parseSourcePrices(row.source_prices);
    const point: PriceEvolutionPoint = {
      runId: row.run_id,
      searchedAt: run.searchedAt,
      createdAt: run.createdAt,
      araPrice: parseDatabaseNumber(row.current_price),
      referencePrice: parseDatabaseNumber(row.best_price),
      suggestedPrice: parseDatabaseNumber(row.suggested_price),
      bestSourceName: row.best_source_name,
      gapPercent: parseDatabaseNumber(row.gap_percent),
      decisionLabel: row.decision_label,
      sourcePrices,
    };

    product.points.push(point);
    product.sourceNames = Array.from(
      new Set([
        ...product.sourceNames,
        ...sourcePrices.map((sourcePrice) => sourcePrice.storeName),
      ]),
    ).sort((first, second) => first.localeCompare(second, "es"));
    products.set(productKey, product);
  }

  return Array.from(products.values())
    .map((product) => ({
      ...product,
      points: product.points.sort(
        (first, second) =>
          new Date(first.searchedAt).getTime() -
          new Date(second.searchedAt).getTime(),
      ),
    }))
    .sort((first, second) => {
      const lastFirst =
        first.points[first.points.length - 1]?.searchedAt ?? "";
      const lastSecond =
        second.points[second.points.length - 1]?.searchedAt ?? "";

      if (lastSecond !== lastFirst) {
        return lastSecond.localeCompare(lastFirst);
      }

      return first.description.localeCompare(second.description, "es");
    });
}

function buildProductKey(row: EvolutionItemRow) {
  if (row.code) {
    return `code:${row.code}`;
  }

  if (row.ean13_di) {
    return `ean-di:${row.ean13_di}`;
  }

  if (row.ean13_bu) {
    return `ean-bu:${row.ean13_bu}`;
  }

  return `description:${normalizeProductText(row.description ?? "")}`;
}

function normalizeProductText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
        priceCondition:
          typeof sourcePrice.priceCondition === "string"
            ? sourcePrice.priceCondition
            : null,
        alternatePrices: parseAlternatePrices(sourcePrice.alternatePrices),
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

function parseAlternatePrices(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const alternatePrice = item as {
      label?: unknown;
      price?: unknown;
      comparisonPrice?: unknown;
    };

    if (
      typeof alternatePrice.label !== "string" ||
      typeof alternatePrice.price !== "number" ||
      !Number.isFinite(alternatePrice.price)
    ) {
      return [];
    }

    return [
      {
        label: alternatePrice.label,
        price: alternatePrice.price,
        comparisonPrice:
          typeof alternatePrice.comparisonPrice === "number"
            ? alternatePrice.comparisonPrice
            : alternatePrice.price,
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
