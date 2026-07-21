import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCategoryPricingDashboard,
  consolidateProductVariants,
  formatGapExplanation,
} from "./category-pricing";
import type {
  CategorySearchGroup,
  ProductSearchResult,
  SourceSearchStatus,
} from "@/types/search";

test("el mejor mercado no incluye el precio propio", () => {
  const dashboard = buildCategoryPricingDashboard({
    group: createGroup([
      createProduct("aguiar-arcor-resistencia", "Aguiar Resistencia", "mayorista", 100),
      createProduct("maxiconsumo-chaco-auth", "Maxiconsumo Chaco", "mayorista", 120),
      createProduct("vea-argentina-vtex", "Vea", "minorista", 90),
    ]),
    searchedAt: new Date().toISOString(),
    sources: createSourceStatuses(),
  });

  assert.equal(dashboard.rows[0]?.aguiarPrice?.price, 100);
  assert.equal(dashboard.rows[0]?.bestOverall?.price, 90);
  assert.equal(dashboard.rows[0]?.winningSourceName, "Vea");
});

test("un producto sin equivalente propio no informa confianza ficticia", () => {
  const dashboard = buildCategoryPricingDashboard({
    group: createGroup([
      createProduct("maxiconsumo-chaco-auth", "Maxiconsumo Chaco", "mayorista", 120),
    ]),
    searchedAt: new Date().toISOString(),
    sources: createSourceStatuses(),
  });

  assert.equal(dashboard.rows[0]?.matchQuality, "not_comparable");
  assert.equal(dashboard.rows[0]?.confidenceScore, null);
  assert.equal(dashboard.rows[0]?.recommendation.label, "Sin equivalente Aguiar");
});

test("consolida los modos unidad y bulto de Tokin", () => {
  const unit = createProduct(
    "aguiar-arcor-resistencia",
    "Aguiar Resistencia",
    "mayorista",
    673.91,
  );
  const pack = { ...unit, sku: "pack", price: 24_260.57, comparisonPrice: 24_260.57 };
  const consolidated = consolidateProductVariants([unit, pack]);

  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0]?.comparisonPrice, 673.91);
  assert.equal(consolidated[0]?.price, 24_260.57);
  assert.equal(consolidated[0]?.packageQuantity, 36);
});

test("explica la diferencia sin exigir interpretar el signo", () => {
  assert.equal(formatGapExplanation(12.34), "Aguiar 12,3% más caro");
  assert.equal(formatGapExplanation(-5.06), "Aguiar 5,1% más barato");
  assert.equal(formatGapExplanation(null), "Sin comparación");
});

function createGroup(products: ProductSearchResult[]): CategorySearchGroup {
  const own = products.filter((product) => product.sourceId === "aguiar-arcor-resistencia");
  const market = products.filter((product) => product.sourceId !== "aguiar-arcor-resistencia");

  return {
    id: "alfajores",
    categoryName: "Alfajores",
    matchedTerms: ["alfajor"],
    confidenceScore: 95,
    totalProducts: products.length,
    tokinProductsCount: own.length,
    competitorProductsCount: market.length,
    tokinProducts: own,
    competitorProducts: market,
    tokinBrands: [],
    competitorBrands: [],
    minTokinPrice: own[0]?.price ?? null,
    minCompetitorPrice: market[0]?.price ?? null,
  };
}

function createProduct(
  sourceId: string,
  storeName: string,
  storeType: ProductSearchResult["storeType"],
  price: number,
): ProductSearchResult {
  return {
    sourceId,
    storeName,
    storeType,
    sku: "unit",
    brand: "Cofler",
    category: "Alfajores",
    rawName: "Alfajor Cofler Block 40,7gr.",
    normalizedName: "alfajor cofler block 40 7 gr",
    price,
    comparisonPrice: price,
    currency: "ARS",
    productUrl: null,
    imageUrl: "https://example.com/cofler.jpg",
    confidenceScore: 95,
  };
}

function createSourceStatuses(): SourceSearchStatus[] {
  return [
    {
      sourceId: "aguiar-arcor-resistencia",
      storeName: "Aguiar Resistencia",
      storeType: "mayorista",
      status: "success",
      resultsCount: 1,
      durationMs: 100,
    },
    {
      sourceId: "maxiconsumo-chaco-auth",
      storeName: "Maxiconsumo Chaco",
      storeType: "mayorista",
      status: "success",
      resultsCount: 1,
      durationMs: 100,
    },
  ];
}
