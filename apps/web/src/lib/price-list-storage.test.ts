import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStoredPriceListDetail,
  serializeStoredPriceListDetail,
} from "./price-list-storage";
import type { PriceListSourcePrice } from "@/types/search";

test("conserva Excel, Tokin y clasificacion en el historial nuevo", () => {
  const sourcePrice = createSourcePrice();
  const serialized = serializeStoredPriceListDetail({
    sourcePrices: [sourcePrice],
    ownPrice: {
      excelPrice: 1_100,
      tokinPrice: 1_000,
      selectedPrice: 1_100,
      selectedSource: "excel",
      excelVsTokinGapRatio: 0.1,
    },
    input: {
      rowNumber: 4,
      business: "Alimentos",
      rubro: "Golosinas",
      segment: "Alfajores",
      subrubro: "Alfajores triples",
      line: "Chocolate",
      uxb: "24",
    },
    diagnostics: {
      expectedBrand: "Arcor",
      queriesTried: ["alfajor arcor"],
      matchedQuery: null,
      queryDiagnostics: [
        {
          query: "alfajor arcor",
          candidatesCount: 1,
          matchesCount: 0,
          rejectedCount: 1,
          topRejected: [],
        },
      ],
    },
  });
  const parsed = parseStoredPriceListDetail(serialized);

  assert.equal(parsed.isLegacy, false);
  assert.equal(parsed.ownPrice?.selectedSource, "excel");
  assert.equal(parsed.ownPrice?.selectionReason, "excel_priority");
  assert.equal(parsed.ownPrice?.tokinPrice, 1_000);
  assert.equal(parsed.dimensions.subrubro, "Alfajores triples");
  assert.equal(parsed.dimensions.uxb, "24");
  assert.equal(parsed.sourcePrices[0]?.storeType, "mayorista");
  assert.deepEqual(parsed.diagnostics?.queriesTried, ["alfajor arcor"]);
});

test("sigue leyendo source_prices historicos guardados como array", () => {
  const parsed = parseStoredPriceListDetail([createSourcePrice()]);

  assert.equal(parsed.isLegacy, true);
  assert.equal(parsed.ownPrice, null);
  assert.equal(parsed.diagnostics, null);
  assert.equal(parsed.sourcePrices.length, 1);
  assert.equal(parsed.sourcePrices[0]?.storeName, "Maxiconsumo Chaco");
});

function createSourcePrice(): PriceListSourcePrice {
  return {
    sourceId: "maxiconsumo-chaco-auth",
    storeName: "Maxiconsumo Chaco",
    storeType: "mayorista",
    price: 1_200,
    comparisonPrice: 1_200,
    currency: "ARS",
    productName: "Alfajor comparable",
    productUrl: null,
    confidenceScore: 92,
  };
}
