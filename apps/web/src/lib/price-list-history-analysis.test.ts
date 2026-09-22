import assert from "node:assert/strict";
import test from "node:test";
import { confirmedCostConditions } from "./test-fixtures/cost-conditions";
import {
  analyzeHistoryItem,
  filterHistoryAnalyses,
  summarizeHistoryItems,
} from "./price-list-history-analysis";
import type { PriceListRunItem, PriceListSourcePrice } from "@/types/search";

test("historial compara el Excel y conserva Tokin como referencia separada", () => {
  const analysis = analyzeHistoryItem(
    createItem({
      excelPrice: 1_200,
      tokinPrice: 1_050,
      selectedPrice: 1_200,
      selectedSource: "excel",
      sources: [createSource("maxiconsumo", "Maxiconsumo Chaco", "mayorista", 1_000)],
    }),
  );

  assert.equal(analysis.excelPrice, 1_200);
  assert.equal(analysis.tokinPrice, 1_050);
  assert.equal(analysis.selectedOwnPrice, 1_200);
  assert.equal(analysis.selectedOwnPriceLabel, "Excel");
  assert.equal(analysis.kind, "cost_pressure");
  assert.equal(analysis.action, "Negociar costo / revisar match");
});

test("prioriza mayorista aunque el minorista tenga un precio menor", () => {
  const analysis = analyzeHistoryItem(
    createItem({
      excelPrice: 1_000,
      tokinPrice: 500,
      selectedPrice: 1_000,
      selectedSource: "excel",
      sources: [
        createSource("vea", "Vea", "minorista", 800),
        createSource("maxi", "Maxiconsumo Chaco", "mayorista", 950),
      ],
    }),
  );

  assert.equal(analysis.bestWholesale?.storeName, "Maxiconsumo Chaco");
  assert.equal(analysis.referenceSource?.storeName, "Maxiconsumo Chaco");
  assert.equal(analysis.kind, "above_wholesale_warning");
});

test("una referencia Tokin antigua no reemplaza un Excel faltante", () => {
  const analysis = analyzeHistoryItem(
    createItem({
      tokinPrice: 1_050,
      selectedPrice: 1_050,
      selectedSource: "tokin",
      sources: [createSource("maxi", "Maxiconsumo Chaco", "mayorista", 1_000)],
    }),
  );

  assert.equal(analysis.tokinPrice, 1_050);
  assert.equal(analysis.selectedOwnPrice, null);
  assert.equal(analysis.kind, "missing_own_price");
});

test("semaforo separa alertas y oportunidades", () => {
  const alert = analyzeHistoryItem(
    createItem({
      excelPrice: 1_300,
      tokinPrice: 500,
      selectedPrice: 1_300,
      selectedSource: "excel",
      sources: [createSource("maxi", "Maxiconsumo Chaco", "mayorista", 1_000)],
    }),
  );
  const opportunity = analyzeHistoryItem(
    createItem({
      excelPrice: 800,
      tokinPrice: 500,
      selectedPrice: 800,
      selectedSource: "excel",
      sources: [createSource("maxi", "Maxiconsumo Chaco", "mayorista", 1_000)],
    }),
  );
  const analyses = [alert, opportunity];
  const summary = summarizeHistoryItems(analyses);

  assert.equal(summary.attention, 1);
  assert.equal(summary.opportunities, 1);
  assert.deepEqual(filterHistoryAnalyses(analyses, "attention"), [alert]);
  assert.deepEqual(filterHistoryAnalyses(analyses, "opportunity"), [opportunity]);
});

test("una carga anterior informa que el precio Excel no fue guardado", () => {
  const item = createItem({
    selectedPrice: 1_000,
    selectedSource: "excel",
    sources: [createSource("maxi", "Maxiconsumo Chaco", "mayorista", 950)],
  });
  item.currentPrice = null;
  item.ownPrice = null;
  item.ownPriceSnapshotStatus = "not_stored_legacy";

  const analysis = analyzeHistoryItem(item);

  assert.equal(analysis.ownPriceWasStored, false);
  assert.equal(analysis.selectedOwnPriceLabel, "No guardado en esta carga");
  assert.equal(analysis.label, "Precio Excel no guardado");
  assert.equal(analysis.action, "Generar una nueva carga");
});

