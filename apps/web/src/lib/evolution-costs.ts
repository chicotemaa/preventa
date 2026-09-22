import type { PriceEvolutionPoint } from "@/types/search";
import { calculateCostStructure } from "./cost-structure";
import { isPriceFresh } from "./price-freshness";

export function getEvolutionCostBreakdown(point: PriceEvolutionPoint) {
  // Historical margin uses this snapshot, never sale and cost from different dates.
  if (point.costComparable !== true || !isPriceFresh(point.ownPrice?.tokinObservedAt, Date.parse(point.searchedAt))) return null;
  return calculateCostStructure(
    point.ownPrice?.tokinPrice,
    point.ownPrice ? point.ownPrice.excelPrice : point.araPrice,
    point.costConditions,
  );
}
