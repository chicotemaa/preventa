import assert from "node:assert/strict";
import test from "node:test";
import { buildPricingExample } from "./pricing-example";
import { analyzePriceListDecision } from "./price-list-decision";
import { analyzePriceListCommercial, isReliableSourcePrice } from "./price-list-commercial";
import { getPriceConditionWarning, parseUnitsPerPackage } from "./price-comparison-safety";
import { getWholesalePosition, summarizeDecisionReadiness } from "./price-position";
import type { PriceListSourcePrice } from "@/types/search";

const now = Date.parse("2026-09-22T12:00:00Z");

test("ejemplo reproducible: diez casos, acciones y formulas verificadas", () => {
  const example = buildPricingExample(now);
  const decisions = example.results.map(row => analyzePriceListDecision(row, now));
  assert.deepEqual(decisions.map(row => row.kind), [
    "above_wholesale_critical", "competitive", "margin_opportunity", "cost_pressure",
    "above_wholesale_warning", "missing_own_price", "outdated_reference", "conditional_reference",
    "retail_only", "weak_match",
  ]);
  assert.equal(decisions[0].gapRatio, 0.2);
  assert.equal(decisions[0].commercial.markupRatio, 0.5);
  assert.equal(decisions[0].commercial.grossMarginRatio, 1 / 3);
  assert.equal(decisions[4].commercial.supplierPackageCost, 13319.47);
  assert.equal(decisions[4].commercial.excelPackagePrice, 20000);
  assert.deepEqual(summarizeDecisionReadiness(decisions), {
    total: 10, comparableWholesale: 6, currentSupplier: 10, confirmedCosts: 10, above: 4, aligned: 1, below: 1,
  });
});

test("precio alto sigue visible aunque falten condiciones de costo", () => {
  const row = buildPricingExample(now).results[0];
  delete row.costConditions;
  const decision = analyzePriceListDecision(row, now);
  assert.equal(getWholesalePosition(decision), "above");
  assert.equal(decision.kind, "cost_unverified");
  assert.equal(decision.commercial.minimumPriceForTargetMargin, null);
  assert.equal(summarizeDecisionReadiness([decision]).above, 1);
});

test("UxB exige cantidad completa y no toma pesos, negativos o expresiones ambiguas", () => {
  for (const value of ["40", "40 Uds", "40 unidades", "40,0", "40.00", "1"]) {
    assert.equal(parseUnitsPerPackage(value), value === "1" ? 1 : 40, value);
  }
  for (const value of ["-40", "1.5", "40 gr", "3 x 12", "10001", "40/48", "0", "", undefined]) {
    assert.equal(parseUnitsPerPackage(value), null, value);
    const row = buildPricingExample(now).results[0];
    row.input.uxb = value;
    assert.equal(analyzePriceListCommercial(row, undefined, now).excelPackagePrice, null);
  }
});

test("precio condicionado no produce consejo de baja aunque costo y vigencia esten confirmados", () => {
  const row = buildPricingExample(now).results[0];
  row.sourcePrices[0].priceCondition = "Precio unitario por bulto cerrado";
  assert.equal(analyzePriceListDecision(row, now).kind, "conditional_reference");
  assert.equal(getPriceConditionWarning(row.sourcePrices[0]), "Precio unitario por bulto cerrado");
  row.sourcePrices[0].priceCondition = null;
  row.sourcePrices[0].alternatePrices = [{ label: "Promo", price: 1000 }];
  assert.equal(analyzePriceListDecision(row, now).kind, "conditional_reference");
  row.sourcePrices[0].alternatePrices = [{ label: "Promo", price: 950 }];
  assert.equal(analyzePriceListDecision(row, now).kind, "above_wholesale_critical");
});

test("no compara una moneda desconocida como si fuera ARS ni inventa venta", () => {
  const row = buildPricingExample(now).results[0];
  for (const currency of ["USD", undefined, ""]) {
    assert.equal(isReliableSourcePrice({ ...row.sourcePrices[0], currency } as PriceListSourcePrice), false);
  }
  row.input.currentPrice = undefined;
  row.ownPrice = undefined;
  row.sourcePrices = [];
  assert.equal(analyzePriceListDecision(row, now).kind, "missing_own_price");
});
