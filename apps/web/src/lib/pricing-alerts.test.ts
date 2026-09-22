import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPricingAlertCandidates,
  getAlertCategoryQueries,
} from "./pricing-alerts";
import type {
  CatalogMetadata,
  CategorySearchResponse,
  ProductSearchResult,
  SourceSearchStatus,
} from "@/types/search";

test("una diferencia alta queda limitada si faltan mayoristas críticos", () => {
  const response = createCategoryResponse(130, 100);
  const alerts = buildPricingAlertCandidates({
    catalog: createCatalog(response.sources),
    categoryResponses: [response],
  });
  const alert = alerts.find((candidate) => candidate.type === "price_above_wholesale");

  assert.ok(alert);
  assert.equal(alert.severity, "warning");
  assert.equal(alert.metadata.limitedByCoverage, true);
  assert.match(alert.message, /Validar cobertura/);
});

test("detecta oportunidad cuando Aguiar está debajo del mayorista", () => {
  const response = createCategoryResponse(80, 100);
  const alerts = buildPricingAlertCandidates({
    catalog: createCatalog(response.sources),
    categoryResponses: [response],
  });
  const alert = alerts.find((candidate) => candidate.type === "margin_opportunity");

  assert.ok(alert);
  assert.equal(alert.severity, "info");
  assert.equal(alert.ownPrice, 80);
  assert.equal(alert.referencePrice, 100);
});

test("calcula la diferencia contra mayorista aunque un minorista sea más barato", () => {
  const response = createCategoryResponse(120, 100);
  const retail = createProduct(
    "vea-argentina-vtex",
    "Vea",
    "minorista",
    50,
  );
  response.groups[0]?.competitorProducts.push(retail);
  response.sources.push({
    ...createSource("vea-argentina-vtex", "Vea", 1),
    storeType: "minorista",
  });
  const alerts = buildPricingAlertCandidates({
    catalog: createCatalog(response.sources),
    categoryResponses: [response],
  });
  const alert = alerts.find((candidate) => candidate.type === "price_above_wholesale");

  assert.ok(alert);
  assert.equal(alert.gapPercent, 20);
  assert.equal(alert.referencePrice, 100);
});

test("mantiene visibles las fuentes críticas sin datos", () => {
  const response = createCategoryResponse(100, 110);
  const alerts = buildPricingAlertCandidates({
    catalog: createCatalog(response.sources),
    categoryResponses: [response],
  });
  const sourceNames = alerts
    .filter((candidate) => candidate.type === "source_unavailable")
    .map((candidate) => candidate.title);

  assert.ok(sourceNames.some((title) => title.startsWith("Vital:")));
  assert.ok(sourceNames.some((title) => title.startsWith("Carrefour Comerciante:")));
  assert.ok(sourceNames.some((title) => title.startsWith("Yaguar:")));
});

test("permite configurar las categorías del cron sin duplicados", () => {
  assert.deepEqual(
    getAlertCategoryQueries("alfajores, chocolates,alfajores"),
    ["alfajores", "chocolates"],
  );
});

function createCategoryResponse(
  ownPrice: number,
  wholesalePrice: number,
): CategorySearchResponse {
  const own = createProduct(
    "aguiar-arcor-resistencia",
    "Aguiar Resistencia",
    "mayorista",
    ownPrice,
  );
  const wholesale = createProduct(
    "maxiconsumo-chaco-auth",
    "Maxiconsumo Chaco",
    "mayorista",
    wholesalePrice,
  );
  const sources = [
    createSource("aguiar-arcor-resistencia", "Aguiar Resistencia", 1),
    createSource("maxiconsumo-chaco-auth", "Maxiconsumo Chaco", 1),
  ];

  return {
    query: "alfajores",
    normalizedQuery: "alfajores",
    searchedAt: new Date().toISOString(),
    durationMs: 20,
    sources,
    groups: [
      {
        id: "alfajores",
        categoryName: "Alfajores",
        matchedTerms: ["alfajor"],
        confidenceScore: 95,
        totalProducts: 2,
        tokinProductsCount: 1,
        competitorProductsCount: 1,
        tokinProducts: [own],
        competitorProducts: [wholesale],
        tokinBrands: [],
        competitorBrands: [],
        minTokinPrice: ownPrice,
        minCompetitorPrice: wholesalePrice,
      },
    ],
  };
}

function createProduct(
  sourceId: string,
  storeName: string,
  storeType: ProductSearchResult["storeType"],
  price: number,
): ProductSearchResult {
  return {
    observedAt: new Date().toISOString(),
    sourceId,
    storeName,
    storeType,
    brand: "Cofler",
    category: "Alfajores",
    rawName: "Alfajor Cofler Block 40,7gr.",
    normalizedName: "alfajor cofler block 40 7 gr",
    price,
    comparisonPrice: price,
    currency: "ARS",
    productUrl: null,
    imageUrl: null,
    confidenceScore: 95,
  };
}

function createSource(
  sourceId: string,
  storeName: string,
  resultsCount: number,
): SourceSearchStatus {
  return {
    sourceId,
    storeName,
    storeType: "mayorista",
    status: "success",
    resultsCount,
    durationMs: 10,
  };
}

function createCatalog(sources: SourceSearchStatus[]): CatalogMetadata {
  return {
    priceObservations: {
      totalProducts: 2, datedProducts: 2,
      oldestObservedAt: new Date().toISOString(), newestObservedAt: new Date().toISOString(),
    },
    status: "ready",
    region: {
      id: "argentina",
      name: "Argentina",
      scopeLabel: "Argentina",
    },
    brands: [],
    lastSyncedAt: new Date().toISOString(),
    durationMs: 10,
    productsCount: 2,
    sources,
    pendingSources: [],
  };
}

test("cron reciente con precios viejos alerta vigencia, no oportunidad de margen", () => {
  const response = createCategoryResponse(80, 100);
  for (const group of response.groups) {
    for (const product of [...group.tokinProducts, ...group.competitorProducts]) {
      product.observedAt = "2020-01-01T00:00:00Z";
    }
  }
  const catalog = createCatalog(response.sources);
  catalog.priceObservations!.oldestObservedAt = "2020-01-01T00:00:00Z";
  const alerts = buildPricingAlertCandidates({ catalog, categoryResponses: [response] });
  assert.ok(alerts.some((alert) => alert.type === "catalog_stale"));
  assert.equal(alerts.some((alert) => ["margin_opportunity", "price_above_wholesale", "missing_own_price"].includes(alert.type)), false);
});
