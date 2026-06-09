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
import {
  findAiAssistedProductMatch,
  type AiMatchCandidate,
} from "./ai-matching.js";
import {
  buildCatalogCategorySearchTerms,
  findCatalogCategory,
  getCategorySearchTermsForText,
} from "./categories.js";
import { loadImportedCatalogProducts } from "./imports.js";
import { calculateConfidenceScore } from "./matching.js";
import {
  expandCommonProductAbbreviations,
  normalizeProductName,
  normalizeQuery,
} from "./normalizers.js";
import {
  applyPresentationScore,
  extractProductPresentation,
} from "./presentation.js";
import { catalogRegion } from "./region.js";
import { searchSource, sourceNeedsBrowser } from "./search.js";
import { scrapingSources } from "./sources/argentina.js";
import { getComparisonPrice, withUnitPricing } from "./unit-pricing.js";
import type {
  CatalogMetadata,
  CatalogSnapshot,
  PriceListDirectSourceDiagnostics,
  PriceListInputItem,
  PriceListItemResult,
  PriceListMatchDiagnostics,
  PriceListQueryDiagnostic,
  PriceListRejectedCandidate,
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
const MIN_PRICE_LIST_CONFIDENCE_SCORE = 60;
const DIAGNOSTIC_REJECT_LIMIT = 5;

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
    currentCatalog.products = currentCatalog.products.map((product) =>
      withUnitPricing(product, getProductMatchText(product)),
    );
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
      const firstPrice = getComparisonPrice(first);
      const secondPrice = getComparisonPrice(second);

      if (firstPrice !== secondPrice) {
        return firstPrice - secondPrice;
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

export async function matchPriceListItems(
  items: PriceListInputItem[],
): Promise<PriceListResponse> {
  const startedAt = Date.now();
  const results = await mapWithConcurrency(
    items,
    4,
    matchPriceListItemWithDirectAguiar,
  );
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

async function matchPriceListItemWithDirectAguiar(
  item: PriceListInputItem,
): Promise<PriceListItemResult> {
  const catalogResult = matchPriceListItem(item);

  if (normalizeOptionalPrice(catalogResult.input.currentPrice)) {
    return catalogResult;
  }

  const expectedBrand = getExpectedBrandForPriceListItem(item);
  const aguiarSourcePrice = await findDirectAguiarSourcePrice(
    item,
    expectedBrand,
  );

  if (!aguiarSourcePrice.sourcePrice) {
    return {
      ...catalogResult,
      diagnostics: catalogResult.diagnostics
        ? {
            ...catalogResult.diagnostics,
            directAguiar: aguiarSourcePrice.diagnostics,
          }
        : catalogResult.diagnostics,
    };
  }

  return applyAguiarSourcePrice(catalogResult, aguiarSourcePrice);
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
        .map((product) => decorateCatalogProduct(product));

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
              .map((product) => decorateCatalogProduct(product, brand.name)),
          );
        }
      }
    }

    const seenCategorySearchTerms = new Set<string>();

    for (const searchTerm of buildCatalogCategorySearchTerms()) {
      const normalizedSearchTerm = normalizeProductName(searchTerm);

      if (seenCategorySearchTerms.has(normalizedSearchTerm)) {
        continue;
      }

      seenCategorySearchTerms.add(normalizedSearchTerm);

      const apiLikeQuerySources = querySources.filter(
        (source) => !sourceNeedsBrowser(source),
      );
      const browserQuerySources = querySources.filter(sourceNeedsBrowser);
      const apiLikeSourceResults = await Promise.all(
        apiLikeQuerySources.map((source) => searchSource(source, searchTerm)),
      );
      const browserSourceResults: Awaited<ReturnType<typeof searchSource>>[] = [];

      for (const source of browserQuerySources) {
        browserSourceResults.push(await searchSource(source, searchTerm));
      }

      const sourceResults = [...apiLikeSourceResults, ...browserSourceResults];
      const fallbackCategory = findCatalogCategory(searchTerm)?.name;

      for (const result of sourceResults) {
        sourceStatuses.push({
          ...result.status,
          sourceId: `${result.status.sourceId}:category:${normalizedSearchTerm}`,
        });

        products.push(
          ...result.results
            .filter((product) =>
              isAllowedBrandProduct(getProductMatchText(product)),
            )
            .map((product) =>
              decorateCatalogProduct(product, undefined, fallbackCategory),
            ),
        );
      }
    }

    const importedCatalog = await loadImportedCatalogProducts();
    products.push(...importedCatalog.products);
    sourceStatuses.push(...importedCatalog.statuses);

    const dedupedProducts = dedupeCatalogProducts(products).sort(
      (first, second) => getComparisonPrice(first) - getComparisonPrice(second),
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
  const productCategory =
    product.category ?? findCatalogCategory(product.rawName)?.name;

  return [product.brand, productCategory, product.rawName]
    .filter(Boolean)
    .join(" ");
}

