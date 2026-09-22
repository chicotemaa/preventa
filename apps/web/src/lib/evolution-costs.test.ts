import assert from "node:assert/strict";
import test from "node:test";
import { getEvolutionCostBreakdown } from "./evolution-costs";
import { confirmedCostConditions } from "./test-fixtures/cost-conditions";
import type { PriceEvolutionPoint } from "@/types/search";

test("evolucion calcula margen con las condiciones y precios de la misma captura", () => {
  const point: PriceEvolutionPoint = {
    runId: "run", searchedAt: "2026-09-01T12:00:00Z", createdAt: "2026-09-01T12:00:00Z",
    araPrice: 1500, ownPrice: { excelPrice: 1500, tokinPrice: 1000, selectedPrice: 1500,
      selectedSource: "excel", excelVsTokinGapRatio: 0.5, tokinObservedAt: "2026-09-01T11:00:00Z" },
    referencePrice: null, suggestedPrice: null, bestSourceName: null,
    gapPercent: null, decisionLabel: "", sourcePrices: [], costComparable: true,
    costConditions: { ...confirmedCostConditions, freightPerUnit: 200 },
  };
  assert.equal(getEvolutionCostBreakdown(point)?.effectiveUnitCost, 1200);
  assert.equal(getEvolutionCostBreakdown(point)?.marginRatio, 0.2);
  assert.equal(getEvolutionCostBreakdown({ ...point, costConditions: undefined }), null);
  assert.equal(getEvolutionCostBreakdown({ ...point, costComparable: false }), null);
  assert.equal(getEvolutionCostBreakdown({ ...point, ownPrice: { ...point.ownPrice!, tokinObservedAt: "2020-01-01T00:00:00Z" } }), null);
  assert.equal(getEvolutionCostBreakdown({ ...point, ownPrice: { ...point.ownPrice!, excelPrice: null } })?.marginRatio, null);
});
