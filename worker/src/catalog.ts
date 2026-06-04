import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  targetBrands,
  findAllowedBrand,
  isAllowedBrandProduct,
  productMatchesTargetBrand,
  type TargetBrand,
} from "./brands.js";
import { loadImportedCatalogProducts } from "./imports.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizeProductName, normalizeQuery } from "./normalizers.js";
import { applyPresentationScore } from "./presentation.js";
import { catalogRegion } from "./region.js";
import { searchSource, sourceNeedsBrowser } from "./search.js";
import { scrapingSources } from "./sources/argentina.js";
import type {
  CatalogMetadata,
  CatalogSnapshot,
  PriceListInputItem,
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
  ProductSearchResult,
  ScrapingSource,
  SourceSearchStatus,
  StoreType,
} from "./types.js";

const currentFilePath = fileURLToPath(import.meta.url);
const workerRoot = path.resolve(path.dirname(currentFilePath), "..");
const catalogPath = path.resolve(workerRoot, "data/catalog.json");
const AGUIAR_TOKIN_SOURCE_ID = "aguiar-arcor-resistencia";

let currentCatalog: CatalogSnapshot = {
  status: "empty",
  region: catalogRegion,
  brands: targetBrands.map((brand) => brand.name),
  lastSyncedAt: null,
  durationMs: null,
  productsCount: 0,
  sources: [],
  pendingSources: getPendingSources(),
  products: [],
};
let activeSync: Promise<CatalogSnapshot> | null = null;

export async function loadCatalogFromDisk() {
  try {
    const raw = await readFile(catalogPath, "utf8");
    currentCatalog = JSON.parse(raw) as CatalogSnapshot;
    currentCatalog.region = catalogRegion;
    currentCatalog.pendingSources = getPendingSources();
    currentCatalog.sources = hydrateSourceStatusStoreTypes(
      currentCatalog.sources,
      currentCatalog.products,
    );

    if (currentCatalog.productsCount > 0 && currentCatalog.status !== "ready") {
      currentCatalog.status = "ready";
    }
  } catch {
    await persistCatalogIfWritable(currentCatalog);
  }

  return currentCatalog;
}

export function getCatalogSnapshot() {
  return currentCatalog;
}

export function getCatalogMetadata(): CatalogMetadata {
  const { products: _products, ...metadata } = currentCatalog;
  return metadata;
}

export async function syncCatalog() {
  if (activeSync) {
    return activeSync;
  }

  activeSync = runCatalogSync().finally(() => {
    activeSync = null;
  });

  return activeSync;
}

export function syncCatalogInBackground() {
  void syncCatalog().catch((error) => {
    currentCatalog = {
      ...currentCatalog,
      status: currentCatalog.productsCount > 0 ? "ready" : "failed",
      errorMessage:
        error instanceof Error ? error.message : "Error sincronizando catalogo.",
    };
  });
}

export function searchCatalog(query: string) {
  const startedAt = Date.now();
  const normalizedQuery = normalizeQuery(query);
  const results = currentCatalog.products
    .map((product) => ({
      ...product,
      confidenceScore: calculateCatalogProductScore(query, product),
    }))
    .filter((product) => product.confidenceScore >= 45)
    .sort((first, second) => {
      if (first.price !== second.price) {
        return first.price - second.price;
      }

      return second.confidenceScore - first.confidenceScore;
    });

  return {
    query,
    normalizedQuery,
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    results,
    sources: currentCatalog.sources,
    catalog: getCatalogMetadata(),
  };
}

export function matchPriceListItems(
  items: PriceListInputItem[],
): PriceListResponse {
  const startedAt = Date.now();
  const results = items.map((item) => matchPriceListItem(item));
  const matchedCount = results.filter((result) => result.status === "matched").length;

  return {
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    itemsCount: items.length,
    matchedCount,
    unmatchedCount: items.length - matchedCount,
    sources: currentCatalog.sources,
    catalog: getCatalogMetadata(),
    results,
  };
}

