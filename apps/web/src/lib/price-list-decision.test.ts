import assert from "node:assert/strict";
import test from "node:test";
import { confirmedCostConditions } from "./test-fixtures/cost-conditions";
import {
  analyzePriceListDecision,
  getOwnPriceSourceLabel,
  getBestPriceListSourceByType,
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

test("usa Excel como precio propio y conserva Tokin por separado", () => {
  const ownPrice: PriceListOwnPrice = {
    excelPrice: 1_100,
    tokinPrice: 1_000,
    selectedPrice: 1_100,
    selectedSource: "excel",
    excelVsTokinGapRatio: 0.1,
  };
  const result = createResult({ ownPrice, currentPrice: 1_100 });

  assert.equal(getPriceListOwnPrice(result), 1_100);
  assert.equal(getOwnPriceSourceLabel(result), "Excel");
  assert.equal(result.ownPrice?.tokinPrice, 1_000);
});

test("no usa Tokin como precio comercial cuando falta Excel", () => {
  const result = createResult({
    ownPrice: {
      excelPrice: null,
      tokinPrice: 1_000,
      selectedPrice: 1_000,
      selectedSource: "tokin",
      selectionReason: "tokin_fallback",
      excelVsTokinGapRatio: null,
    },
    sourcePrices: [
      createSourcePrice({
        sourceId: "maxiconsumo-chaco-auth",
        storeName: "Maxiconsumo Chaco",
        storeType: "mayorista",
        price: 1_100,
      }),
    ],
  });

  assert.equal(getPriceListOwnPrice(result), null);
  assert.equal(getOwnPriceSourceLabel(result), "Sin precio Excel");
  assert.equal(analyzePriceListDecision(result).kind, "missing_own_price");
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
  assert.equal(decision.kind, "cost_unverified");
  assert.equal(decision.gapRatio, 0.2);
  assert.equal(decision.action, "Completar condiciones de costo");
});

test("no recomienda bajar cuando el costo no permite competir con el mayorista", () => {
  const result = createResult({
    ownPrice: {
      excelPrice: 1_200,
      tokinPrice: 1_100,
      selectedPrice: 1_200,
      selectedSource: "excel",
      excelVsTokinGapRatio: 1_200 / 1_100 - 1,
    },
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
  assert.equal(decision.kind, "cost_pressure");
  assert.equal(decision.action, "Negociar costo / revisar match");
});

test("marca venta debajo del costo proveedor aunque falte mercado", () => {
  const result = createResult({
    ownPrice: {
      excelPrice: 900,
      tokinPrice: 1_000,
      selectedPrice: 900,
      selectedSource: "excel",
      excelVsTokinGapRatio: -0.1,
    },
  });

  const decision = analyzePriceListDecision(result);
  assert.equal(decision.kind, "below_supplier_cost");
  assert.equal(decision.commercial.grossMarginRatio, -1 / 9);
});

test("precio destacado, recomendacion y exportacion eligen el mismo mayorista confiable", () => {
  const weak = createSourcePrice({
    sourceId: "weak", storeName: "Dudoso", storeType: "mayorista",
    price: 500, confidenceScore: 45,
  });
  const reliable = createSourcePrice({
    sourceId: "maxi", storeName: "Maxiconsumo", storeType: "mayorista", price: 1_000,
  });
  const retail = createSourcePrice({
    sourceId: "vea", storeName: "Vea", storeType: "minorista", price: 800,
  });
  const result = createResult({ currentPrice: 1_000, sourcePrices: [weak, retail, reliable] });
  const originalSources = [...result.sourcePrices];
  const sorted = sortPriceListResultPrices(result);

  for (const candidate of [result, sorted]) {
    const decision = analyzePriceListDecision(candidate);
    assert.equal(decision.referenceSource, reliable);
    assert.equal(decision.referenceSource, decision.commercial.bestWholesale);
    assert.equal(decision.referencePrice, decision.commercial.bestWholesalePrice);
    assert.equal(decision.gapRatio, decision.commercial.gapVsBestWholesaleRatio);
    assert.equal(decision.kind, "cost_unverified");
    assert.equal(getBestPriceListSourceByType(candidate, "mayorista"), reliable);
  }
  assert.equal(sorted.bestSource, reliable);
  assert.equal(sorted.bestPrice, 1_000);
  assert.deepEqual(sorted.sourcePrices, [reliable, weak, retail]);
  assert.deepEqual(result.sourcePrices, originalSources);
});

test("confianza desconocida queda para revision sin precio ganador ni gap", () => {
  for (const confidenceScore of [0, -1, 69, NaN, Infinity, undefined, null]) {
    const source = {
      ...createSourcePrice({
        sourceId: "maxi", storeName: "Maxiconsumo", storeType: "mayorista", price: 500,
      }),
      confidenceScore,
    } as PriceListSourcePrice;
    const result = createResult({ currentPrice: 1_000, sourcePrices: [source] });
    const sorted = sortPriceListResultPrices(result);
    const decision = analyzePriceListDecision(sorted);

    assert.equal(decision.kind, "weak_match", String(confidenceScore));
    assert.equal(decision.action, "Revisar equivalencia");
    assert.equal(decision.referenceSource, null);
    assert.equal(decision.referencePrice, null);
    assert.equal(decision.gapRatio, null);
    assert.equal(decision.hasWholesaleReference, false);
    assert.equal(decision.commercial.bestWholesale, null);
    assert.equal(sorted.bestSource, null);
    assert.equal(sorted.bestPrice, null);
    assert.deepEqual(sorted.sourcePrices, [source]);
  }
});

test("un mayorista dudoso no habilita recomendaciones fuertes con solo minoristas confiables", () => {
  const wholesale = createSourcePrice({
    sourceId: "maxi", storeName: "Maxiconsumo", storeType: "mayorista",
    price: 500, confidenceScore: 0,
  });
  const retail = createSourcePrice({
    sourceId: "vea", storeName: "Vea", storeType: "minorista", price: 900,
  });
  const sorted = sortPriceListResultPrices(
    createResult({ currentPrice: 1_300, sourcePrices: [wholesale, retail] }),
  );
  const decision = analyzePriceListDecision(sorted);

  assert.equal(decision.kind, "retail_only");
  assert.equal(decision.hasWholesaleReference, false);
  assert.equal(decision.referenceSource, retail);
  assert.equal(sorted.bestSource, retail);
  assert.equal(decision.commercial.bestWholesale, null);
  assert.deepEqual(sorted.sourcePrices, [wholesale, retail]);
});

test("usa unidad equivalente y desempata por prioridad comercial en todas las salidas", () => {
  const chaco = {
    ...createSourcePrice({
      sourceId: "maxiconsumo-chaco-auth", storeName: "Maxiconsumo Chaco",
      storeType: "mayorista", price: 40_000, confidenceScore: 70,
    }),
    comparisonPrice: 1_000,
    packageQuantity: 40,
  };
  const web = createSourcePrice({
    sourceId: "maxiconsumo-web-moreno", storeName: "Maxiconsumo Web",
    storeType: "mayorista", price: 1_000,
  });
  for (const sourcePrices of [[web, chaco], [chaco, web]]) {
    const sorted = sortPriceListResultPrices(createResult({ currentPrice: 1_200, sourcePrices }));
    const decision = analyzePriceListDecision(sorted);

    assert.equal(sorted.bestSource, chaco);
    assert.equal(sorted.bestPrice, 1_000);
    assert.equal(decision.referenceSource, chaco);
    assert.equal(decision.commercial.bestWholesale, chaco);
    assert.equal(decision.gapRatio, 0.2);
    assert.equal(decision.commercial.gapVsBestWholesaleRatio, 0.2);
  }
});

test("no reutiliza un bestSource previo cuando no hay candidatos confiables", () => {
  const result = createResult({ currentPrice: 1_200 });
  result.bestSource = createSourcePrice({
    sourceId: "old", storeName: "Referencia anterior", storeType: "mayorista", price: 500,
  });
  result.bestPrice = 500;
  const decision = analyzePriceListDecision(result);

  assert.equal(decision.kind, "no_reference");
  assert.equal(decision.referenceSource, null);
  assert.equal(decision.gapRatio, null);
});

test("si falta Excel conserva la accion de cargar precio aun con matches dudosos", () => {
  const result = createResult({ sourcePrices: [createSourcePrice({
    sourceId: "maxi", storeName: "Maxiconsumo", storeType: "mayorista",
    price: 500, confidenceScore: 0,
  })] });
  assert.equal(analyzePriceListDecision(result).kind, "missing_own_price");
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
    ownPrice: ownPrice ? { tokinObservedAt: new Date().toISOString(), ...ownPrice } : undefined,
    costConditions: confirmedCostConditions,
    queryUsed: "producto de prueba",
    status: sourcePrices.length > 0 || currentPrice ? "matched" : "not_found",
    bestPrice: sourcePrices[0]?.price ?? null,
    bestSource: sourcePrices[0] ?? null,
    sourcePrices,
    matchedCount: sourcePrices.length,
  };
}

test("un mayorista barato antiguo no gana contra una referencia vigente", () => {
  const stale = { ...createSourcePrice({ sourceId: "old", storeName: "Viejo", storeType: "mayorista", price: 100 }), observedAt: "2020-01-01T00:00:00Z" };
  const fresh = createSourcePrice({ sourceId: "fresh", storeName: "Vigente", storeType: "mayorista", price: 1000 });
  const result = createResult({ currentPrice: 1000, sourcePrices: [stale, fresh] });
  const decision = analyzePriceListDecision(result);
  assert.equal(decision.referenceSource, fresh);
  assert.equal(decision.gapRatio, 0);
  assert.equal(decision.kind, "cost_unverified");
  assert.equal(sortPriceListResultPrices(result).bestSource, fresh);
});

test("precio antiguo o sin fecha se conserva sin recomendar una baja", () => {
  for (const observedAt of [undefined, "2020-01-01T00:00:00Z"]) {
    const source = { ...createSourcePrice({ sourceId: "maxi", storeName: "Maxi", storeType: "mayorista", price: 100 }), observedAt };
    const result = createResult({ currentPrice: 1000, sourcePrices: [source] });
    const decision = analyzePriceListDecision(result);
    assert.equal(decision.kind, "outdated_reference");
    assert.equal(decision.referencePrice, null);
    assert.equal(decision.gapRatio, null);
    assert.equal(sortPriceListResultPrices(result).sourcePrices.length, 1);
    assert.equal(sortPriceListResultPrices(result).bestSource, null);
  }
});

test("costo Tokin antiguo bloquea margen y consejo de precio aun con mercado vigente", () => {
  const result = createResult({ currentPrice: 1200, ownPrice: {
    excelPrice: 1200, tokinPrice: 100, tokinObservedAt: "2020-01-01T00:00:00Z",
    selectedPrice: 1200, selectedSource: "excel", excelVsTokinGapRatio: 11,
  }, sourcePrices: [createSourcePrice({ sourceId: "maxi", storeName: "Maxi", storeType: "mayorista", price: 1000 })] });
  const decision = analyzePriceListDecision(result);
  assert.equal(decision.kind, "outdated_reference");
  assert.equal(decision.commercial.supplierCost, 100);
  assert.equal(decision.commercial.grossMarginRatio, null);
  assert.equal(decision.commercial.minimumPriceForTargetMargin, null);
});

test("costos adicionales cambian la decision y sin confirmacion no hay consejo firme", () => {
  const result = createResult({ ownPrice: {
    excelPrice: 1200, tokinPrice: 800, selectedPrice: 1200, selectedSource: "excel", excelVsTokinGapRatio: 0.5,
  }, sourcePrices: [createSourcePrice({ sourceId: "maxi", storeName: "Maxi", storeType: "mayorista", price: 1000 })] });
  assert.equal(analyzePriceListDecision(result).kind, "above_wholesale_critical");
  result.costConditions = { ...confirmedCostConditions, freightPerUnit: 300 };
  assert.equal(analyzePriceListDecision(result).kind, "cost_pressure");
  assert.equal(analyzePriceListDecision(result).commercial.effectiveUnitCost, 1100);
  delete result.costConditions;
  const decision = analyzePriceListDecision(result);
  assert.equal(decision.kind, "cost_unverified");
  assert.equal(decision.referencePrice, 1000);
  assert.equal(decision.commercial.grossMarginRatio, null);
});

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
    observedAt: new Date().toISOString(),
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
