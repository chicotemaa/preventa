import {
  analyzePriceListDecision,
  getPriceListComparablePrice,
  sortPriceListResultPrices,
  type PriceListDecisionAnalysis,
  type PriceListDecisionTone,
} from "@/lib/price-list-decision";
import { analyzePricingImpact, type PricingImpact } from "./pricing-impact";
import { getWholesalePosition } from "./price-position";
import type {
  PriceListItemResult,
  PriceListRunItem,
  PriceListSourcePrice,
} from "@/types/search";

export type HistoryDecisionFilter =
  | "all"
  | "attention"
  | "above_wholesale"
  | "competitive"
  | "opportunity"
  | "missing_own"
  | "without_wholesale";

export type HistoryItemAnalysis = PriceListDecisionAnalysis & {
  impact: PricingImpact;
  item: PriceListRunItem;
  excelPrice: number | null;
  tokinPrice: number | null;
  selectedOwnPrice: number | null;
  selectedOwnPriceLabel: string;
  excelVsTokinGapRatio: number | null;
  ownPriceWasStored: boolean;
  bestWholesale: PriceListSourcePrice | null;
  bestRetail: PriceListSourcePrice | null;
};

export type HistoryDecisionSummary = {
  total: number;
  attention: number;
  aboveWholesale: number;
  competitive: number;
  opportunities: number;
  missingOwn: number;
  withoutWholesale: number;
};

export function analyzeHistoryItem(item: PriceListRunItem): HistoryItemAnalysis {
  const result = buildHistoryItemResult(item);
  const baseAnalysis = analyzePriceListDecision(result);
  const ownPriceWasStored =
    item.ownPriceSnapshotStatus !== "not_stored_legacy";
  const analysis =
    !ownPriceWasStored && !item.currentPrice
      ? {
          ...baseAnalysis,
          label: "Precio Excel no guardado",
          action: "Generar una nueva carga",
          helper:
            "Esta carga anterior no guardo el precio Excel ni el costo proveedor Tokin.",
          tone: "neutral" as const,
        }
      : baseAnalysis;

  return {
    ...analysis,
    impact: analyzePricingImpact(result, analysis),
    item,
    excelPrice: item.ownPrice?.excelPrice ?? null,
    tokinPrice: item.ownPrice?.tokinPrice ?? null,
    selectedOwnPrice: item.ownPrice
      ? normalizeOptionalNumber(item.ownPrice.excelPrice)
      : normalizeOptionalNumber(item.currentPrice),
    selectedOwnPriceLabel: getStoredOwnPriceLabel(item),
    excelVsTokinGapRatio: calculateGapRatio(
      item.ownPrice?.excelPrice ?? null,
      item.ownPrice?.tokinPrice ?? null,
    ),
    ownPriceWasStored,
    bestWholesale: analysis.commercial.bestWholesale,
    bestRetail: analysis.commercial.bestRetail,
  };
}

export function summarizeHistoryItems(
  analyses: HistoryItemAnalysis[],
): HistoryDecisionSummary {
  return {
    total: analyses.length,
    attention: analyses.filter(isAttentionAnalysis).length,
    aboveWholesale: analyses.filter(analysis => getWholesalePosition(analysis) === "above").length,
    competitive: analyses.filter((analysis) => analysis.kind === "competitive")
      .length,
    opportunities: analyses.filter(
      (analysis) => analysis.kind === "margin_opportunity",
    ).length,
    missingOwn: analyses.filter(
      (analysis) => analysis.kind === "missing_own_price",
    ).length,
    withoutWholesale: analyses.filter(
      (analysis) => !analysis.hasWholesaleReference,
    ).length,
  };
}

export function filterHistoryAnalyses(
  analyses: HistoryItemAnalysis[],
  filter: HistoryDecisionFilter,
) {
  if (filter === "all") {
    return analyses;
  }

  if (filter === "attention") {
    return analyses.filter(isAttentionAnalysis);
  }

  if (filter === "above_wholesale") {
    return analyses.filter(analysis => getWholesalePosition(analysis) === "above");
  }

  if (filter === "competitive") {
    return analyses.filter((analysis) => analysis.kind === "competitive");
  }

  if (filter === "opportunity") {
    return analyses.filter(
      (analysis) => analysis.kind === "margin_opportunity",
    );
  }

  if (filter === "missing_own") {
    return analyses.filter(
      (analysis) => analysis.kind === "missing_own_price",
    );
  }

  return analyses.filter((analysis) => !analysis.hasWholesaleReference);
}

export function historyDecisionToneClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "border-[#f1b3ad] bg-[#fff1ef] text-[#8f2d20]",
    warning: "border-[#f0d2a2] bg-[#fff8e8] text-[#8a5a0a]",
    success: "border-[#bfe5cf] bg-[#f4fbf7] text-[#16613c]",
    info: "border-[#bed4f4] bg-[#f5f8ff] text-[#153d7b]",
    neutral: "border-[#d9dee7] bg-[#f8fafc] text-[#526170]",
  };

  return classes[tone];
}

export function getHistoryComparablePrice(price: PriceListSourcePrice | null) {
  return price ? getPriceListComparablePrice(price) : null;
}

export function buildHistoryItemResult(item: PriceListRunItem): PriceListItemResult {
  return sortPriceListResultPrices({
    input: {
      businessActivity: item.businessActivity,
      rowNumber: item.rowNumber,
      business: item.business ?? undefined,
      rubro: item.rubro ?? undefined,
      segment: item.segment ?? undefined,
      subrubro: item.subrubro ?? undefined,
      line: item.line ?? undefined,
      description: item.description ?? undefined,
      code: item.code ?? undefined,
      uxb: item.uxb ?? undefined,
      ean13Di: item.ean13Di ?? undefined,
      ean13Bu: item.ean13Bu ?? undefined,
      currentPrice:
        (item.ownPrice ? item.ownPrice.excelPrice : item.currentPrice) ?? undefined,
    },
    ownPrice: item.ownPrice ?? undefined,
    costConditions: item.costConditions,
    diagnostics: item.matchDiagnostics ?? undefined,
    queryUsed: null,
    status: item.matchStatus,
    bestPrice: null,
    bestSource: null,
    sourcePrices: item.sourcePrices,
    matchedCount: item.matchedCount,
  });
}

function isAttentionAnalysis(analysis: HistoryItemAnalysis) {
  return analysis.kind !== "competitive" && analysis.kind !== "margin_opportunity";
}

function getStoredOwnPriceLabel(item: PriceListRunItem) {
  if (item.ownPrice?.excelPrice) {
    return "Excel";
  }

  if (
    item.ownPriceSnapshotStatus === "not_stored_legacy" &&
    !item.currentPrice
  ) {
    return "No guardado en esta carga";
  }

  return item.currentPrice ? "Excel histórico" : "Sin precio Excel";
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function calculateGapRatio(
  value: number | null | undefined,
  reference: number | null | undefined,
) {
  const normalizedValue = normalizeOptionalNumber(value);
  const normalizedReference = normalizeOptionalNumber(reference);

  return normalizedValue && normalizedReference
    ? (normalizedValue - normalizedReference) / normalizedReference
    : null;
}