async function runCatalogSync(): Promise<CatalogSnapshot> {
  const startedAt = Date.now();

  currentCatalog = {
    ...currentCatalog,
    status: currentCatalog.productsCount > 0 ? currentCatalog.status : "syncing",
    errorMessage: undefined,
  };

  const products: ProductSearchResult[] = [];
  const sourceStatuses: SourceSearchStatus[] = [];
  const activeSources = scrapingSources.filter((source) => source.enabled !== false);
  const querySources = activeSources.filter(
    (source) => source.catalogSearchMode !== "full_page",
  );
  const fullPageSources = activeSources.filter(
    (source) => source.catalogSearchMode === "full_page",
  );
  try {
    for (const source of fullPageSources) {
      const result = await searchSource(source, "", undefined, {
        filterByConfidence: false,
        limitResults: false,
      });
      const allowedProducts = result.results
        .filter((product) => isAllowedBrandProduct(getProductMatchText(product)))
        .map((product) => ({
          ...product,
          brand: findAllowedBrand(getProductMatchText(product))?.name,
        }));

      sourceStatuses.push({
        ...result.status,
        resultsCount: allowedProducts.length,
        status: allowedProducts.length > 0 ? "success" : "no_results",
      });
      products.push(...allowedProducts);
    }

    for (const brand of targetBrands) {
      const seenSearchTerms = new Set<string>();

      for (const searchTerm of brand.searchTerms) {
        const normalizedSearchTerm = normalizeProductName(searchTerm);

        if (seenSearchTerms.has(normalizedSearchTerm)) {
          continue;
        }

        seenSearchTerms.add(normalizedSearchTerm);

        const apiLikeQuerySources = querySources.filter(
          (source) => !sourceNeedsBrowser(source),
        );
        const browserQuerySources = querySources.filter(sourceNeedsBrowser);
        const apiLikeSourceResults = await Promise.all(
          apiLikeQuerySources.map((source) =>
            searchSource(source, searchTerm),
          ),
        );
        const browserSourceResults: Awaited<ReturnType<typeof searchSource>>[] = [];

        for (const source of browserQuerySources) {
          browserSourceResults.push(
            await searchSource(source, searchTerm),
          );
        }

        const sourceResults = [
          ...apiLikeSourceResults,
          ...browserSourceResults,
        ];

        for (const result of sourceResults) {
          sourceStatuses.push({
            ...result.status,
            sourceId: `${result.status.sourceId}:${normalizedSearchTerm}`,
          });

          products.push(
            ...result.results
              .filter((product) =>
                isAllowedBrandProduct(getProductMatchText(product)),
              )
              .map((product) => ({
                ...product,
                brand:
                  findAllowedBrand(getProductMatchText(product))?.name ??
                  brand.name,
              })),
          );
        }
      }
    }

    const importedCatalog = await loadImportedCatalogProducts();
    products.push(...importedCatalog.products);
    sourceStatuses.push(...importedCatalog.statuses);

    const dedupedProducts = dedupeCatalogProducts(products).sort(
      (first, second) => first.price - second.price,
    );

    currentCatalog = {
      status: "ready",
      region: catalogRegion,
      brands: targetBrands.map((brand) => brand.name),
      lastSyncedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      productsCount: dedupedProducts.length,
      sources: summarizeSourceStatuses(sourceStatuses),
      pendingSources: getPendingSources(),
      products: dedupedProducts,
    };

    await persistCatalogIfWritable(currentCatalog);
    return currentCatalog;
  } catch (error) {
    currentCatalog = {
      ...currentCatalog,
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Error sincronizando catalogo.",
    };
    await persistCatalogIfWritable(currentCatalog);
    return currentCatalog;
  }
}

function getProductMatchText(product: ProductSearchResult) {
  if (findAllowedBrand(product.rawName)) {
    return product.rawName;
  }

  return [product.brand, product.rawName].filter(Boolean).join(" ");
}

function matchPriceListItem(item: PriceListInputItem): PriceListItemResult {
  const expectedBrand = getExpectedBrandForPriceListItem(item);

  for (const query of buildPriceListQueries(item)) {
    const matches = findCatalogMatches(query, expectedBrand, item);
    const sourcePrices = summarizeSourcePrices(matches);
    const aguiarSourcePrice = sourcePrices.find(isAguiarTokinSourcePrice);
    const comparableSourcePrices = filterComparableSourcePrices(
      sourcePrices.filter((sourcePrice) => !isAguiarTokinSourcePrice(sourcePrice)),
    );
    const input = {
      ...item,
      currentPrice: aguiarSourcePrice?.price ?? item.currentPrice,
      currentCost: undefined,
    };

    if (!input.currentPrice && comparableSourcePrices.length === 0) {
      continue;
    }

    const bestSource = [...comparableSourcePrices].sort(
      (first, second) => first.price - second.price,
    )[0] ?? null;

    return {
      input,
      queryUsed: query,
      status: bestSource ? "matched" : "not_found",
      bestPrice: bestSource?.price ?? null,
      bestSource,
      sourcePrices: comparableSourcePrices,
      matchedCount: comparableSourcePrices.length + (aguiarSourcePrice ? 1 : 0),
    };
  }

  return {
    input: item,
    queryUsed: null,
    status: "not_found",
    bestPrice: null,
    bestSource: null,
    sourcePrices: [],
    matchedCount: 0,
  };
}

