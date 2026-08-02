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

test("normaliza display y bulto Tokin antes de comparar jugos en polvo", () => {
  const display = createProduct(
    "aguiar-arcor-resistencia",
    "Aguiar Resistencia",
    "mayorista",
    4_769.63,
  );
  display.brand = "BC";
  display.category = "Jugos en polvo";
  display.rawName = "Jugo en polvo BC limonada 7gr.";
  display.normalizedName = "jugo en polvo bc limonada 7 gr";
  const bulto = {
    ...display,
    sku: "bulto",
    price: 76_313.94,
    comparisonPrice: 76_313.94,
  };
  const consolidated = consolidateProductVariants([display, bulto]);

  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0]?.comparisonPrice, 264.98);
  assert.equal(consolidated[0]?.price, 76_313.94);
  assert.equal(consolidated[0]?.packageQuantity, 288);
  assert.equal(consolidated[0]?.alternatePrices?.length, 3);
  assert.match(
    consolidated[0]?.packageLabel ?? "",
    /16 displays.*288 unidades/,
  );
});

test("normaliza displays Tokin sin bulto usando otros sabores del mismo formato", () => {
  const firstDisplay = createProduct(
    "aguiar-arcor-resistencia",
    "Aguiar Resistencia",
    "mayorista",
    4_769.63,
  );
  firstDisplay.brand = "Arcor";
  firstDisplay.category = "Jugos en polvo";
  firstDisplay.rawName = "Jugo en Polvo Arcor Durazno 15gr.";
  firstDisplay.normalizedName = "jugo en polvo arcor durazno 15 gr";
  const firstBulto = {
    ...firstDisplay,
    sku: "first-bulto",
    price: 57_235.48,
    comparisonPrice: 57_235.48,
  };
  const secondDisplay = {
    ...firstDisplay,
    sku: "second-display",
    rawName: "Jugo en Polvo Arcor Anana 15gr.",
    normalizedName: "jugo en polvo arcor anana 15 gr",
  };
  const standaloneDisplay = {
    ...firstDisplay,
    sku: "standalone-display",
    rawName: "Jugo en Polvo Arcor Limonada 15gr.",
    normalizedName: "jugo en polvo arcor limonada 15 gr",
  };
  const consolidated = consolidateProductVariants([
    firstDisplay,
    firstBulto,
    secondDisplay,
    standaloneDisplay,
  ]);
  const normalizedStandalone = consolidated.find(
    (product) => product.sku === "standalone-display",
  );

  assert.equal(normalizedStandalone?.comparisonPrice, 264.98);
  assert.equal(normalizedStandalone?.packageQuantity, 18);
  assert.equal(normalizedStandalone?.alternatePrices?.length, 2);
});

test("normaliza displays comerciales de golosinas antes de comparar", () => {
  const cases = [
    {
      rawName: "Turrón de maní Arcor 25gr.",
      displayPrice: 11_040.57,
      bultoPrice: 44_162.29,
      expectedUnitPrice: 220.81,
      expectedUnits: 200,
    },
    {
      rawName: "Bombón Bon o Bon blanco 15gr.",
      displayPrice: 11_669.01,
      bultoPrice: 140_028.06,
      expectedUnitPrice: 388.97,
      expectedUnits: 360,
    },
    {
      rawName: "Gomitas Mogul Ositos x 30gr",
      displayPrice: 5_366.91,
      bultoPrice: 64_402.89,
      expectedUnitPrice: 447.24,
      expectedUnits: 144,
    },
  ];

  for (const item of cases) {
    const display = createProduct(
      "aguiar-arcor-resistencia",
      "Aguiar Resistencia",
      "mayorista",
      item.displayPrice,
    );
    display.category = "Golosinas";
    display.rawName = item.rawName;
    display.normalizedName = item.rawName.toLowerCase();
    const bulto = {
      ...display,
      sku: `${item.rawName}-bulto`,
      price: item.bultoPrice,
      comparisonPrice: item.bultoPrice,
    };
    const [normalized] = consolidateProductVariants([display, bulto]);

    assert.equal(normalized?.comparisonPrice, item.expectedUnitPrice);
    assert.equal(normalized?.packageQuantity, item.expectedUnits);
  }
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
