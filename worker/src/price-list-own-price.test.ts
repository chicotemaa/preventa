import assert from "node:assert/strict";
import test from "node:test";
import { buildPriceListOwnPrice } from "./price-list-own-price.js";

test("Tokin tiene prioridad y conserva el precio original del Excel", () => {
  assert.deepEqual(buildPriceListOwnPrice(1_100, 1_000), {
    excelPrice: 1_100,
    tokinPrice: 1_000,
    selectedPrice: 1_000,
    selectedSource: "tokin",
    excelVsTokinGapRatio: 0.1,
  });
});

test("usa Excel cuando Tokin no tiene un precio valido", () => {
  assert.deepEqual(buildPriceListOwnPrice(1_100, null), {
    excelPrice: 1_100,
    tokinPrice: null,
    selectedPrice: 1_100,
    selectedSource: "excel",
    excelVsTokinGapRatio: null,
  });
});

test("no inventa un precio propio cuando ambas fuentes estan vacias", () => {
  assert.deepEqual(buildPriceListOwnPrice(undefined, 0), {
    excelPrice: null,
    tokinPrice: null,
    selectedPrice: null,
    selectedSource: null,
    excelVsTokinGapRatio: null,
  });
});
