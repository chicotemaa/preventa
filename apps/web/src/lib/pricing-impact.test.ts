import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { analyzePricingImpact, comparePricingImpact } from "./pricing-impact";
import { analyzePriceListDecision } from "./price-list-decision";
import { parseBusinessActivity, readBusinessActivityColumns } from "./business-activity";
import { parseStoredPriceListDetail, serializeStoredPriceListDetail } from "./price-list-storage";
import { businessResult, wholesale, NOW } from "./test-fixtures/pricing-business";
import type { PriceListItemResult } from "@/types/search";

const impact = (result: PriceListItemResult) => analyzePricingImpact(result, analyzePriceListDecision(result, NOW), NOW);

test("prioriza 3% de gran volumen sobre 15% de poca venta", () => {
  const low = impact(businessResult(115, 10));
  const high = impact(businessResult(103, 10000));
  assert.equal(low.priceExposure, 150);
  assert.equal(high.priceExposure, 30000);
  assert.ok(comparePricingImpact(high, low) < 0);
});

test("normaliza periodos, calcula contribucion y cobertura sin confundirlas con perdidas", () => {
  const result = businessResult(115, 50);
  result.input.businessActivity!.periodDays = 15;
  const a = impact(result);
  assert.equal(a.monthlyUnits, 100);
  assert.equal(a.monthlySales, 11500);
  assert.equal(a.monthlyContribution, 4500);
  assert.equal(a.stockCoverDays, 15);
  assert.equal(a.stockValue, 3500);
  assert.match(a.reason, /No es perdida/);
});

test("la referencia es mediana por fuente, no minimo ni variantes duplicadas", () => {
  const result = businessResult(115);
  result.sourcePrices = [wholesale(1, "a"), wholesale(100, "b"), wholesale(110, "c"), wholesale(101, "b")];
  const a = impact(result);
  assert.equal(a.referencePrice, 100);
  assert.equal(a.referenceCount, 3);
});

test("excluye stock desconocido, sin stock, promos, precio condicionado, viejo, minorista y match debil", () => {
  for (const patch of [{ availability: "unknown" }, { availability: "out_of_stock" }, { priceCondition: "Promo 2x1" },
    { priceCondition: "por bulto cerrado" }, { alternatePrices: [{ label: "oferta", price: 100 }] },
    { observedAt: "2026-09-01T00:00:00Z" }, { confidenceScore: 45 }, { storeType: "minorista" }]) {
    const result = businessResult();
    Object.assign(result.sourcePrices[0], patch);
    assert.equal(impact(result).priceExposure, null, JSON.stringify(patch));
  }
});

test("no inventa impacto sin ventas/fecha/Excel y conserva cero real", () => {
  const result = businessResult();
  result.input.businessActivity = undefined;
  assert.equal(impact(result).priceExposure, null);
  result.input.businessActivity = { unitsSold: 0, periodDays: 30, salesThrough: "2026-09-22", stockUnits: 0, stockAsOf: "2026-09-22" };
  assert.equal(impact(result).priceExposure, 0);
  assert.equal(impact(result).stockUnits, 0);
  assert.equal(impact(result).stockCoverDays, null);
  result.input.businessActivity.salesThrough = "2026-07-01";
  assert.equal(impact(result).monthlyUnits, null);
  result.input.businessActivity.salesThrough = "2026-09-25";
  assert.equal(impact(result).monthlyUnits, null);
  result.ownPrice!.excelPrice = null;
  result.input.currentPrice = undefined;
  assert.equal(impact(result).priceExposure, null);
});

test("stock vencido no genera cobertura ni capital; costo sin confirmar no genera contribucion", () => {
  const result = businessResult();
  result.input.businessActivity!.stockAsOf = "2026-08-01";
  delete result.costConditions;
  assert.equal(impact(result).stockValue, null);
  assert.equal(impact(result).stockCoverDays, null);
  assert.equal(impact(result).monthlyContribution, null);
});

test("parsea columnas opcionales sin aceptar datos invalidos ni convertir ausencia en cero", () => {
  const headers = ["unidades vendidas", "dias del periodo", "ventas hasta", "stock unidades", "fecha stock"];
  assert.deepEqual(readBusinessActivityColumns(headers, [0, 30, "22/09/2026", "0", "2026-09-22"]),
    { unitsSold: 0, periodDays: 30, salesThrough: "2026-09-22", stockUnits: 0, stockAsOf: "2026-09-22" });
  assert.equal(readBusinessActivityColumns([], []), undefined);
  for (const values of [[-5, 30], [1, 0], [1, 999], [1, 30, "2026-02-30"], ["5 bultos", 30]]) {
    assert.throws(() => readBusinessActivityColumns(headers, values));
  }
  assert.equal(parseBusinessActivity({ unitsSold: NaN }), null);
});

test("ventas/stock y disponibilidad conservan el snapshot JSON", () => {
  const result = businessResult();
  const saved = parseStoredPriceListDetail(serializeStoredPriceListDetail({ ...result, diagnostics: result.diagnostics }));
  assert.deepEqual(saved.dimensions.businessActivity, result.input.businessActivity);
  assert.equal(saved.sourcePrices[0].availability, "in_stock");
  assert.equal(parseStoredPriceListDetail([]).dimensions.businessActivity, undefined);
});

test("CSV mantiene fechas ISO y XLSX conserva fechas numericas de Excel", () => {
  const headers = ["unidades vendidas", "dias del periodo", "ventas hasta", "stock unidades", "fecha stock"];
  const csv = XLSX.read(headers.join(",") + "\n100,30,2026-09-22,50,2026-09-22", { type: "string", raw: true });
  const csvRows = XLSX.utils.sheet_to_json<unknown[]>(csv.Sheets[csv.SheetNames[0]], { header: 1 });
  assert.equal(readBusinessActivityColumns(headers, csvRows[1])!.salesThrough, "2026-09-22");
  const book = XLSX.utils.book_new();
  const serial = (Date.UTC(2026, 8, 22) - Date.UTC(1899, 11, 30)) / 86400000;
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, [100, 30, serial, 50, serial]]), "Datos");
  const reloaded = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", raw: true });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(reloaded.Sheets.Datos, { header: 1 });
  assert.equal(readBusinessActivityColumns(headers, rows[1])!.stockAsOf, "2026-09-22");
});
