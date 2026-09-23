import type {
  PriceListItemResult,
  PriceListSourcePrice,
} from "@/types/search";
import {
  analyzePriceListCommercial,
  comparePriceListSourcePrices,
  getCommercialComparablePrice,
  getReliableSourcePrices,
  isReliableSourcePrice,
  type PriceListCommercialAnalysis,
} from "./price-list-commercial";
import { getPriceConditionWarning } from "./price-comparison-safety";

export { comparePriceListSourcePrices } from "./price-list-commercial";

export type PriceListDecisionTone =
  | "danger"
  | "warning"
  | "success"
  | "info"
  | "neutral";

export type PriceListDecisionKind =
  | "above_wholesale_critical"
  | "above_wholesale_warning"
  | "below_supplier_cost"
  | "below_target_margin"
  | "cost_pressure"
  | "competitive"
  | "margin_opportunity"
  | "missing_own_price"
  | "retail_only"
  | "weak_match"
  | "outdated_reference"
  | "cost_unverified"
  | "conditional_reference"
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
  commercial: PriceListCommercialAnalysis;
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
  const bestSource = getReliableSourcePrices(sourcePrices)[0] ?? null;

  return {
    ...result,
    sourcePrices,
    bestSource,
    bestPrice: bestSource ? getPriceListComparablePrice(bestSource) : null,
    status:
      sourcePrices.length > 0 ||
      getPriceListOwnPrice(result) ||
      getPriceListTokinPrice(result)
        ? "matched"
        : "not_found",
  };
}

export function getPriceListComparablePrice(price: PriceListSourcePrice) {
  return getCommercialComparablePrice(price);
}

