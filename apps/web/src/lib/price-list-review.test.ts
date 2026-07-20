import assert from "node:assert/strict";
import test from "node:test";
import type {
  PriceListRunDetail,
  PriceListRunItem,
  PriceListSourcePrice,
  ProductMatchOverride,
} from "@/types/search";
import {
  buildPricingReviewDashboard,
  filterPricingReviewItems,
} from "./price-list-review";
import {
  buildInputFingerprint,
  buildProductFingerprint,
} from "./match-overrides";

test("resume alertas mayoristas y variaciones semanales fuertes", () => {
  const reviewCandidate: PriceListSourcePrice = {
    ...createSource(1_100, 65),
    sourceId: "yaguar-chaco-auth",
    storeName: "Yaguar",
    productUrl: "https://yaguar.com.ar/productos/alfajor-hamlet",
  };
  const currentItem = createItem(1_300, [
    createSource(1_000),
    reviewCandidate,
  ]);
  const previousItem = createItem(1_000, [createSource(950)]);
  const dashboard = buildPricingReviewDashboard(
    createDetail("current", "2026-07-20T12:00:00.000Z", currentItem),
    createDetail("previous", "2026-07-13T12:00:00.000Z", previousItem),
    [],
  );

  assert.equal(dashboard.summary.aboveWholesale, 1);
  assert.equal(dashboard.summary.weeklyChanges, 1);
  assert.equal(dashboard.items[0]?.weeklyVariationRatio, 0.3);
  assert.equal(dashboard.equivalences[0]?.storeName, "Yaguar");
  assert.equal(
    filterPricingReviewItems(dashboard.items, "weekly_change").length,
    1,
  );
});

test("muestra sin precio propio como asunto a revisar", () => {
  const dashboard = buildPricingReviewDashboard(
    createDetail(
      "current",
      "2026-07-20T12:00:00.000Z",
      createItem(null, [createSource(1_000)]),
    ),
    null,
    [],
  );

  assert.equal(dashboard.summary.missingOwn, 1);
  assert.equal(dashboard.summary.attention, 1);
});

test("refleja una equivalencia manual ya confirmada", () => {
  const item = createItem(1_000, [createSource(950, 65)]);
  const source = item.sourcePrices[0]!;
  const override: ProductMatchOverride = {
    id: "override-1",
    inputFingerprint: buildInputFingerprint({
      rowNumber: item.rowNumber,
      description: item.description ?? undefined,
      rubro: item.rubro ?? undefined,
      code: item.code ?? undefined,
      ean13Di: item.ean13Di ?? undefined,
      ean13Bu: item.ean13Bu ?? undefined,
    }),
    inputDescription: item.description,
    inputCode: item.code,
    inputEan13Di: item.ean13Di,
    inputEan13Bu: item.ean13Bu,
    sourceId: source.sourceId,
    storeName: source.storeName,
    productFingerprint: buildProductFingerprint({
      sourceId: source.sourceId,
      productName: source.productName,
      productUrl: source.productUrl,
    }),
    productName: source.productName,
    productUrl: source.productUrl,
    status: "confirmed",
    updatedAt: "2026-07-20T12:00:00.000Z",
  };
  const dashboard = buildPricingReviewDashboard(
    createDetail("current", "2026-07-20T12:00:00.000Z", item),
    null,
    [override],
  );

  assert.equal(dashboard.equivalences[0]?.overrideStatus, "confirmed");
});

function createDetail(
  id: string,
  createdAt: string,
  item: PriceListRunItem,
): PriceListRunDetail {
  return {
    run: {
      id,
      listName: `Lista ${id}`,
      status: "completed",
      weekStart: null,
      searchedAt: createdAt,
      createdAt,
      durationMs: 1_000,
      itemsCount: 1,
      matchedCount: 1,
      unmatchedCount: 0,
      ownPriceCount: item.ownPrice?.selectedPrice ? 1 : 0,
    },
    sources: [],
    items: [item],
  };
}

function createItem(
  ownPrice: number | null,
  sourcePrices: PriceListSourcePrice[],
): PriceListRunItem {
  return {
    id: "item-1",
    rowNumber: 2,
    business: "Alimentos",
    rubro: "Golosinas",
    segment: "Alfajores",
    subrubro: "Alfajores triples",
    line: null,
    uxb: "24",
    description: "Alfajor Hamlet Mousse Mani 34,5gr",
    code: "ARC-1014414",
    ean13Di: "7790040405608",
    ean13Bu: null,
    currentPrice: ownPrice,
    ownPrice: {
      excelPrice: ownPrice,
      tokinPrice: null,
      selectedPrice: ownPrice,
      selectedSource: ownPrice ? "excel" : null,
      excelVsTokinGapRatio: null,
    },
    currentCost: null,
    matchStatus: sourcePrices.length ? "matched" : "not_found",
    bestPrice: sourcePrices[0]?.comparisonPrice ?? null,
    bestSourceName: sourcePrices[0]?.storeName ?? null,
    bestSourceType: sourcePrices[0]?.storeType ?? null,
    bestProductName: sourcePrices[0]?.productName ?? null,
    bestProductUrl: sourcePrices[0]?.productUrl ?? null,
    bestConfidenceScore: sourcePrices[0]?.confidenceScore ?? null,
    marginPercent: null,
    gapPercent: null,
    suggestedPrice: null,
    decisionStatus: "",
    decisionLabel: "",
    matchedCount: sourcePrices.length,
    sourcePrices,
  };
}

function createSource(
  price: number,
  confidenceScore = 90,
): PriceListSourcePrice {
  return {
    sourceId: "maxiconsumo-chaco-auth",
    storeName: "Maxiconsumo Chaco",
    storeType: "mayorista",
    price,
    comparisonPrice: price,
    currency: "ARS",
    productName: "Alfajor Hamlet Mousse Mani 34,5gr",
    productUrl: "https://maxiconsumo.com/productos/alfajor-hamlet",
    confidenceScore,
  };
}