function decorateCatalogProduct(
  product: ProductSearchResult,
  fallbackBrand?: string,
  fallbackCategory?: string,
) {
  const matchText = getProductMatchText(product);

  return {
    ...product,
    brand: findAllowedBrand(matchText)?.name ?? product.brand ?? fallbackBrand,
    category:
      product.category ??
      findCatalogCategory(matchText)?.name ??
      fallbackCategory,
  };
}

function matchPriceListItem(item: PriceListInputItem): PriceListItemResult {
  const expectedBrand = getExpectedBrandForPriceListItem(item);
  const diagnostics = createPriceListDiagnostics(expectedBrand);

  for (const query of buildPriceListQueries(item)) {
    const analysis = analyzeProductMatches(
      query,
      currentCatalog.products,
      expectedBrand,
      item,
    );
    diagnostics.queriesTried.push(query);
    diagnostics.queryDiagnostics.push(analysis.diagnostic);

    const matches = analysis.matches;
    const sourcePrices = summarizeSourcePrices(matches);
    const aguiarSourcePrice = sourcePrices.find(isAguiarTokinSourcePrice);
    const comparableSourcePrices = filterComparableSourcePrices(
      sourcePrices.filter((sourcePrice) => !isAguiarTokinSourcePrice(sourcePrice)),
    );
    const input = {
      ...item,
      currentPrice: aguiarSourcePrice
        ? getComparisonPrice(aguiarSourcePrice)
        : item.currentPrice,
      currentCost: undefined,
    };

    if (!input.currentPrice && comparableSourcePrices.length === 0) {
      continue;
    }

    const bestSource = [...comparableSourcePrices].sort(
      (first, second) => getComparisonPrice(first) - getComparisonPrice(second),
    )[0] ?? null;
    const hasAguiarPrice = Boolean(normalizeOptionalPrice(input.currentPrice));

    return {
      input,
      queryUsed: query,
      status: bestSource || hasAguiarPrice ? "matched" : "not_found",
      bestPrice: bestSource ? getComparisonPrice(bestSource) : null,
      bestSource,
      sourcePrices: comparableSourcePrices,
      matchedCount: comparableSourcePrices.length + (aguiarSourcePrice ? 1 : 0),
      diagnostics: {
        ...diagnostics,
        matchedQuery: query,
      },
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
    diagnostics,
  };
}

async function findDirectAguiarSourcePrice(
  item: PriceListInputItem,
  expectedBrand?: TargetBrand,
) {
  const source = scrapingSources.find(
    (scrapingSource) => scrapingSource.id === AGUIAR_TOKIN_SOURCE_ID,
  );

  if (!source || source.enabled === false) {
    const diagnostics = createDirectSourceDiagnostics(
      source ?? {
        id: AGUIAR_TOKIN_SOURCE_ID,
        storeName: "Aguiar Resistencia",
      },
    );

    return {
      query: null,
      sourcePrice: null,
      diagnostics: {
        ...diagnostics,
        errorMessage:
          source?.disabledReason ?? "Fuente Aguiar/Tokin no configurada.",
      },
    };
  }

  const diagnostics = createDirectSourceDiagnostics(source);
  let lastErrorMessage: string | undefined;
  const aiCandidates: AiMatchCandidate[] = [];

  for (const query of buildAguiarDirectQueries(item, expectedBrand)) {
    diagnostics.queriesTried.push(query);
    const result = await searchSource(source, query, undefined, {
      filterByConfidence: false,
      limitResults: false,
    }).catch((error) => {
      lastErrorMessage =
        error instanceof Error ? error.message : "Error consultando Aguiar.";
      return null;
    });

    if (!result) {
      diagnostics.queryDiagnostics.push(createEmptyQueryDiagnostic(query));
      continue;
    }

    aiCandidates.push(
      ...result.results.map((product) => ({
        query,
        product,
      })),
    );

    const analysis = analyzeProductMatches(
      query,
      result.results,
      expectedBrand,
      item,
      { sourceResultsCount: result.results.length },
    );
    diagnostics.queryDiagnostics.push(analysis.diagnostic);
    const sourcePrice = summarizeSourcePrices(analysis.matches).find(
      isAguiarTokinSourcePrice,
    );

    if (sourcePrice) {
      return {
        query,
        sourcePrice,
        diagnostics: {
          ...diagnostics,
          status: "matched" as const,
          matchedQuery: query,
        },
      };
    }
  }

  const aiMatch = await findAiAssistedProductMatch({
    item,
    expectedBrand,
    candidates: aiCandidates,
  });

  if (aiMatch.product) {
    const sourcePrice = summarizeSourcePrices([aiMatch.product]).find(
      isAguiarTokinSourcePrice,
    );

    if (sourcePrice) {
      return {
        query: aiMatch.query,
        sourcePrice,
        diagnostics: {
          ...diagnostics,
          status: "matched" as const,
          matchedQuery: aiMatch.query,
          aiMatch: aiMatch.diagnostic,
        },
      };
    }
  }

  return {
    query: null,
    sourcePrice: null,
    diagnostics: {
      ...diagnostics,
      status: lastErrorMessage ? ("failed" as const) : ("no_results" as const),
      aiMatch: aiMatch.diagnostic,
      errorMessage: lastErrorMessage,
    },
  };
}

function applyAguiarSourcePrice(
  result: PriceListItemResult,
  aguiarMatch: {
    query: string | null;
    sourcePrice: PriceListSourcePrice;
    diagnostics: PriceListDirectSourceDiagnostics;
  },
): PriceListItemResult {
  const input = {
    ...result.input,
    currentPrice: getComparisonPrice(aguiarMatch.sourcePrice),
  };
  const hasAnyPrice = result.bestSource !== null || Boolean(input.currentPrice);

  return {
    ...result,
    input,
    queryUsed: result.queryUsed ?? aguiarMatch.query,
    status: hasAnyPrice ? "matched" : "not_found",
    matchedCount: result.matchedCount + 1,
    diagnostics: result.diagnostics
      ? {
          ...result.diagnostics,
          directAguiar: aguiarMatch.diagnostics,
        }
      : result.diagnostics,
  };
}

function buildAguiarDirectQueries(
  item: PriceListInputItem,
  expectedBrand?: TargetBrand,
) {
  const normalizedDescription = normalizeImportedProductDescription(item.description);
  const descriptionWithoutPackageCount = normalizeImportedProductDescription(
    item.description,
    { stripPackageCount: true },
  );
  const descriptionWithoutSizes = normalizeImportedProductDescription(
    item.description,
    { stripSizes: true },
  );
  const categoryQueries = buildPriceListCategoryQueries(item);
  const searchFriendlyQueries = buildSearchFriendlyAguiarQueries(
    item,
    expectedBrand,
    categoryQueries,
  );
  const queries = [
    cleanIdentifier(item.ean13Di),
    cleanIdentifier(item.ean13Bu),
    cleanIdentifier(item.code),
    ...searchFriendlyQueries,
    normalizedDescription,
    descriptionWithoutPackageCount,
    descriptionWithoutSizes,
    ...categoryQueries.map((categoryQuery) =>
      combineQueryParts(categoryQuery, normalizedDescription),
    ),
    ...categoryQueries.map((categoryQuery) =>
      combineQueryParts(categoryQuery, descriptionWithoutPackageCount),
    ),
    ...categoryQueries.map((categoryQuery) =>
      combineQueryParts(categoryQuery, descriptionWithoutSizes),
    ),
  ].filter((query): query is string => Boolean(query && query.length >= 2));

  return expandSearchAliasQueryVariants(Array.from(new Set(queries))).slice(0, 14);
}

function buildSearchFriendlyAguiarQueries(
  item: PriceListInputItem,
  expectedBrand: TargetBrand | undefined,
  categoryQueries: string[],
) {
  const normalizedDescription = normalizeImportedProductDescription(item.description);
  const descriptionWithoutPackageCount = normalizeImportedProductDescription(
    item.description,
    { stripPackageCount: true },
  );
  const descriptionWithoutSizes = normalizeImportedProductDescription(
    item.description,
    { stripSizes: true },
  );
  const brandQueries = buildExpectedBrandQueries(expectedBrand);
  const presentationQueries = buildPresentationQueries(item.description);
  const queries: string[] = [];

  for (const brandQuery of brandQueries) {
    for (const categoryQuery of categoryQueries) {
      queries.push(combineQueryParts(categoryQuery, brandQuery));

      for (const presentationQuery of presentationQueries) {
        queries.push(
          combineQueryParts(categoryQuery, brandQuery, presentationQuery),
        );
        queries.push(
          combineQueryParts(brandQuery, categoryQuery, presentationQuery),
        );
      }
    }
  }

  for (const categoryQuery of categoryQueries) {
    for (const presentationQuery of presentationQueries) {
      queries.push(combineQueryParts(categoryQuery, presentationQuery));
    }
  }

  queries.push(
    removeLowValueSearchTerms(descriptionWithoutPackageCount),
    removeLowValueSearchTerms(descriptionWithoutSizes),
    removeLowValueSearchTerms(normalizedDescription),
  );

  return queries.filter((query) => query.length >= 2);
}

function buildExpectedBrandQueries(expectedBrand: TargetBrand | undefined) {
  if (!expectedBrand) {
    return [];
  }

  return Array.from(
    new Set(
      [expectedBrand.name, ...expectedBrand.searchTerms, ...expectedBrand.aliases]
        .map((value) => normalizeQuery(value))
        .filter(Boolean),
    ),
  );
}

function buildPresentationQueries(value: string | undefined) {
  const presentation = extractProductPresentation(String(value ?? ""));

  if (!presentation.amount || !presentation.unit) {
    return [];
  }

  const amount = formatPresentationAmount(presentation.amount);

  if (presentation.unit === "g") {
    return [`${amount} gr`, `${amount} g`];
  }

  if (presentation.unit === "ml") {
    return [`${amount} ml`, `${amount} cc`, `${amount} gr`, `${amount} g`];
  }

  return [`${amount} unid`, `${amount} unidades`];
}

function formatPresentationAmount(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100).replace(".", ",");
}

