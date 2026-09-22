import type { PriceListItemResult } from "@/types/search";
import type { PriceListDecisionAnalysis } from "./price-list-decision";
import { getReliableSourcePrices, getCommercialComparablePrice } from "./price-list-commercial";
import { activityDateIsRecent, parseBusinessActivity } from "./business-activity";

export type PricingImpact = {
  monthlyUnits: number | null;
  monthlySales: number | null;
  monthlyContribution: number | null;
  priceExposure: number | null;
  referencePrice: number | null;
  referenceCount: number;
  referenceLabel: string;
  stockCoverDays: number | null;
  stockValue: number | null;
  stockUnits: number | null;
  reason: string;
};

// Published-price scenario at a constant volume, not a sales-loss forecast.
export function analyzePricingImpact(result: PriceListItemResult, decision: PriceListDecisionAnalysis, now = Date.now()): PricingImpact {
  const activity = parseBusinessActivity(result.input.businessActivity);
  const salesReady = activity?.unitsSold !== undefined && activity.periodDays !== undefined &&
    activityDateIsRecent(activity.salesThrough, 45, now);
  const stockReady = activity?.stockUnits !== undefined && activityDateIsRecent(activity.stockAsOf, 7, now);
  const monthlyUnits = salesReady ? activity!.unitsSold! * 30 / activity!.periodDays! : null;
  const commercial = decision.commercial;
  const bySource = new Map<string, number>();
  for (const source of getReliableSourcePrices(result.sourcePrices, "mayorista", now)) {
    const conditional = /promo|oferta|descuento|segunda|bulto|pack|caja|\b\d+\s*x\s*\d+\b/i;
    const selectedPrice = getCommercialComparablePrice(source);
    if (source.availability !== "in_stock" || conditional.test(source.priceCondition ?? "") ||
      source.alternatePrices?.some(alternate => conditional.test(alternate.label) &&
        Math.abs((alternate.comparisonPrice ?? alternate.price) - selectedPrice) < 0.01)) continue;
    if (!bySource.has(source.sourceId)) bySource.set(source.sourceId, getCommercialComparablePrice(source));
  }
  const values = [...bySource.values()].sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const referencePrice = values.length ? (values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2) : null;
  const priceExposure = monthlyUnits !== null && commercial.excelSalePrice !== null && referencePrice !== null
    ? Math.abs(commercial.excelSalePrice - referencePrice) * monthlyUnits : null;
  return {
    monthlyUnits,
    monthlySales: monthlyUnits !== null && commercial.excelSalePrice !== null ? commercial.excelSalePrice * monthlyUnits : null,
    monthlyContribution: monthlyUnits !== null && commercial.grossProfitAmount !== null ? commercial.grossProfitAmount * monthlyUnits : null,
    priceExposure, referencePrice, referenceCount: values.length,
    referenceLabel: values.length > 1 ? `Mediana de ${values.length} mayoristas` : values.length === 1 ? "Un solo mayorista; cobertura limitada" : "Sin mayorista regular con stock confirmado",
    stockUnits: stockReady ? activity!.stockUnits! : null,
    stockCoverDays: stockReady && monthlyUnits !== null && monthlyUnits > 0 ? activity!.stockUnits! / (monthlyUnits / 30) : null,
    stockValue: stockReady && commercial.effectiveUnitCost !== null ? activity!.stockUnits! * commercial.effectiveUnitCost : null,
    reason: !salesReady ? "Faltan ventas en unidades, dias del periodo o fecha reciente (hasta 45 dias)."
      : commercial.excelSalePrice === null ? "Falta precio de venta Excel."
      : referencePrice === null ? "Sin referencia vigente, regular y con stock confirmado. No se estima exposicion."
      : "Escenario a 30 dias con volumen constante y precios publicados. No es perdida de ventas ni ganancia asegurada; validar condiciones e impuestos.",
  };
}

export function comparePricingImpact(first: PricingImpact, second: PricingImpact) {
  if (first.priceExposure === null || second.priceExposure === null) {
    return Number(first.priceExposure === null) - Number(second.priceExposure === null);
  }
  return second.priceExposure - first.priceExposure;
}