test("historial y revisiones usan el mismo mayorista confiable para precio, gap y accion", () => {
  const reliable = createSource("maxi", "Maxiconsumo Chaco", "mayorista", 1_000);
  const weak = {
    ...createSource("weak", "Dudoso", "mayorista", 500),
    confidenceScore: 0,
  };
  const analysis = analyzeHistoryItem(createItem({
    excelPrice: 1_000,
    tokinPrice: 500,
    selectedPrice: 1_000,
    selectedSource: "excel",
    sources: [weak, reliable],
  }));

  assert.equal(analysis.kind, "competitive");
  assert.equal(analysis.bestWholesale, reliable);
  assert.equal(analysis.referenceSource, analysis.bestWholesale);
  assert.equal(analysis.referencePrice, analysis.commercial.bestWholesalePrice);
  assert.equal(analysis.gapRatio, analysis.commercial.gapVsBestWholesaleRatio);
  assert.equal(analysis.gapRatio, 0);
});

test("historial sin confianza no declara oportunidad ni precio mayorista comparable", () => {
  const source = {
    ...createSource("maxi", "Maxiconsumo", "mayorista", 1_000),
    confidenceScore: 0,
  };
  const analysis = analyzeHistoryItem(createItem({
    excelPrice: 800,
    selectedPrice: 800,
    selectedSource: "excel",
    sources: [source],
  }));
  const summary = summarizeHistoryItems([analysis]);

  assert.equal(analysis.kind, "weak_match");
  assert.equal(analysis.bestWholesale, null);
  assert.equal(analysis.referenceSource, null);
  assert.equal(analysis.gapRatio, null);
  assert.equal(summary.opportunities, 0);
  assert.equal(summary.attention, 1);
  assert.equal(summary.withoutWholesale, 1);
});

function createItem({
  excelPrice = null,
  tokinPrice = null,
  selectedPrice,
  selectedSource,
  sources,
}: {
  excelPrice?: number | null;
  tokinPrice?: number | null;
  selectedPrice: number;
  selectedSource: "excel" | "tokin";
  sources: PriceListSourcePrice[];
}): PriceListRunItem {
  return {
    id: `item-${selectedPrice}`,
    costConditions: confirmedCostConditions,
    rowNumber: 1,
    business: "Alimentos",
    rubro: "Golosinas",
    segment: "Alfajores",
    subrubro: "Alfajores triples",
    line: null,
    uxb: "24",
    description: "Alfajor de prueba",
    code: "1001",
    ean13Di: "7790000000001",
    ean13Bu: null,
    currentPrice: selectedPrice,
    ownPrice: {
      excelPrice,
      tokinPrice,
      tokinObservedAt: new Date().toISOString(),
      selectedPrice,
      selectedSource,
      excelVsTokinGapRatio:
        excelPrice && tokinPrice ? (excelPrice - tokinPrice) / tokinPrice : null,
    },
    currentCost: null,
    matchStatus: "matched",
    bestPrice: null,
    bestSourceName: null,
    bestSourceType: null,
    bestProductName: null,
    bestProductUrl: null,
    bestConfidenceScore: null,
    marginPercent: null,
    gapPercent: null,
    suggestedPrice: null,
    decisionStatus: "",
    decisionLabel: "",
    matchedCount: sources.length,
    sourcePrices: sources,
  };
}

function createSource(
  sourceId: string,
  storeName: string,
  storeType: PriceListSourcePrice["storeType"],
  price: number,
): PriceListSourcePrice {
  return {
    observedAt: new Date().toISOString(),
    sourceId,
    storeName,
    storeType,
    price,
    comparisonPrice: price,
    currency: "ARS",
    productName: `${storeName} alfajor comparable`,
    productUrl: null,
    confidenceScore: 90,
  };
}
