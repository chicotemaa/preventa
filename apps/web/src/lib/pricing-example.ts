import type { CostConditions } from "./cost-structure";
import type { PriceListItemResult, PriceListSourcePrice } from "@/types/search";

// Educational data only. Never passed to persistence, catalog or supplier APIs.
export function buildPricingExample(now = Date.now()) {
  const observedAt = new Date(now).toISOString();
  const costs: CostConditions = {
    version: 1, purchaseTaxBasis: "excluded", purchaseVatPercent: 0,
    recoverableVatPercent: 0, saleTaxBasis: "excluded", saleVatPercent: 0,
    discountPercent: 0, bonusPercent: 0, freightPerUnit: 0,
    financingPercent: 0, otherCostsPerUnit: 0, targetMarginPercent: 20,
    confirmedAt: observedAt,
  };
  function source(price: number, patch: Partial<PriceListSourcePrice> = {}): PriceListSourcePrice {
    return { sourceId: "ejemplo-mayorista", storeName: "Mayorista simulado A", storeType: "mayorista",
      price, comparisonPrice: price, currency: "ARS", productName: "Alfajor ejemplo 60 g",
      productUrl: null, confidenceScore: 95, observedAt, availability: "in_stock", ...patch };
  }
  function row(n: number, description: string, sale: number | null, supplier: number, prices: PriceListSourcePrice[]): PriceListItemResult {
    return {
      input: { rowNumber: n, code: `DEMO-${String(n).padStart(2, "0")}`, rubro: "EJEMPLO SIMULADO", subrubro: "Alfajores", description, uxb: "40", currentPrice: sale ?? undefined },
      ownPrice: { excelPrice: sale, tokinPrice: supplier, tokinObservedAt: observedAt,
        selectedPrice: sale, selectedSource: sale === null ? null : "excel",
        excelVsTokinGapRatio: sale === null ? null : (sale - supplier) / supplier },
      costConditions: { ...costs }, queryUsed: null, status: "matched", bestPrice: null, bestSource: null,
      sourcePrices: prices, matchedCount: prices.length,
    };
  }
  return { searchedAt: observedAt, results: [
    row(1, "Ejemplo 01 - Precio alto", 1200, 800, [source(1000), source(1100, { sourceId: "ejemplo-b", storeName: "Mayorista simulado B" })]),
    row(2, "Ejemplo 02 - Precio alineado", 1000, 750, [source(1000)]),
    row(3, "Ejemplo 03 - Posible oportunidad", 1000, 650, [source(1200)]),
    row(4, "Ejemplo 04 - Costo limita la baja", 1200, 1100, [source(1000)]),
    row(5, "Ejemplo 05 - Unidad y bulto de 40", 500, 13319.47 / 40, [source(19000, { comparisonPrice: 475, packageQuantity: 40, packageLabel: "Bulto x 40" })]),
    row(6, "Ejemplo 06 - Falta venta Excel", null, 800, [source(1000)]),
    row(7, "Ejemplo 07 - Mercado antiguo", 1200, 800, [source(1000, { observedAt: new Date(now - 5 * 86400000).toISOString() })]),
    row(8, "Ejemplo 08 - Oferta condicionada", 1000, 500, [source(700, { priceCondition: "Promo 2x1" })]),
    row(9, "Ejemplo 09 - Solo minorista", 1200, 800, [source(900, { storeType: "minorista", storeName: "Minorista simulado" })]),
    row(10, "Ejemplo 10 - Equivalencia dudosa", 1200, 800, [source(700, { confidenceScore: 45 })]),
  ] };
}
