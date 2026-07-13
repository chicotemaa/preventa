import { compareSourcePriority } from "@/lib/source-priority";
import type {
  PriceListItemResult,
  PriceListSourcePrice,
} from "@/types/search";

export type PriceListDecisionTone =
  | "danger"
  | "warning"
  | "success"
  | "info"
  | "neutral";

export type PriceListDecisionKind =
  | "above_wholesale_critical"
  | "above_wholesale_warning"
  | "competitive"
  | "margin_opportunity"
  | "missing_own_price"
  | "retail_only"
  | "weak_match"
  | "no_reference";

export type PriceListDecisionAnalysis = {
  kind: PriceListDecisionKind;
  tone: PriceListDecisionTone;
  label: string;
  action: string;
  helper: string;
  currentPrice: number | null;
  referencePrice: number | null;
  referenceSource: PriceListSourcePrice | null;
  referenceChannelLabel: "mayorista" | "minorista" | "mercado";
  gapRatio: number | null;
  hasWholesaleReference: boolean;
};

export type PriceListDecisionSummary = {
  aboveWholesale: number;
  competitiveWholesale: number;
  marginOpportunity: number;
  withoutWholesaleReference: number;
  missingOwnPrice: number;
};

export function sortPriceListResultPrices(
  result: PriceListItemResult,
): PriceListItemResult {
  const sourcePrices = [...result.sourcePrices].sort(comparePriceListSourcePrices);
  const bestSource = sourcePrices[0] ?? null;

  return {
    ...result,
    sourcePrices,
    bestSource,
    bestPrice: bestSource ? getPriceListComparablePrice(bestSource) : null,
    status:
      bestSource || getPriceListOwnPrice(result)
        ? "matched"
        : "not_found",
  };
}

export function comparePriceListSourcePrices(
  first: PriceListSourcePrice,
  second: PriceListSourcePrice,
) {
  const storeTypeRank = getStoreTypeRank(first) - getStoreTypeRank(second);

  if (storeTypeRank !== 0) {
    return storeTypeRank;
  }

  const priceDifference =
    getPriceListComparablePrice(first) - getPriceListComparablePrice(second);

  if (priceDifference !== 0) {
    return priceDifference;
  }

  return compareSourcePriority(first, second);
}

export function getPriceListComparablePrice(price: PriceListSourcePrice) {
  return normalizeOptionalNumber(price.comparisonPrice) ?? price.price;
}

export function getBestPriceListSourceByType(
  result: PriceListItemResult,
  storeType: PriceListSourcePrice["storeType"],
) {
  return result.sourcePrices
    .filter((sourcePrice) => sourcePrice.storeType === storeType)
    .sort(
      (first, second) =>
        getPriceListComparablePrice(first) - getPriceListComparablePrice(second),
    )[0];
}

export function calculatePriceListGapRatio(
  currentPrice: number | null,
  referencePrice: number | null,
) {
  if (!currentPrice || !referencePrice) {
    return null;
  }

  return (currentPrice - referencePrice) / referencePrice;
}

