import assert from "node:assert/strict";
import test from "node:test";
import { parseSpreadsheetAmount } from "./spreadsheet-values";

test("conserva la precision de una celda numerica de Excel", () => {
  assert.equal(parseSpreadsheetAmount(6109.9851973125), 6109.9851973125);
});

test("interpreta importes argentinos formateados como texto", () => {
  assert.equal(parseSpreadsheetAmount("$ 6.109,99"), 6109.99);
  assert.equal(parseSpreadsheetAmount("668.25"), 668.25);
  assert.equal(parseSpreadsheetAmount("6109.9851973125"), 6109.9851973125);
  assert.equal(parseSpreadsheetAmount("1.000"), 1000);
});

test("descarta celdas vacias, negativas o en cero", () => {
  assert.equal(parseSpreadsheetAmount(""), undefined);
  assert.equal(parseSpreadsheetAmount(0), undefined);
  assert.equal(parseSpreadsheetAmount(-12), undefined);
});
