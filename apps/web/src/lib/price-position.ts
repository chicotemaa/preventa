import type { PriceListDecisionAnalysis } from "./price-list-decision";

export type WholesalePosition = "above" | "aligned" | "below" | "unavailable";

// Published-price position is independent of profitability or an approved action.
export function getWholesalePosition(decision: PriceListDecisionAnalysis): WholesalePosition {
  const gap = decision.commercial.gapVsBestWholesaleRatio;
  if (!decision.hasWholesaleReference || gap === null || !Number.isFinite(gap)) return "unavailable";
  if (gap > 0.05) return "above";
  if (gap < -0.08) return "below";
  return "aligned";
}

export function summarizeDecisionReadiness(decisions: PriceListDecisionAnalysis[]) {
  return {
    total: decisions.length,
    comparableWholesale: decisions.filter(row => getWholesalePosition(row) !== "unavailable").length,
    currentSupplier: decisions.filter(row => row.commercial.supplierCostComparable).length,
    confirmedCosts: decisions.filter(row => row.commercial.economicsConfirmed).length,
    above: decisions.filter(row => getWholesalePosition(row) === "above").length,
    aligned: decisions.filter(row => getWholesalePosition(row) === "aligned").length,
    below: decisions.filter(row => getWholesalePosition(row) === "below").length,
  };
}