export function analyzePriceListDecision(
  result: PriceListItemResult,
): PriceListDecisionAnalysis {
  const currentPrice = getPriceListOwnPrice(result);
  const bestWholesale = getBestPriceListSourceByType(result, "mayorista") ?? null;
  const referenceSource = bestWholesale ?? result.bestSource;
  const referencePrice = referenceSource
    ? getPriceListComparablePrice(referenceSource)
    : null;
  const gapRatio = calculatePriceListGapRatio(currentPrice, referencePrice);
  const hasWholesaleReference = Boolean(bestWholesale);
  const referenceChannelLabel =
    referenceSource?.storeType === "mayorista"
      ? "mayorista"
      : referenceSource?.storeType === "minorista"
        ? "minorista"
        : "mercado";

  if (!currentPrice && referencePrice) {
    return {
      kind: "missing_own_price",
      tone: "warning",
      label: "Falta precio propio",
      action: "Cargar precio Aguiar/Tokin",
      helper:
        "Hay referencia de mercado, pero falta precio propio para decidir.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio: null,
      hasWholesaleReference,
    };
  }

  if (!referenceSource || !referencePrice) {
    return {
      kind: "no_reference",
      tone: "neutral",
      label: "Sin referencia comparable",
      action: "Buscar referencia mayorista",
      helper: "No hay precio mayorista ni minorista comparable para este articulo.",
      currentPrice,
      referencePrice: null,
      referenceSource: null,
      referenceChannelLabel,
      gapRatio: null,
      hasWholesaleReference,
    };
  }

  if (referenceSource.confidenceScore > 0 && referenceSource.confidenceScore < 70) {
    return {
      kind: "weak_match",
      tone: "neutral",
      label: "Match a revisar",
      action: "Revisar equivalencia",
      helper:
        "La coincidencia es debil; no conviene ajustar precio sin validar el producto.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio,
      hasWholesaleReference,
    };
  }

  if (!hasWholesaleReference) {
    return {
      kind: "retail_only",
      tone: "neutral",
      label: "Solo referencia minorista",
      action: "Validar con mayoristas",
      helper:
        "Hay mercado minorista, pero no mayorista. No usar como baja automatica.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio,
      hasWholesaleReference,
    };
  }

  if (gapRatio === null) {
    return {
      kind: "no_reference",
      tone: "neutral",
      label: "Sin referencia suficiente",
      action: "Revisar manualmente",
      helper: "No se pudo calcular diferencia contra el mayorista.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio,
      hasWholesaleReference,
    };
  }

  if (gapRatio > 0.1) {
    return {
      kind: "above_wholesale_critical",
      tone: "danger",
      label: "Aguiar caro vs mayorista",
      action: "Revisar baja o promo",
      helper: "El precio propio supera por mas de 10% al mejor mayorista.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio,
      hasWholesaleReference,
    };
  }

  if (gapRatio > 0.05) {
    return {
      kind: "above_wholesale_warning",
      tone: "warning",
      label: "Aguiar arriba del mayorista",
      action: "Monitorear / ajustar",
      helper: "El precio propio esta entre 5% y 10% arriba del mayorista.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio,
      hasWholesaleReference,
    };
  }

  if (gapRatio < -0.08) {
    return {
      kind: "margin_opportunity",
      tone: "info",
      label: "Oportunidad de margen",
      action: "Evaluar suba selectiva",
      helper: "Aguiar esta bastante por debajo del mayorista comparable.",
      currentPrice,
      referencePrice,
      referenceSource,
      referenceChannelLabel,
      gapRatio,
      hasWholesaleReference,
    };
  }

  return {
    kind: "competitive",
    tone: "success",
    label: "Competitivo",
    action: "Mantener",
    helper: "Aguiar esta dentro de un rango competitivo vs mayoristas.",
    currentPrice,
    referencePrice,
    referenceSource,
    referenceChannelLabel,
    gapRatio,
    hasWholesaleReference,
  };
}

export function getPriceListSuggestedAction(result: PriceListItemResult) {
  return analyzePriceListDecision(result).action;
}

export function summarizePriceListDecisions(
  results: PriceListItemResult[],
): PriceListDecisionSummary {
  const decisions = results.map(analyzePriceListDecision);

  return {
    aboveWholesale: decisions.filter(
      (decision) =>
        decision.kind === "above_wholesale_critical" ||
        decision.kind === "above_wholesale_warning",
    ).length,
    competitiveWholesale: decisions.filter(
      (decision) => decision.kind === "competitive",
    ).length,
    marginOpportunity: decisions.filter(
      (decision) => decision.kind === "margin_opportunity",
    ).length,
    withoutWholesaleReference: decisions.filter(
      (decision) => !decision.hasWholesaleReference,
    ).length,
    missingOwnPrice: decisions.filter(
      (decision) => decision.kind === "missing_own_price",
    ).length,
  };
}

export function getOwnPriceSourceLabel(result: PriceListItemResult) {
  if (result.ownPrice?.selectedSource === "tokin") {
    return "Tokin/Arcor";
  }

  if (result.ownPrice?.selectedSource === "excel") {
    return "Excel";
  }

  if (
    result.diagnostics?.aguiarPriceNormalization?.status === "normalized" ||
    result.diagnostics?.directAguiar?.status === "matched"
  ) {
    return "Tokin/Arcor";
  }

  if (normalizeOptionalNumber(result.input.currentPrice)) {
    return "Excel";
  }

  return "pendiente";
}

export function getPriceListOwnPrice(result: PriceListItemResult) {
  return (
    normalizeOptionalNumber(result.ownPrice?.selectedPrice) ??
    normalizeOptionalNumber(result.input.currentPrice)
  );
}

export function getPriceListExcelPrice(result: PriceListItemResult) {
  return normalizeOptionalNumber(result.ownPrice?.excelPrice);
}

export function getPriceListTokinPrice(result: PriceListItemResult) {
  return normalizeOptionalNumber(result.ownPrice?.tokinPrice);
}

function getStoreTypeRank(sourcePrice: PriceListSourcePrice) {
  return sourcePrice.storeType === "mayorista" ? 0 : 1;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