export function getBestPriceListSourceByType(
  result: PriceListItemResult,
  storeType: PriceListSourcePrice["storeType"],
) {
  return getReliableSourcePrices(result.sourcePrices, storeType)[0];
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
  now = Date.now(),
): PriceListDecisionAnalysis {
  const commercial = analyzePriceListCommercial(result, undefined, now);
  const currentPrice = commercial.excelSalePrice;
  const bestWholesale = commercial.bestWholesale;
  const referenceSource = bestWholesale ?? commercial.bestRetail;
  const referencePrice = referenceSource
    ? getPriceListComparablePrice(referenceSource)
    : null;
  const gapRatio = calculatePriceListGapRatio(currentPrice, referencePrice);
  const hasWholesaleReference = Boolean(bestWholesale);
  const referenceChannelLabel: PriceListDecisionAnalysis["referenceChannelLabel"] =
    referenceSource?.storeType === "mayorista"
      ? "mayorista"
      : referenceSource?.storeType === "minorista"
        ? "minorista"
        : "mercado";
  const shared = {
    currentPrice,
    referencePrice,
    referenceSource,
    referenceChannelLabel,
    gapRatio,
    hasWholesaleReference,
    commercial,
  };

  if (!currentPrice) {
    return {
      kind: "missing_own_price",
      tone: "warning",
      label: "Falta precio Excel",
      action: "Cargar precio en Excel",
      helper:
        "Falta el precio de venta del Excel para evaluar la posicion comercial. Tokin no lo reemplaza.",
      ...shared,
      gapRatio: null,
    };
  }

  if (
    currentPrice &&
    commercial.supplierCostStatus === "outdated"
  ) {
    return {
      ...shared, kind: "outdated_reference", tone: "neutral",
      label: "Costo Tokin sin vigencia", action: "Actualizar costo proveedor",
      helper: commercial.supplierCostReason,
    };
  }

  if (
    currentPrice &&
    commercial.supplierCostComparable &&
    commercial.grossMarginRatio !== null &&
    commercial.grossMarginRatio < 0
  ) {
    return {
      kind: "below_supplier_cost",
      tone: "danger",
      label: "Venta neta debajo del costo",
      action: "Corregir precio o costo",
      helper:
        "La venta Excel neta de IVA es menor que el costo ajustado con las condiciones confirmadas. No usar una baja de mercado.",
      ...shared,
    };
  }

  if (!referenceSource || !referencePrice) {
    if (result.sourcePrices.some(isReliableSourcePrice) || commercial.supplierCostStatus === "outdated") {
      return {
        ...shared,
        kind: "outdated_reference",
        tone: "neutral",
        label: "Referencias sin vigencia",
        action: "Actualizar referencias",
        helper: "Los precios tienen mas de 36 horas o no tienen fecha verificable. Se conservan como detalle, sin sugerir cambios de precio.",
      };
    }
    if (result.sourcePrices.length > 0) {
      return {
        kind: "weak_match",
        tone: "neutral",
        label: "Match a revisar",
        action: "Revisar equivalencia",
        helper:
          "No hay coincidencias con precio y confianza suficientes; validar las referencias antes de decidir.",
        ...shared,
      };
    }

    if (
      commercial.grossMarginRatio !== null &&
      commercial.grossMarginRatio < commercial.targetGrossMarginRatio
    ) {
      return {
        kind: "below_target_margin",
        tone: "warning",
        label: "Margen debajo del objetivo",
        action: "Revisar margen / costo",
        helper:
          "El margen ajustado estimado no alcanza el objetivo. Falta una referencia mayorista para decidir el precio.",
        ...shared,
        referencePrice: null,
        referenceSource: null,
        gapRatio: null,
      };
    }

    return {
      kind: "no_reference",
      tone: "neutral",
      label: "Sin referencia comparable",
      action: "Buscar referencia mayorista",
      helper: "No hay precio mayorista ni minorista comparable para este articulo.",
      ...shared,
      referencePrice: null,
      referenceSource: null,
      gapRatio: null,
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
      ...shared,
    };
  }

  if (!commercial.economicsConfirmed) {
    return {
      ...shared, kind: "cost_unverified", tone: "neutral",
      label: "Costo final sin confirmar", action: "Completar condiciones de costo",
      helper: commercial.economicsReason + " La diferencia con el mayorista es de precios publicados, no de rentabilidad.",
    };
  }

  const condition = getPriceConditionWarning(referenceSource);
  if (condition) {
    return {
      ...shared, kind: "conditional_reference", tone: "neutral",
      label: "Precio mayorista condicionado", action: "Validar promo o compra minima",
      helper: `La diferencia usa un precio condicionado: ${condition}. Confirmar que aplica antes de modificar el precio de venta.`,
    };
  }

  if (gapRatio === null) {
    return {
      kind: "no_reference",
      tone: "neutral",
      label: "Sin referencia suficiente",
      action: "Revisar manualmente",
      helper: "No se pudo calcular diferencia contra el mayorista.",
      ...shared,
    };
  }

  if (
    gapRatio > 0.05 &&
    commercial.minimumPriceForTargetMargin !== null &&
    referencePrice < commercial.minimumPriceForTargetMargin
  ) {
    return {
      kind: "cost_pressure",
      tone: "danger",
      label: "Costo limita la competencia",
      action: "Negociar costo / revisar match",
      helper:
        "Igualar al mejor mayorista dejaría el precio debajo del piso de margen objetivo. No sugerir una baja automática.",
      ...shared,
    };
  }

  if (gapRatio > 0.1) {
    return {
      kind: "above_wholesale_critical",
      tone: "danger",
      label: "Excel caro vs mayorista",
      action: "Revisar baja o promo",
      helper: "El precio del Excel supera por mas de 10% al mejor mayorista.",
      ...shared,
    };
  }

  if (gapRatio > 0.05) {
    return {
      kind: "above_wholesale_warning",
      tone: "warning",
      label: "Excel arriba del mayorista",
      action: "Monitorear / ajustar",
      helper: "El precio del Excel esta entre 5% y 10% arriba del mayorista.",
      ...shared,
    };
  }

  if (
    commercial.grossMarginRatio !== null &&
    commercial.grossMarginRatio < commercial.targetGrossMarginRatio
  ) {
    return {
      kind: "below_target_margin",
      tone: "warning",
      label: "Margen debajo del objetivo",
      action: "Revisar margen / costo",
      helper:
        "El precio es competitivo, pero el margen ajustado estimado no alcanza el objetivo configurado.",
      ...shared,
    };
  }

  if (gapRatio < -0.08) {
    return {
      kind: "margin_opportunity",
      tone: "info",
      label: "Oportunidad de margen",
      action: "Evaluar suba selectiva",
      helper: "El precio del Excel esta bastante por debajo del mayorista comparable.",
      ...shared,
    };
  }

  return {
    kind: "competitive",
    tone: "success",
    label: "Competitivo",
    action: "Mantener",
    helper: "El precio del Excel esta dentro de un rango competitivo vs mayoristas.",
    ...shared,
  };
}

export function getPriceListSuggestedAction(result: PriceListItemResult) {
  return analyzePriceListDecision(result).action;
}

export function summarizePriceListDecisions(
  results: PriceListItemResult[],
): PriceListDecisionSummary {
  const decisions = results.map((result) => analyzePriceListDecision(result));

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
  if (getPriceListExcelPrice(result)) {
    return "Excel";
  }

  return "Sin precio Excel";
}

export function getPriceListOwnPrice(result: PriceListItemResult) {
  if (result.ownPrice) {
    return normalizeOptionalNumber(result.ownPrice.excelPrice);
  }

  return normalizeOptionalNumber(result.input.currentPrice);
}

export function getPriceListExcelPrice(result: PriceListItemResult) {
  return result.ownPrice
    ? normalizeOptionalNumber(result.ownPrice.excelPrice)
    : normalizeOptionalNumber(result.input.currentPrice);
}

export function getPriceListTokinPrice(result: PriceListItemResult) {
  return normalizeOptionalNumber(result.ownPrice?.tokinPrice);
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
