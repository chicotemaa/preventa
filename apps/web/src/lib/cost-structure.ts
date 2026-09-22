export type TaxBasis = "included" | "excluded";

export type CostConditions = {
  version: 1;
  purchaseTaxBasis: TaxBasis;
  purchaseVatPercent: number;
  recoverableVatPercent: number;
  saleTaxBasis: TaxBasis;
  saleVatPercent: number;
  discountPercent: number;
  bonusPercent: number;
  freightPerUnit: number;
  financingPercent: number;
  otherCostsPerUnit: number;
  targetMarginPercent: number;
  confirmedAt: string;
};

export type CostBreakdown = {
  supplierNet: number;
  discountAmount: number;
  bonusAmount: number;
  goodsNet: number;
  nonRecoverableVat: number;
  freight: number;
  financing: number;
  otherCosts: number;
  effectiveUnitCost: number;
  netSalePrice: number | null;
  contributionAmount: number | null;
  markupRatio: number | null;
  marginRatio: number | null;
  targetNetSalePrice: number;
  targetExcelPrice: number;
};

const ranges = {
  purchaseVatPercent: [0, 100], recoverableVatPercent: [0, 100],
  saleVatPercent: [0, 100], discountPercent: [0, 99.99],
  bonusPercent: [0, 99.99], freightPerUnit: [0, 1e9],
  financingPercent: [0, 100], otherCostsPerUnit: [0, 1e9],
  targetMarginPercent: [0, 89.99],
} as const;

// Unknown or incomplete conditions never mean zero adjustments or tax exemption.
export function parseCostConditions(value: unknown): CostConditions | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 ||
      !["included", "excluded"].includes(String(v.purchaseTaxBasis)) ||
      !["included", "excluded"].includes(String(v.saleTaxBasis)) ||
      typeof v.confirmedAt !== "string" || !Number.isFinite(Date.parse(v.confirmedAt))) return null;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const n = v[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) return null;
  }
  return Object.fromEntries([
    ["version", 1], ["purchaseTaxBasis", v.purchaseTaxBasis], ["saleTaxBasis", v.saleTaxBasis],
    ["confirmedAt", v.confirmedAt], ...Object.keys(ranges).map((key) => [key, v[key]]),
  ]) as CostConditions;
}

export function calculateCostStructure(
  supplierPrice: number | null | undefined,
  salePrice: number | null | undefined,
  input: unknown,
): CostBreakdown | null {
  const c = parseCostConditions(input);
  if (!c || !supplierPrice || !Number.isFinite(supplierPrice) || supplierPrice <= 0) return null;
  const supplierNet = c.purchaseTaxBasis === "included"
    ? supplierPrice / (1 + c.purchaseVatPercent / 100) : supplierPrice;
  const discountAmount = supplierNet * c.discountPercent / 100;
  // Monetary bonification is sequential, not free units or a second price discount.
  const bonusAmount = (supplierNet - discountAmount) * c.bonusPercent / 100;
  const goodsNet = supplierNet - discountAmount - bonusAmount;
  const nonRecoverableVat = goodsNet * c.purchaseVatPercent / 100 * (1 - c.recoverableVatPercent / 100);
  const financing = (goodsNet + nonRecoverableVat) * c.financingPercent / 100;
  const effectiveUnitCost = goodsNet + nonRecoverableVat + financing + c.freightPerUnit + c.otherCostsPerUnit;
  const netSalePrice = salePrice && Number.isFinite(salePrice) && salePrice > 0
    ? (c.saleTaxBasis === "included" ? salePrice / (1 + c.saleVatPercent / 100) : salePrice) : null;
  const contributionAmount = netSalePrice === null ? null : netSalePrice - effectiveUnitCost;
  const targetNetSalePrice = effectiveUnitCost / (1 - c.targetMarginPercent / 100);
  const targetExcelPrice = targetNetSalePrice * (c.saleTaxBasis === "included" ? 1 + c.saleVatPercent / 100 : 1);
  if (effectiveUnitCost <= 0 || ![effectiveUnitCost, targetNetSalePrice, targetExcelPrice].every(Number.isFinite)) return null;
  return {
    supplierNet, discountAmount, bonusAmount, goodsNet, nonRecoverableVat,
    freight: c.freightPerUnit, financing, otherCosts: c.otherCostsPerUnit,
    effectiveUnitCost, netSalePrice, contributionAmount,
    markupRatio: contributionAmount === null ? null : contributionAmount / effectiveUnitCost,
    marginRatio: contributionAmount === null || netSalePrice === null ? null : contributionAmount / netSalePrice,
    targetNetSalePrice, targetExcelPrice,
  };
}
