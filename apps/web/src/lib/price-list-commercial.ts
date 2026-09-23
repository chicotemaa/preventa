import type {
  PriceListItemResult,
  PriceListSourcePrice,
} from "@/types/search";
import { compareSourcePriority } from "@/lib/source-priority";
import { isPriceFresh } from "./price-freshness";
import { parseUnitsPerPackage } from "./price-comparison-safety";
import { calculateCostStructure, parseCostConditions, type CostBreakdown } from "./cost-structure";

export const DEFAULT_TARGET_GROSS_MARGIN_RATIO =
  readConfiguredTargetGrossMarginRatio();
const MIN_RELIABLE_MATCH_SCORE = 70;

export type PriceListCommercialAnalysis = {
  costBreakdown: CostBreakdown | null;
  effectiveUnitCost: number | null;
  economicsConfirmed: boolean;
  economicsReason: string;
  listPriceMarkupRatio: number | null;
  excelSalePrice: number | null;
  supplierCost: number | null;
  unitsPerPackage: number | null;
  excelPackagePrice: number | null;
  supplierPackageCost: number | null;
  grossProfitAmount: number | null;
  markupRatio: number | null;
  grossMarginRatio: number | null;
  targetGrossMarginRatio: number;
  minimumPriceForTargetMargin: number | null;
  marginAmountVsTarget: number | null;
  bestWholesale: PriceListSourcePrice | null;
  bestWholesalePrice: number | null;
  averageWholesalePrice: number | null;
  bestRetail: PriceListSourcePrice | null;
  bestRetailPrice: number | null;
  differenceVsBestWholesale: number | null;
  gapVsBestWholesaleRatio: number | null;
  gapVsAverageWholesaleRatio: number | null;
  supplierCostComparable: boolean;
  supplierCostStatus: "comparable" | "normalized" | "missing" | "rejected" | "outdated";
  supplierCostReason: string;
};

export function analyzePriceListCommercial(
  result: PriceListItemResult,
  targetGrossMarginRatio = DEFAULT_TARGET_GROSS_MARGIN_RATIO,
  now = Date.now(),
): PriceListCommercialAnalysis {
  const excelSalePrice = normalizePrice(
    result.ownPrice?.excelPrice ?? result.input.currentPrice,
  );
  const supplierCost = normalizePrice(result.ownPrice?.tokinPrice);
  const unitsPerPackage = parseUnitsPerPackage(result.input.uxb);
  const supplierCostStatus = getSupplierCostStatus(result, supplierCost, now);
  const supplierCostComparable =
    supplierCost !== null &&
    (supplierCostStatus === "comparable" || supplierCostStatus === "normalized");
  const costConditions = parseCostConditions(result.costConditions);
  const costBreakdown = supplierCostComparable
    ? calculateCostStructure(supplierCost, excelSalePrice, costConditions) : null;
  const safeTargetMargin = costConditions
    ? costConditions.targetMarginPercent / 100 : normalizeTargetMargin(targetGrossMarginRatio);
  const reliableWholesalePrices = getReliableSourcePrices(
    result.sourcePrices,
    "mayorista",
    now,
  );
  const reliableRetailPrices = getReliableSourcePrices(
    result.sourcePrices,
    "minorista",
    now,
  );
  const bestWholesale = reliableWholesalePrices[0] ?? null;
  const bestRetail = reliableRetailPrices[0] ?? null;
  const bestWholesalePrice = bestWholesale
    ? getCommercialComparablePrice(bestWholesale)
    : null;
  const bestRetailPrice = bestRetail
    ? getCommercialComparablePrice(bestRetail)
    : null;
  const averageWholesalePrice = average(
    reliableWholesalePrices.map(getCommercialComparablePrice),
  );
  const grossProfitAmount = costBreakdown?.contributionAmount == null
    ? null : roundMoney(costBreakdown.contributionAmount);
  const markupRatio = costBreakdown?.markupRatio ?? null;
  const grossMarginRatio = costBreakdown?.marginRatio ?? null;
  const minimumPriceForTargetMargin = costBreakdown
    ? roundMoney(costBreakdown.targetExcelPrice) : null;

  return {
    costBreakdown,
    effectiveUnitCost: costBreakdown ? roundMoney(costBreakdown.effectiveUnitCost) : null,
    economicsConfirmed: costBreakdown !== null,
    economicsReason: !supplierCostComparable
      ? getSupplierCostReason(supplierCostStatus, result.diagnostics?.aguiarPriceNormalization?.reason)
      : !costConditions
        ? "Falta confirmar IVA, descuentos, bonificaciones y costos adicionales por articulo. Tokin es una referencia, no el costo final."
        : "Margen estimado sobre venta neta y costo ajustado. No representa rentabilidad neta: excluye gastos no informados.",
    listPriceMarkupRatio: supplierCostComparable && excelSalePrice && supplierCost
      ? (excelSalePrice - supplierCost) / supplierCost : null,
    excelSalePrice,
    supplierCost,
    unitsPerPackage,
    excelPackagePrice:
      excelSalePrice && unitsPerPackage
        ? roundMoney(excelSalePrice * unitsPerPackage)
        : null,
    supplierPackageCost:
      supplierCostComparable && supplierCost && unitsPerPackage
        ? roundMoney(supplierCost * unitsPerPackage)
        : null,
    grossProfitAmount,
    markupRatio,
    grossMarginRatio,
    targetGrossMarginRatio: safeTargetMargin,
    minimumPriceForTargetMargin,
    marginAmountVsTarget:
      excelSalePrice && minimumPriceForTargetMargin
        ? roundMoney(excelSalePrice - minimumPriceForTargetMargin)
        : null,
    bestWholesale,
    bestWholesalePrice,
    averageWholesalePrice,
    bestRetail,
    bestRetailPrice,
    differenceVsBestWholesale:
      excelSalePrice && bestWholesalePrice
        ? roundMoney(excelSalePrice - bestWholesalePrice)
        : null,
    gapVsBestWholesaleRatio: calculateRatioGap(
      excelSalePrice,
      bestWholesalePrice,
    ),
    gapVsAverageWholesaleRatio: calculateRatioGap(
      excelSalePrice,
      averageWholesalePrice,
    ),
    supplierCostComparable,
    supplierCostStatus,
    supplierCostReason: getSupplierCostReason(
      supplierCostStatus,
      result.diagnostics?.aguiarPriceNormalization?.reason,
    ),
  };
}