function removeLowValueSearchTerms(value: string) {
  return normalizeQuery(value)
    .replace(
      /\b(girasol|clasica|clasico|sabor|fco|frasco|doypack|familiar|seleccion|light)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function expandSearchAliasQueryVariants(queries: string[]) {
  const expandedQueries: string[] = [];

  for (const query of queries) {
    for (const variant of buildSearchAliasQueryVariants(query)) {
      if (!expandedQueries.includes(variant)) {
        expandedQueries.push(variant);
      }
    }
  }

  return expandedQueries;
}

function buildSearchAliasQueryVariants(query: string) {
  const variants = new Set([normalizeQuery(query)]);
  const replacements: Array<[RegExp, string]> = [
    [/\byogur\b/g, "yoghurt"],
    [/\bfrutilla\b/g, "fru"],
    [/\bmultifruta\b/g, "mix frutal"],
    [/\bjugo polvo\b/g, "jugo en polvo"],
    [/\bbon o bon\b/g, "bonobon"],
    [/\bmenthoplus\b/g, "mentho plus"],
  ];

  for (const [pattern, replacement] of replacements) {
    for (const variant of Array.from(variants)) {
      const nextVariant = variant.replace(pattern, replacement);

      if (nextVariant !== variant) {
        variants.add(nextVariant);
      }
    }
  }

  return Array.from(variants).filter(Boolean);
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
  const normalizedDescription = normalizeImportedProductDescription(item.description);
  const descriptionWithoutSizes = normalizeImportedProductDescription(
    item.description,
    { stripSizes: true },
  );
  const normalizedRubro = normalizeImportedProductDescription(item.rubro);
  const categoryQueries = buildPriceListCategoryQueries(item);
  const queries = [
    cleanIdentifier(item.ean13Di),
    cleanIdentifier(item.ean13Bu),
    cleanIdentifier(item.code),
    normalizedDescription,
    descriptionWithoutSizes,
    ...categoryQueries.map((categoryQuery) =>
      combineQueryParts(categoryQuery, normalizedDescription),
    ),
    ...categoryQueries.map((categoryQuery) =>
      combineQueryParts(categoryQuery, descriptionWithoutSizes),
    ),
    combineQueryParts(normalizedRubro, normalizedDescription),
  ].filter((query): query is string => Boolean(query && query.length >= 2));

  return Array.from(new Set(queries));
}

function buildPriceListCategoryQueries(item: PriceListInputItem) {
  const descriptionCategories = getCategorySearchTermsForText(item.description);
  const rubroCategories = getCategorySearchTermsForText(item.rubro);

  return Array.from(new Set([...descriptionCategories, ...rubroCategories]));
}

function combineQueryParts(...parts: Array<string | undefined>) {
  const queryParts: string[] = [];

  for (const rawPart of parts) {
    const part = rawPart?.trim();

    if (!part) {
      continue;
    }

    const normalizedPart = normalizeProductName(part);
    const normalizedQuery = normalizeProductName(queryParts.join(" "));

    if (!normalizedPart) {
      continue;
    }

    if (normalizedQuery && normalizedPart.includes(normalizedQuery)) {
      queryParts.splice(0, queryParts.length, part);
      continue;
    }

    if (normalizedQuery && normalizedQuery.includes(normalizedPart)) {
      continue;
    }

    queryParts.push(part);
  }

  return queryParts.join(" ");
}

function findCatalogMatches(
  query: string,
  expectedBrand?: TargetBrand,
  item?: PriceListInputItem,
) {
  return analyzeProductMatches(
    query,
    currentCatalog.products,
    expectedBrand,
    item,
  ).matches;
}

function analyzeProductMatches(
  query: string,
  products: ProductSearchResult[],
  expectedBrand?: TargetBrand,
  item?: PriceListInputItem,
  options: { sourceResultsCount?: number } = {},
) {
  const itemPresentationText = item
    ? [item.description, item.rubro].filter(Boolean).join(" ")
    : null;
  const queryIdentifier = cleanIdentifier(query);
  const matches: ProductSearchResult[] = [];
  const rejected: PriceListRejectedCandidate[] = [];
  let candidatesCount = 0;
  let rejectedCount = 0;

  for (const product of products) {
    const exactIdentifierMatch =
      Boolean(queryIdentifier) &&
      getProductIdentifiers(product).some(
        (identifier) => cleanIdentifier(identifier) === queryIdentifier,
      );
    const baseScore = exactIdentifierMatch
      ? 100
      : calculateCatalogProductScore(query, product);

    if (expectedBrand && !productMatchesExpectedBrand(product, expectedBrand)) {
      if (baseScore >= 45) {
        rejectedCount += 1;
        pushRejectedCandidate(
          rejected,
          product,
          "brand_mismatch",
          baseScore,
          baseScore,
        );
      }

      continue;
    }

    candidatesCount += 1;

    const confidenceScore = exactIdentifierMatch
      ? 100
      : itemPresentationText
        ? applyCatalogAttributeScore(
            baseScore,
            itemPresentationText,
            getProductMatchText(product),
          )
        : baseScore;

    if (confidenceScore >= MIN_PRICE_LIST_CONFIDENCE_SCORE) {
      matches.push({
        ...product,
        confidenceScore,
      });
      continue;
    }

    rejectedCount += 1;

    if (baseScore >= 35 || confidenceScore > 0) {
      pushRejectedCandidate(
        rejected,
        product,
        baseScore >= MIN_PRICE_LIST_CONFIDENCE_SCORE
          ? "presentation_or_flavor_mismatch"
          : "score_below_threshold",
        baseScore,
        confidenceScore,
      );
    }
  }

  matches.sort((first, second) => {
    if (second.confidenceScore !== first.confidenceScore) {
      return second.confidenceScore - first.confidenceScore;
    }

    return getComparisonPrice(first) - getComparisonPrice(second);
  });

  const diagnostic: PriceListQueryDiagnostic = {
    query,
    sourceResultsCount: options.sourceResultsCount,
    candidatesCount,
    matchesCount: matches.length,
    rejectedCount,
    topRejected: rejected
      .sort((first, second) => {
        if (second.baseScore !== first.baseScore) {
          return second.baseScore - first.baseScore;
        }

        return second.finalScore - first.finalScore;
      })
      .slice(0, DIAGNOSTIC_REJECT_LIMIT),
  };

  return { matches, diagnostic };
}

function createPriceListDiagnostics(
  expectedBrand?: TargetBrand,
): PriceListMatchDiagnostics {
  return {
    expectedBrand: expectedBrand?.name ?? null,
    queriesTried: [],
    matchedQuery: null,
    queryDiagnostics: [],
  };
}

function createDirectSourceDiagnostics(source: {
  id: string;
  storeName: string;
}): PriceListDirectSourceDiagnostics {
  return {
    sourceId: source.id,
    storeName: source.storeName,
    status: "skipped",
    queriesTried: [],
    matchedQuery: null,
    queryDiagnostics: [],
  };
}

function createEmptyQueryDiagnostic(query: string): PriceListQueryDiagnostic {
  return {
    query,
    sourceResultsCount: 0,
    candidatesCount: 0,
    matchesCount: 0,
    rejectedCount: 0,
    topRejected: [],
  };
}

function pushRejectedCandidate(
  candidates: PriceListRejectedCandidate[],
  product: ProductSearchResult,
  reason: PriceListRejectedCandidate["reason"],
  baseScore: number,
  finalScore: number,
) {
  candidates.push({
    sourceId: product.sourceId,
    storeName: product.storeName,
    storeType: product.storeType,
    productName: product.rawName,
    productUrl: product.productUrl,
    reason,
    baseScore,
    finalScore,
  });
}

function getExpectedBrandForPriceListItem(item: PriceListInputItem) {
  const descriptionBrand = findAllowedBrand(
    normalizeImportedProductDescription(item.description, { stripSizes: true }),
  );

  if (descriptionBrand) {
    return descriptionBrand;
  }

  return findAllowedBrand(
    normalizeImportedProductDescription(item.rubro, { stripSizes: true }),
  );
}

function productMatchesExpectedBrand(
  product: ProductSearchResult,
  expectedBrand: TargetBrand,
) {
  const normalizedProductText = normalizeProductName(
    [product.brand, product.rawName].filter(Boolean).join(" "),
  );

  return productMatchesTargetBrand(normalizedProductText, expectedBrand);
}

function applyCatalogAttributeScore(
  baseScore: number,
  inputText: string,
  productText: string,
) {
  const presentationScore = applyPresentationScore(
    baseScore,
    inputText,
    productText,
  );

  return applyFlavorScore(presentationScore, inputText, productText);
}

function applyFlavorScore(
  baseScore: number,
  inputText: string,
  productText: string,
) {
  if (baseScore <= 0) {
    return 0;
  }

  const inputFlavors = findFlavorTags(inputText);

  if (inputFlavors.length === 0) {
    return baseScore;
  }

  const productFlavors = findFlavorTags(productText);

  if (productFlavors.length === 0) {
    return baseScore;
  }

  return inputFlavors.some((flavor) => productFlavors.includes(flavor))
    ? baseScore
    : 0;
}

function findFlavorTags(value: string) {
  const normalizedValue = normalizeProductName(value);
  const flavorGroups = [
    [
      "multifruta",
      ["multifruta", "multi fruta", "mix frutal", "mix fruta", "frutal"],
    ],
    ["limonada", ["limonada"]],
    ["limon", ["limon"]],
    ["naranja", ["naranja"]],
    ["durazno", ["durazno"]],
    ["frutilla", ["frutilla"]],
    ["manzana", ["manzana"]],
    ["anana", ["anana"]],
    ["pera", ["pera"]],
    ["ciruela", ["ciruela"]],
    ["arandano", ["arandano"]],
    ["chocolate", ["chocolate"]],
    ["vainilla", ["vainilla"]],
    ["leche", ["leche"]],
    ["blanco", ["blanco", "blanca"]],
    ["menta", ["menta"]],
    ["mentol", ["mentol"]],
    ["cherry", ["cherry", "cereza"]],
  ] as const;

  return flavorGroups
    .filter(([, aliases]) =>
      aliases.some((alias) => flavorAliasMatches(normalizedValue, alias)),
    )
    .map(([flavor]) => flavor);
}

function flavorAliasMatches(normalizedValue: string, alias: string) {
  const normalizedAlias = normalizeProductName(alias);

  if (!normalizedAlias) {
    return false;
  }

  if (normalizedAlias.includes(" ")) {
    return normalizedValue.includes(normalizedAlias);
  }

  return normalizedValue.split(/\s+/).includes(normalizedAlias);
}

function summarizeSourcePrices(products: ProductSearchResult[]) {
  const bestBySource = new Map<string, PriceListSourcePrice>();

  for (const product of products) {
    const current = bestBySource.get(product.sourceId);

    if (
      current &&
      (current.confidenceScore > product.confidenceScore ||
        (current.confidenceScore === product.confidenceScore &&
          getComparisonPrice(current) <= getComparisonPrice(product)))
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
      comparisonPrice: getComparisonPrice(product),
      priceCondition: product.priceCondition ?? null,
      alternatePrices: product.alternatePrices ?? [],
      packageQuantity: product.packageQuantity ?? null,
      packageLabel: product.packageLabel ?? null,
      category: product.category,
      currency: product.currency,
      productName: product.rawName,
      productUrl: product.productUrl,
      confidenceScore: product.confidenceScore,
    });
  }

  return Array.from(bestBySource.values()).sort(
    (first, second) => getComparisonPrice(first) - getComparisonPrice(second),
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

function normalizeOptionalPrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function normalizeImportedProductDescription(
  value: string | undefined,
  options: { stripPackageCount?: boolean; stripSizes?: boolean } = {},
) {
  let normalizedValue = normalizeQuery(
    expandCommonProductAbbreviations(
      String(value ?? "").replace(/\*/g, " x "),
    ),
  );

  if (options.stripPackageCount) {
    normalizedValue = normalizedValue.replace(
      /\b\d{1,3}\s*x\s*(?=\d+(?:[,.]\d+)?\s*(?:grs?|g|kg|cc|ml|lts?|lt|l|unid\.?|unidad(?:es)?|uni|uds?|u)\b)/gi,
      " ",
    );
  }

  if (options.stripSizes) {
    normalizedValue = normalizedValue
      .replace(
        /\b\d+(?:[,.]\d+)?\s*(grs?|g|kg|cc|ml|lts?|lt|l|unid\.?|unidad(?:es)?|uni|uds?|u)\b/gi,
        " ",
      )
      .replace(/\b\d+\b/g, " ");
  }

  return normalizedValue.replace(/\bx\b/g, " ").replace(/\s+/g, " ").trim();
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
      getComparisonPrice(product).toFixed(2),
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
