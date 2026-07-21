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
