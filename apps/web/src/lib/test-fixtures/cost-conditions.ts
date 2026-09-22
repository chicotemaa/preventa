import type { CostConditions } from "../cost-structure";

// Explicit assumptions for calculation tests, never a production default.
export const confirmedCostConditions: CostConditions = {
  version: 1, purchaseTaxBasis: "excluded", purchaseVatPercent: 0,
  recoverableVatPercent: 0, saleTaxBasis: "excluded", saleVatPercent: 0,
  discountPercent: 0, bonusPercent: 0, freightPerUnit: 0,
  financingPercent: 0, otherCostsPerUnit: 0, targetMarginPercent: 20,
  confirmedAt: "2026-09-22T12:00:00.000Z",
};