function isAguiarTokinSourcePrice(sourcePrice: PriceListSourcePrice) {
  return sourcePrice.sourceId === AGUIAR_TOKIN_SOURCE_ID;
}

function filterComparableSourcePrices(sourcePrices: PriceListSourcePrice[]) {
  const maxScore = Math.max(
    0,
    ...sourcePrices.map((sourcePrice) => sourcePrice.confidenceScore),
  );

  if (maxScore >= 80) {
    return sourcePrices.filter((sourcePrice) => sourcePrice.confidenceScore >= 80);
  }

  return sourcePrices;
}

function buildPriceListQueries(item: PriceListInputItem) {
  const queries = [
    cleanIdentifier(item.ean13Di),
    cleanIdentifier(item.ean13Bu),
    cleanIdentifier(item.code),
    normalizeImportedProductDescription(item.description),
    normalizeImportedProductDescription(item.description, { stripSizes: true }),
    [item.rubro, normalizeImportedProductDescription(item.description)]
      .filter(Boolean)
      .join(" "),
  ].filter((query): query is string => Boolean(query && query.length >= 2));

  return Array.from(new Set(queries));
}

function findCatalogMatches(
  query: string,
  expectedBrand?: TargetBrand,
  item?: PriceListInputItem,
) {
  const itemPresentationText = item
    ? [item.description, item.rubro].filter(Boolean).join(" ")
    : null;
  const queryIdentifier = cleanIdentifier(query);

  return currentCatalog.products
    .filter((product) =>
      expectedBrand ? productMatchesExpectedBrand(product, expectedBrand) : true,
    )
    .map((product) => {
      const exactIdentifierMatch =
        Boolean(queryIdentifier) &&
        getProductIdentifiers(product).some(
          (identifier) => cleanIdentifier(identifier) === queryIdentifier,
        );
      const baseScore = calculateCatalogProductScore(query, product);
      const confidenceScore = exactIdentifierMatch
        ? 100
        : itemPresentationText
          ? applyPresentationScore(
              baseScore,
              itemPresentationText,
              getProductMatchText(product),
            )
          : baseScore;

      return {
        ...product,
        confidenceScore,
      };
    })
    .filter((product) => product.confidenceScore >= 60)
    .sort((first, second) => {
      if (second.confidenceScore !== first.confidenceScore) {
        return second.confidenceScore - first.confidenceScore;
      }

      return first.price - second.price;
    });
}

function getExpectedBrandForPriceListItem(item: PriceListInputItem) {
  return findAllowedBrand(
    normalizeImportedProductDescription(item.description, { stripSizes: true }),
  );
}

function productMatchesExpectedBrand(
  product: ProductSearchResult,
  expectedBrand: TargetBrand,
) {
  const normalizedProductText = normalizeProductName(getProductMatchText(product));

  return productMatchesTargetBrand(normalizedProductText, expectedBrand);
}

function summarizeSourcePrices(products: ProductSearchResult[]) {
  const bestBySource = new Map<string, PriceListSourcePrice>();

  for (const product of products) {
    const current = bestBySource.get(product.sourceId);

    if (
      current &&
      (current.confidenceScore > product.confidenceScore ||
        (current.confidenceScore === product.confidenceScore &&
          current.price <= product.price))
    ) {
      continue;
    }

    bestBySource.set(product.sourceId, {
      sourceId: product.sourceId,
      storeName: product.storeName,
      storeType: product.storeType,
      sourceUrl: product.sourceUrl,
      dataOrigin: product.dataOrigin,
      sourceScope: product.sourceScope,
      price: product.price,
      currency: product.currency,
      productName: product.rawName,
      productUrl: product.productUrl,
      confidenceScore: product.confidenceScore,
    });
  }

  return Array.from(bestBySource.values()).sort(
    (first, second) => first.price - second.price,
  );
}

function calculateCatalogProductScore(
  query: string,
  product: ProductSearchResult,
) {
  const queryIdentifier = cleanIdentifier(query);

  if (
    queryIdentifier &&
    getProductIdentifiers(product).some(
      (identifier) => cleanIdentifier(identifier) === queryIdentifier,
    )
  ) {
    return 100;
  }

  return calculateConfidenceScore(query, getProductMatchText(product));
}

function getProductIdentifiers(product: ProductSearchResult) {
  return [product.sku, ...(product.barcodes ?? [])].filter(
    (value): value is string => Boolean(value),
  );
}

