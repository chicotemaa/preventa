import assert from "node:assert/strict";
import test from "node:test";
import { productBelongsToCategory } from "./catalog.js";
import { consolidateTokinPriceModes } from "./tokin.js";
import type { ProductSearchResult } from "./types.js";

test("excluye premezclas para tapas de la categoria Alfajores", () => {
  const category = {
    name: "Alfajores",
    searchTerms: ["alfajor"],
    aliases: ["alfajor", "alfajores"],
  };

  assert.equal(
    productBelongsToCategory(
      category,
      createProduct("Premezcla para tapas de alfajores Maizena 400 gr", 1_900),
    ),
    false,
  );
  assert.equal(
    productBelongsToCategory(category, createProduct("Alfajor Cofler Block 40,7gr.", 673.91)),
    true,
  );
});

test("Tokin consolida variantes de unidad y bulto del mismo articulo", () => {
  const unit = createProduct("Alfajor Cofler Block 40,7gr.", 673.91);
  const pack = { ...unit, sku: "pack", price: 24_260.57, comparisonPrice: 24_260.57 };
  const products = consolidateTokinPriceModes([unit, pack]);

  assert.equal(products.length, 1);
  assert.equal(products[0]?.comparisonPrice, 673.91);
  assert.equal(products[0]?.price, 24_260.57);
  assert.equal(products[0]?.packageQuantity, 36);
});

test("Tokin no compara un display de jugo en polvo como si fuera una unidad", () => {
  const display = createProduct("Jugo en polvo BC limonada 7gr.", 4_769.63);
  display.brand = "BC";
  display.category = "Jugos en polvo";
  const bulto = {
    ...display,
    sku: "bulto",
    price: 76_313.94,
    comparisonPrice: 76_313.94,
  };
  const products = consolidateTokinPriceModes([display, bulto]);

  assert.equal(products.length, 1);
  assert.equal(products[0]?.comparisonPrice, 264.98);
  assert.equal(products[0]?.price, 76_313.94);
  assert.equal(products[0]?.packageQuantity, 288);
  assert.equal(products[0]?.alternatePrices?.length, 3);
  assert.match(products[0]?.packageLabel ?? "", /16 displays.*288 unidades/);
});

test("Tokin normaliza un display suelto usando el precio repetido del formato", () => {
  const firstDisplay = createProduct("Jugo en Polvo Arcor Durazno 15gr.", 4_769.63);
  firstDisplay.brand = "Arcor";
  firstDisplay.category = "Jugos en polvo";
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
  const products = consolidateTokinPriceModes([
    firstDisplay,
    firstBulto,
    secondDisplay,
    standaloneDisplay,
  ]);
  const normalizedStandalone = products.find(
    (product) => product.sku === "standalone-display",
  );

  assert.equal(normalizedStandalone?.comparisonPrice, 264.98);
  assert.equal(normalizedStandalone?.packageQuantity, 18);
  assert.equal(normalizedStandalone?.alternatePrices?.length, 2);
});

test("Tokin normaliza displays comerciales de golosinas antes de comparar", () => {
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
    const display = createProduct(item.rawName, item.displayPrice);
    display.category = "Golosinas";
    const bulto = {
      ...display,
      sku: `${item.rawName}-bulto`,
      price: item.bultoPrice,
      comparisonPrice: item.bultoPrice,
    };
    const [normalized] = consolidateTokinPriceModes([display, bulto]);

    assert.equal(normalized?.comparisonPrice, item.expectedUnitPrice);
    assert.equal(normalized?.packageQuantity, item.expectedUnits);
  }
});

function createProduct(rawName: string, price: number): ProductSearchResult {
  return {
    sourceId: "aguiar-arcor-resistencia",
    storeName: "Aguiar Resistencia",
    storeType: "mayorista",
    sku: "unit",
    barcodes: [],
    brand: "Cofler",
    category: "Alfajores",
    rawName,
    normalizedName: rawName.toLowerCase(),
    price,
    comparisonPrice: price,
    currency: "ARS",
    productUrl: null,
    imageUrl: "https://example.com/product.jpg",
    confidenceScore: 100,
  };
}
