import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { targetBrands, findAllowedBrand, isAllowedBrandProduct } from "./brands.js";
import { loadImportedCatalogProducts } from "./imports.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizeProductName, normalizeQuery } from "./normalizers.js";
import { searchSource } from "./search.js";
import { scrapingSources } from "./sources/resistencia.js";
import type {
  CatalogMetadata,
  CatalogSnapshot,
  ProductSearchResult,
  ScrapingSource,
  SourceSearchStatus,
} from "./types.js";

const currentFilePath = fileURLToPath(import.meta.url);
const workerRoot = path.resolve(path.dirname(currentFilePath), "..");
const catalogPath = path.resolve(workerRoot, "data/catalog.json");

let currentCatalog: CatalogSnapshot = {
  status: "empty",
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
    currentCatalog.pendingSources = getPendingSources();

    if (currentCatalog.productsCount > 0 && currentCatalog.status !== "ready") {
      currentCatalog.status = "ready";
    }
  } catch {
    await persistCatalog(currentCatalog);
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
      confidenceScore: calculateConfidenceScore(query, product.rawName),
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
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  try {
    for (const source of fullPageSources) {
      const result = await searchSource(source, "", browser, {
        filterByConfidence: false,
        limitResults: false,
      });
      const allowedProducts = result.results
        .filter((product) => isAllowedBrandProduct(product.rawName))
        .map((product) => ({
          ...product,
          brand: findAllowedBrand(product.rawName)?.name,
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

        for (const source of querySources) {
          const result = await searchSource(source, searchTerm, browser);
          sourceStatuses.push({
            ...result.status,
            sourceId: `${result.status.sourceId}:${normalizedSearchTerm}`,
          });

          products.push(
            ...result.results
              .filter((product) => isAllowedBrandProduct(product.rawName))
              .map((product) => ({
                ...product,
                brand: findAllowedBrand(product.rawName)?.name ?? brand.name,
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
      brands: targetBrands.map((brand) => brand.name),
      lastSyncedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      productsCount: dedupedProducts.length,
      sources: summarizeSourceStatuses(sourceStatuses),
      pendingSources: getPendingSources(),
      products: dedupedProducts,
    };

    await persistCatalog(currentCatalog);
    return currentCatalog;
  } catch (error) {
    currentCatalog = {
      ...currentCatalog,
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Error sincronizando catalogo.",
    };
    await persistCatalog(currentCatalog);
    return currentCatalog;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function persistCatalog(snapshot: CatalogSnapshot) {
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, JSON.stringify(snapshot, null, 2));
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
      });
      continue;
    }

    grouped.set(sourceId, {
      ...existing,
      status: mergeStatus(existing.status, status.status),
      resultsCount: existing.resultsCount + status.resultsCount,
      durationMs: existing.durationMs + status.durationMs,
      errorMessage: existing.errorMessage ?? status.errorMessage,
    });
  }

  return Array.from(grouped.values());
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