function cleanIdentifier(value: string | number | null | undefined) {
  const normalizedValue = String(value ?? "").replace(/\D/g, "");
  return normalizedValue && normalizedValue !== "0" ? normalizedValue : "";
}

function normalizeImportedProductDescription(
  value: string | undefined,
  options: { stripSizes?: boolean } = {},
) {
  let normalizedValue = String(value ?? "")
    .replace(/\*/g, " ")
    .replace(/\bALF\./gi, "alfajor ")
    .replace(/\bBOM\./gi, "bombon ")
    .replace(/\bCHOC\./gi, "chocolate ")
    .replace(/\bGALL\./gi, "galletitas ")
    .replace(/\bMERME?\./gi, "mermelada ")
    .replace(/\bJG\.PV\./gi, "jugo polvo ")
    .replace(/\bCAR\./gi, "caramelo ")
    .replace(/\bRELL\b/gi, "relleno")
    .replace(/\bBOB\b/gi, "bon o bon")
    .replace(/\s+/g, " ");

  if (options.stripSizes) {
    normalizedValue = normalizedValue
      .replace(
        /\b\d+(?:[,.]\d+)?\s*(grs?|g|kg|cc|ml|unid\.?|unidad(?:es)?|u)\b/gi,
        " ",
      )
      .replace(/\b\d+\b/g, " ");
  }

  return normalizedValue.replace(/\s+/g, " ").trim();
}

async function persistCatalog(snapshot: CatalogSnapshot) {
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, JSON.stringify(snapshot, null, 2));
}

async function persistCatalogIfWritable(snapshot: CatalogSnapshot) {
  try {
    await persistCatalog(snapshot);
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      return;
    }

    throw error;
  }
}

function isReadOnlyFilesystemError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EROFS"
  );
}

function dedupeCatalogProducts(products: ProductSearchResult[]) {
  const seen = new Set<string>();
  const deduped: ProductSearchResult[] = [];

  for (const product of products) {
    const key = [
      product.sourceId,
      product.brand ?? "",
      product.normalizedName,
      product.price.toFixed(2),
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(product);
    }
  }

  return deduped;
}

function summarizeSourceStatuses(statuses: SourceSearchStatus[]) {
  const grouped = new Map<string, SourceSearchStatus>();

  for (const status of statuses) {
    const sourceId = status.sourceId.split(":")[0] ?? status.sourceId;
    const existing = grouped.get(sourceId);

    if (!existing) {
      grouped.set(sourceId, {
        ...status,
        sourceId,
        storeType: status.storeType ?? inferSourceStatusStoreType(sourceId),
      });
      continue;
    }

    grouped.set(sourceId, {
      ...existing,
      status: mergeStatus(existing.status, status.status),
      resultsCount: existing.resultsCount + status.resultsCount,
      durationMs: existing.durationMs + status.durationMs,
      errorMessage: existing.errorMessage ?? status.errorMessage,
      storeType:
        existing.storeType ??
        status.storeType ??
        inferSourceStatusStoreType(sourceId),
    });
  }

  return Array.from(grouped.values());
}

function hydrateSourceStatusStoreTypes(
  statuses: SourceSearchStatus[],
  products: ProductSearchResult[],
) {
  return statuses.map((status) => ({
    ...status,
    storeType:
      status.storeType ??
      products.find((product) => product.sourceId === status.sourceId)?.storeType ??
      inferSourceStatusStoreType(status.sourceId),
  }));
}

function inferSourceStatusStoreType(sourceId: string): StoreType {
  return (
    scrapingSources.find((source) => source.id === sourceId)?.storeType ??
    "minorista"
  );
}

function mergeStatus(
  current: SourceSearchStatus["status"],
  next: SourceSearchStatus["status"],
) {
  if (current === "success" || next === "success") {
    return "success";
  }

  if (current === "timeout" || next === "timeout") {
    return "timeout";
  }

  if (current === "failed" || next === "failed") {
    return "failed";
  }

  return "no_results";
}

function getPendingSources() {
  return scrapingSources
    .filter((source) => source.enabled === false)
    .map((source) => ({
      sourceId: source.id,
      storeName: source.storeName,
      storeType: source.storeType,
      status: source.disabledKind ?? inferPendingStatus(source),
      message: source.disabledReason ?? "Pendiente de integracion.",
    }));
}

function inferPendingStatus(source: ScrapingSource) {
  const reason = source.disabledReason?.toLowerCase() ?? "";

  if (reason.includes("login") || reason.includes("cuenta")) {
    return "requires_login" as const;
  }

  if (reason.includes("rubro")) {
    return "out_of_scope" as const;
  }

  return "no_public_catalog" as const;
}
