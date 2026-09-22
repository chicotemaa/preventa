import assert from "node:assert/strict";
import test from "node:test";
import { calculateCostStructure, parseCostConditions } from "./cost-structure";
import { confirmedCostConditions as base } from "./test-fixtures/cost-conditions";

test("separa venta neta, descuentos en cadena y costo ajustado por unidad", () => {
  const b = calculateCostStructure(1210, 1815, {
    ...base, purchaseTaxBasis: "included", purchaseVatPercent: 21, recoverableVatPercent: 100,
    saleTaxBasis: "included", saleVatPercent: 21, discountPercent: 10,
    bonusPercent: 5, freightPerUnit: 40, financingPercent: 1, otherCostsPerUnit: 10,
  })!;
  assert.equal(b.supplierNet, 1000);
  assert.equal(b.discountAmount, 100);
  assert.equal(b.bonusAmount, 45);
  assert.equal(b.goodsNet, 855);
  assert.equal(b.nonRecoverableVat, 0);
  assert.equal(b.financing, 8.55);
  assert.equal(b.effectiveUnitCost, 913.55);
  assert.equal(b.netSalePrice, 1500);
  assert.ok(Math.abs(b.marginRatio! - 586.45 / 1500) < 1e-10);
  assert.ok(Math.abs(b.markupRatio! - 586.45 / 913.55) < 1e-10);
  assert.equal(Math.round(b.targetExcelPrice * 100) / 100, 1381.74);
});

test("incluye solo IVA no recuperable en el costo y no quita IVA de precios netos", () => {
  const b = calculateCostStructure(1000, 1500, { ...base, purchaseVatPercent: 21, recoverableVatPercent: 50, saleVatPercent: 21 })!;
  assert.equal(b.nonRecoverableVat, 105);
  assert.equal(b.effectiveUnitCost, 1105);
  assert.equal(b.netSalePrice, 1500);
  assert.equal(b.targetExcelPrice, 1381.25);
});

test("condiciones incompletas o invalidas no equivalen a costo cero", () => {
  for (const value of [null, {}, { ...base, confirmedAt: "" }, { ...base, discountPercent: 100 },
    { ...base, freightPerUnit: -1 }, { ...base, saleVatPercent: NaN },
    { ...base, financingPercent: "0" }, { ...base, otherCostsPerUnit: Infinity },
    { ...base, targetMarginPercent: 100 }, { ...base, purchaseTaxBasis: "unknown" }]) {
    assert.equal(parseCostConditions(value), null);
    assert.equal(calculateCostStructure(1000, 1500, value), null);
  }
  assert.equal(calculateCostStructure(0, 1500, base), null);
  assert.equal(calculateCostStructure(1000, null, base)?.marginRatio, null);
  assert.equal(calculateCostStructure(1000, 900, base)?.marginRatio, -1 / 9);
});
