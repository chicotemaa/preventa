import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzePriceListDecision,
  getOwnPriceSourceLabel,
  getPriceListOwnPrice,
  sortPriceListResultPrices,
} from "./price-list-decision";
import type {
  PriceListItemResult,
  PriceListOwnPrice,
  PriceListSourcePrice,
} from "@/types/search";

test("prioriza un mayorista aunque el minorista tenga menor precio", () => {
  const minorista = createSourcePrice({
    sourceId: "vea-argentina-vtex",
    storeName: "Vea",
    storeType: "minorista",
    price: 900,
  });
  const mayorista = createSourcePrice({
    sourceId: "maxiconsumo-chaco-auth",
    storeName: "Maxiconsumo Chaco",
    storeType: "mayorista",
    price: 1_000,
  });

  const sorted = sortPriceListResultPrices(
    createResult({ sourcePrices: [minorista, mayorista] }),
  );

  assert.equal(sorted.bestSource?.sourceId, "maxiconsumo-chaco-auth");
  assert.deepEqual(
    sorted.sourcePrices.map((source) => source.storeType),
    ["mayorista", "minorista"],
  );
});

test("usa Tokin como precio propio y conserva el precio del Excel", () => {
  const ownPrice: PriceListOwnPrice = {
    excelPrice: 1_100,
    tokinPrice: 1_000,
    selectedPrice: 1_000,
    selectedSource: "tokin",
    excelVsTokinGapRatio: 0.1,
  };
  const result = createResult({ ownPrice, currentPrice: 1_000 });

  assert.equal(getPriceListOwnPrice(result), 1_000);
  assert.equal(getOwnPriceSourceLabel(result), "Tokin/Arcor");
  assert.equal(result.ownPrice?.excelPrice, 1_100);
});

test("bloquea una recomendacion fuerte cuando el match es debil", () => {
  const result = createResult({
    currentPrice: 1_300,
    sourcePrices: [
      createSourcePrice({
        sourceId: "maxiconsumo-chaco-auth",
        storeName: "Maxiconsumo Chaco",
        storeType: "mayorista",
        price: 1_000,
        confidenceScore: 65,
      }),
    ],
  });

  assert.equal(analyzePriceListDecision(result).kind, "weak_match");
});

test("no recomienda bajar si solo existe referencia minorista", () => {
  const result = createResult({
    currentPrice: 1_300,
    sourcePrices: [
      createSourcePrice({
        sourceId: "vea-argentina-vtex",
        storeName: "Vea",
        storeType: "minorista",
        price: 1_000,
      }),
    ],
  });

  const decision = analyzePriceListDecision(result);
  assert.equal(decision.kind, "retail_only");
  assert.equal(decision.action, "Validar con mayoristas");
});

test("marca una brecha mayorista superior al diez por ciento", () => {
  const result = createResult({
    currentPrice: 1_200,
    sourcePrices: [
      createSourcePrice({
        sourceId: "maxiconsumo-chaco-auth",
        storeName: "Maxiconsumo Chaco",
        storeType: "mayorista",
        price: 1_000,
      }),
    ],
  });

  const decision = analyzePriceListDecision(result);
  assert.equal(decision.kind, "above_wholesale_critical");
  assert.equal(decision.action, "Revisar baja o promo");
});

function createResult({
  currentPrice = null,
  ownPrice,
  sourcePrices = [],
}: {
  currentPrice?: number | null;
  ownPrice?: PriceListOwnPrice;
  sourcePrices?: PriceListSourcePrice[];
} = {}): PriceListItemResult {
  return {
    input: {
      rowNumber: 1,
      description: "Producto de prueba",
      currentPrice: currentPrice ?? undefined,
    },
    ownPrice,
    queryUsed: "producto de prueba",
    status: sourcePrices.length > 0 || currentPrice ? "matched" : "not_found",
    bestPrice: sourcePrices[0]?.price ?? null,
    bestSource: sourcePrices[0] ?? null,
    sourcePrices,
    matchedCount: sourcePrices.length,
  };
}

function createSourcePrice({
  sourceId,
  storeName,
  storeType,
  price,
  confidenceScore = 90,
}: {
  sourceId: string;
  storeName: string;
  storeType: PriceListSourcePrice["storeType"];
  price: number;
  confidenceScore?: number;
}): PriceListSourcePrice {
  return {
    sourceId,
    storeName,
    storeType,
    price,
    comparisonPrice: price,
    currency: "ARS",
    productName: `${storeName} producto de prueba`,
    productUrl: null,
    confidenceScore,
  };
}
