import assert from "node:assert/strict";
import test from "node:test";
import { confirmedCostConditions } from "./test-fixtures/cost-conditions";
import {
  analyzePriceListCommercial,
  calculateGrossMarginRatio,
  calculateMinimumPriceForMargin,
  isReliableSourcePrice,
} from "./price-list-commercial";
import type {
  PriceListItemResult,
  PriceListSourcePrice,
} from "@/types/search";

test("calcula recargo, margen bruto y piso de precio sin confundir formulas", () => {
  const analysis = analyzePriceListCommercial(
    createResult({ excelPrice: 1_250, tokinPrice: 1_000 }),
  );

  assert.equal(analysis.markupRatio, 0.25);
  assert.equal(analysis.grossMarginRatio, 0.2);
  assert.equal(analysis.grossProfitAmount, 250);
  assert.equal(analysis.minimumPriceForTargetMargin, 1_250);
  assert.equal(calculateGrossMarginRatio(1_250, 1_000), 0.2);
  assert.equal(calculateMinimumPriceForMargin(1_000, 0.2), 1_250);
});

test("calcula totales de bulto desde UxB sin cambiar la base unitaria", () => {
  const result = createResult({ excelPrice: 1_250, tokinPrice: 1_000 });
  result.input.uxb = "40 Uds";
  const analysis = analyzePriceListCommercial(result);

  assert.equal(analysis.unitsPerPackage, 40);
  assert.equal(analysis.excelSalePrice, 1_250);
  assert.equal(analysis.excelPackagePrice, 50_000);
  assert.equal(analysis.supplierPackageCost, 40_000);
});

test("calcula mejor y promedio mayorista solo con matches confiables", () => {
  const result = createResult({
    excelPrice: 1_200,
    tokinPrice: 900,
    sourcePrices: [
      createSource("maxi", "Maxiconsumo", "mayorista", 1_000, 90),
      createSource("yaguar", "Yaguar", "mayorista", 1_100, 85),
      createSource("weak", "Match dudoso", "mayorista", 500, 45),
      createSource("vea", "Vea", "minorista", 950, 90),
    ],
  });
  const analysis = analyzePriceListCommercial(result);

  assert.equal(analysis.bestWholesalePrice, 1_000);
  assert.equal(analysis.averageWholesalePrice, 1_050);
  assert.equal(analysis.bestRetailPrice, 950);
  assert.equal(analysis.differenceVsBestWholesale, 200);
  assert.equal(analysis.gapVsBestWholesaleRatio, 0.2);
});

test("no calcula margen cuando Tokin fue rechazado por presentacion", () => {
  const result = createResult({ excelPrice: 1_200, tokinPrice: null });
  result.diagnostics = {
    expectedBrand: null,
    queriesTried: [],
    matchedQuery: null,
    queryDiagnostics: [],
    aguiarPriceNormalization: {
      status: "rejected",
      originalPrice: 12_000,
      productName: "Caja no comparable",
      reason: "La presentación no coincide.",
    },
  };
  const analysis = analyzePriceListCommercial(result);

  assert.equal(analysis.supplierCostStatus, "rejected");
  assert.equal(analysis.supplierCostComparable, false);
  assert.equal(analysis.grossMarginRatio, null);
  assert.equal(analysis.minimumPriceForTargetMargin, null);
});

test("excluye confianza desconocida o invalida de los precios y promedios", () => {
  for (const confidenceScore of [0, -1, 69, NaN, Infinity, 101, undefined, null]) {
    const source = {
      ...createSource("unknown", "Sin validar", "mayorista", 100, 90),
      confidenceScore,
    } as PriceListSourcePrice;
    const result = createResult({
      excelPrice: 1_200,
      tokinPrice: null,
      sourcePrices: [
        source,
        { ...source, storeType: "minorista" },
        createSource("maxi", "Maxiconsumo", "mayorista", 1_000, 70),
      ],
    });
    const analysis = analyzePriceListCommercial(result);

    assert.equal(isReliableSourcePrice(source), false, String(confidenceScore));
    assert.equal(analysis.bestWholesale?.sourceId, "maxi");
    assert.equal(analysis.averageWholesalePrice, 1_000);
    assert.equal(analysis.bestRetail, null);
    assert.equal(analysis.gapVsBestWholesaleRatio, 0.2);
  }
});

test("no usa precios no finitos o no positivos como referencia confiable", () => {
  for (const price of [0, -1, NaN, Infinity]) {
    assert.equal(
      isReliableSourcePrice(createSource("maxi", "Maxiconsumo", "mayorista", price, 90)),
      false,
      String(price),
    );
  }
});

test("Tokin comparable sin condiciones solo permite diferencia publicada, no margen ni piso", () => {
  const result = createResult({ excelPrice: 1500, tokinPrice: 1000 });
  delete result.costConditions;
  const a = analyzePriceListCommercial(result);
  assert.equal(a.listPriceMarkupRatio, 0.5);
  assert.equal(a.economicsConfirmed, false);
  assert.equal(a.effectiveUnitCost, null);
  assert.equal(a.grossProfitAmount, null);
  assert.equal(a.markupRatio, null);
  assert.equal(a.grossMarginRatio, null);
  assert.equal(a.minimumPriceForTargetMargin, null);
});

function createResult({
  excelPrice,
  tokinPrice,
  sourcePrices = [],
}: {
  excelPrice: number;
  tokinPrice: number | null;
  sourcePrices?: PriceListSourcePrice[];
}): PriceListItemResult {
  return {
    input: {
      rowNumber: 1,
      description: "Producto de prueba",
      currentPrice: excelPrice,
      uxb: "40",
    },
    costConditions: confirmedCostConditions,
    ownPrice: {
      excelPrice,
      tokinPrice,
      tokinObservedAt: new Date().toISOString(),
      selectedPrice: excelPrice,
      selectedSource: "excel",
      excelVsTokinGapRatio:
        tokinPrice === null ? null : (excelPrice - tokinPrice) / tokinPrice,
    },
    queryUsed: "producto",
    status: "matched",
    bestPrice: sourcePrices[0]?.price ?? null,
    bestSource: sourcePrices[0] ?? null,
    sourcePrices,
    matchedCount: sourcePrices.length,
  };
}

function createSource(
  sourceId: string,
  storeName: string,
  storeType: PriceListSourcePrice["storeType"],
  price: number,
  confidenceScore: number,
): PriceListSourcePrice {
  return {
    observedAt: new Date().toISOString(),
    sourceId,
    storeName,
    storeType,
    price,
    comparisonPrice: price,
    currency: "ARS",
    productName: `${storeName} producto`,
    productUrl: null,
    confidenceScore,
  };
}