export function calculateGrossMarginRatio(
  salePrice: number | null | undefined,
  cost: number | null | undefined,
) {
  const normalizedSalePrice = normalizePrice(salePrice);
  const normalizedCost = normalizePrice(cost);

  return normalizedSalePrice && normalizedCost
    ? (normalizedSalePrice - normalizedCost) / normalizedSalePrice
    : null;
}

export function calculateMinimumPriceForMargin(
  cost: number | null | undefined,
  targetGrossMarginRatio = DEFAULT_TARGET_GROSS_MARGIN_RATIO,
) {
  const normalizedCost = normalizePrice(cost);

  return normalizedCost
    ? roundMoney(normalizedCost / (1 - normalizeTargetMargin(targetGrossMarginRatio)))
    : null;
}

export function getCommercialComparablePrice(price: PriceListSourcePrice) {
  return normalizePrice(price.comparisonPrice) ?? price.price;
}

export function isReliableSourcePrice(sourcePrice: PriceListSourcePrice) {
  const price = getCommercialComparablePrice(sourcePrice);
  return (
    Number.isFinite(price) &&
    sourcePrice.currency === "ARS" &&
    sourcePrice.availability !== "out_of_stock" &&
    price > 0 &&
    Number.isFinite(sourcePrice.confidenceScore) &&
    sourcePrice.confidenceScore >= MIN_RELIABLE_MATCH_SCORE &&
    sourcePrice.confidenceScore <= 100
  );
}

export function getReliableSourcePrices(
  sourcePrices: PriceListSourcePrice[],
  storeType?: PriceListSourcePrice["storeType"],
  now = Date.now(),
) {
  return sourcePrices
    .filter(
      (source) =>
        (!storeType || source.storeType === storeType) &&
        isReliableSourcePrice(source) && isPriceFresh(source.observedAt, now),
    )
    .sort(comparePriceListSourcePrices);
}

export function comparePriceListSourcePrices(
  first: PriceListSourcePrice,
  second: PriceListSourcePrice,
) {
  if (first.storeType !== second.storeType) {
    return first.storeType === "mayorista" ? -1 : 1;
  }

  const reliabilityRank =
    Number(isReliableSourcePrice(second)) - Number(isReliableSourcePrice(first));
  if (reliabilityRank !== 0) {
    return reliabilityRank;
  }

  const firstPrice =
    normalizePrice(getCommercialComparablePrice(first)) ?? Infinity;
  const secondPrice =
    normalizePrice(getCommercialComparablePrice(second)) ?? Infinity;
  if (firstPrice !== secondPrice) {
    return firstPrice - secondPrice;
  }

  return compareSourcePriority(first, second);
}

function getSupplierCostStatus(
  result: PriceListItemResult,
  supplierCost: number | null,
  now: number,
): PriceListCommercialAnalysis["supplierCostStatus"] {
  if (result.diagnostics?.aguiarPriceNormalization?.status === "rejected") {
    return "rejected";
  }

  if (!supplierCost) {
    return "missing";
  }

  if (!isPriceFresh(result.ownPrice?.tokinObservedAt, now)) {
    return "outdated";
  }

  return result.diagnostics?.aguiarPriceNormalization?.status === "normalized"
    ? "normalized"
    : "comparable";
}

function getSupplierCostReason(
  status: PriceListCommercialAnalysis["supplierCostStatus"],
  diagnosticReason?: string,
) {
  if (status === "outdated") {
    return "Actualizar costo Tokin: el precio tiene mas de 36 horas o no tiene fecha verificable. No se calcula margen ni precio objetivo.";
  }
  if (diagnosticReason) {
    return diagnosticReason;
  }

  if (status === "normalized") {
    return "El costo Tokin fue normalizado a unidad equivalente.";
  }

  if (status === "rejected") {
    return "La referencia Tokin no es comparable con la presentación del Excel.";
  }

  if (status === "missing") {
    return "No hay costo Tokin comparable para estimar margen.";
  }

  return "Costo Tokin y precio Excel comparados por unidad equivalente.";
}

function calculateRatioGap(
  value: number | null,
  reference: number | null,
) {
  return value && reference ? (value - reference) / reference : null;
}

function average(values: number[]) {
  return values.length > 0
    ? roundMoney(values.reduce((total, value) => total + value, 0) / values.length)
    : null;
}

function normalizeTargetMargin(value: number) {
  return Number.isFinite(value) && value > 0 && value < 0.9
    ? value
    : DEFAULT_TARGET_GROSS_MARGIN_RATIO;
}

function readConfiguredTargetGrossMarginRatio() {
  const configuredPercent = Number(
    process.env.NEXT_PUBLIC_TARGET_GROSS_MARGIN_PERCENT ?? "20",
  );
  const configuredRatio = configuredPercent / 100;

  return Number.isFinite(configuredRatio) &&
    configuredRatio > 0 &&
    configuredRatio < 0.9
    ? configuredRatio
    : 0.2;
}

function normalizePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
