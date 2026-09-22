import assert from "node:assert/strict";
import test from "node:test";
import { getPriceFreshness, isPriceFresh } from "./price-freshness";

const NOW = Date.parse("2026-09-22T15:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

test("vigencia por observacion: hasta 36 h, advertencia hasta 72 h, luego desactualizado", () => {
  assert.equal(getPriceFreshness(hoursAgo(36), NOW).status, "fresh");
  assert.equal(getPriceFreshness(hoursAgo(36.01), NOW).status, "aging");
  assert.equal(getPriceFreshness(hoursAgo(72), NOW).status, "aging");
  assert.equal(getPriceFreshness(hoursAgo(72.01), NOW).status, "stale");
  assert.equal(isPriceFresh(hoursAgo(40), NOW), false);
});

test("fechas ausentes, invalidas o futuras no acreditan precios vigentes", () => {
  for (const value of [undefined, null, "", "bad", hoursAgo(-24)]) {
    assert.equal(getPriceFreshness(value, NOW).status, "unknown");
    assert.equal(isPriceFresh(value, NOW), false);
  }
});
