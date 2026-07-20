import type {
  PriceListInputItem,
  PriceListMatchDiagnostics,
  PriceListOwnPrice,
  PriceListSourcePrice,
} from "@/types/search";

export const PRICE_LIST_STORAGE_VERSION = 4;
const SUPPORTED_STORAGE_VERSIONS = new Set([2, 3, PRICE_LIST_STORAGE_VERSION]);

export type StoredPriceListDimensions = Pick<
  PriceListInputItem,
  "business" | "segment" | "subrubro" | "line" | "uxb"
>;

export type StoredPriceListDetail = {
  sourcePrices: PriceListSourcePrice[];
  ownPrice: PriceListOwnPrice | null;
  diagnostics: PriceListMatchDiagnostics | null;
  dimensions: StoredPriceListDimensions;
  isLegacy: boolean;
};

export function serializeStoredPriceListDetail({
  sourcePrices,
  ownPrice,
  diagnostics,
  input,
}: {
  sourcePrices: PriceListSourcePrice[];
  ownPrice?: PriceListOwnPrice;
  diagnostics?: PriceListMatchDiagnostics;
  input: PriceListInputItem;
}) {
  return {
    version: PRICE_LIST_STORAGE_VERSION,
    sourcePrices: sourcePrices.map(serializeSourcePrice),
    ownPrice: ownPrice ? serializeOwnPrice(ownPrice) : null,
    diagnostics: diagnostics ?? null,
    dimensions: {
      business: input.business ?? null,
      segment: input.segment ?? null,
      subrubro: input.subrubro ?? null,
      line: input.line ?? null,
      uxb: input.uxb ?? null,
    },
  };
}

function serializeOwnPrice(ownPrice: PriceListOwnPrice) {
  return {
    ...ownPrice,
    selectionReason:
      ownPrice.selectionReason ??
      (ownPrice.excelPrice
        ? ownPrice.tokinPrice
          ? "excel_priority"
          : "excel_only"
        : ownPrice.tokinPrice
          ? "tokin_fallback"
          : "missing"),
  };
}

export function parseStoredPriceListDetail(value: unknown): StoredPriceListDetail {
  if (Array.isArray(value)) {
    return {
      sourcePrices: parseSourcePrices(value),
      ownPrice: null,
      diagnostics: null,
      dimensions: {},
      isLegacy: true,
    };
  }

  if (!value || typeof value !== "object") {
    return emptyStoredDetail();
  }

  const payload = value as {
    version?: unknown;
    sourcePrices?: unknown;
    ownPrice?: unknown;
    diagnostics?: unknown;
    dimensions?: unknown;
  };

  return {
    sourcePrices: parseSourcePrices(payload.sourcePrices),
    ownPrice: parseOwnPrice(payload.ownPrice),
    diagnostics: parseDiagnostics(payload.diagnostics),
    dimensions: parseDimensions(payload.dimensions),
    isLegacy:
      typeof payload.version !== "number" ||
      !SUPPORTED_STORAGE_VERSIONS.has(payload.version),
  };
}

function emptyStoredDetail(): StoredPriceListDetail {
  return {
    sourcePrices: [],
    ownPrice: null,
    diagnostics: null,
    dimensions: {},
    isLegacy: true,
  };
}

function parseDiagnostics(value: unknown): PriceListMatchDiagnostics | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const diagnostics = value as Partial<PriceListMatchDiagnostics>;

  if (
    !Array.isArray(diagnostics.queriesTried) ||
    !Array.isArray(diagnostics.queryDiagnostics)
  ) {
    return null;
  }

  return diagnostics as PriceListMatchDiagnostics;
}

function parseDimensions(value: unknown): StoredPriceListDimensions {
  if (!value || typeof value !== "object") {
    return {};
  }

  const dimensions = value as Record<string, unknown>;

  return {
    business: parseOptionalString(dimensions.business),
    segment: parseOptionalString(dimensions.segment),
    subrubro: parseOptionalString(dimensions.subrubro),
    line: parseOptionalString(dimensions.line),
    uxb: parseOptionalString(dimensions.uxb),
  };
}

function parseOwnPrice(value: unknown): PriceListOwnPrice | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const ownPrice = value as Record<string, unknown>;
  const excelPrice = parseOptionalNumber(ownPrice.excelPrice);
  const tokinPrice = parseOptionalNumber(ownPrice.tokinPrice);
  const selectedPrice = parseOptionalNumber(ownPrice.selectedPrice);
  const selectedSource =
    ownPrice.selectedSource === "tokin" || ownPrice.selectedSource === "excel"
      ? ownPrice.selectedSource
      : null;
  const selectionReason = parseSelectionReason(
    ownPrice.selectionReason,
    excelPrice,
    tokinPrice,
  );

  if (!excelPrice && !tokinPrice && !selectedPrice) {
    return null;
  }

  return {
    excelPrice,
    tokinPrice,
    selectedPrice,
    selectedSource,
    selectionReason,
    excelVsTokinGapRatio:
      typeof ownPrice.excelVsTokinGapRatio === "number" &&
      Number.isFinite(ownPrice.excelVsTokinGapRatio)
        ? ownPrice.excelVsTokinGapRatio
        : null,
  };
}

function parseSelectionReason(
  value: unknown,
  excelPrice: number | null,
  tokinPrice: number | null,
) {
  if (
    value === "excel_priority" ||
    value === "excel_only" ||
    value === "tokin_fallback" ||
    value === "missing"
  ) {
    return value;
  }

  if (excelPrice) {
    return tokinPrice ? "excel_priority" : "excel_only";
  }

  return tokinPrice ? "tokin_fallback" : "missing";
}

function parseSourcePrices(value: unknown): PriceListSourcePrice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const sourcePrice = item as Partial<PriceListSourcePrice>;

    if (
      !sourcePrice.sourceId ||
      !sourcePrice.storeName ||
      !sourcePrice.productName ||
      typeof sourcePrice.price !== "number" ||
      !Number.isFinite(sourcePrice.price)
    ) {
      return [];
    }

    return [
      {
        sourceId: sourcePrice.sourceId,
        storeName: sourcePrice.storeName,
        storeType: sourcePrice.storeType === "minorista" ? "minorista" : "mayorista",
        sourceUrl: sourcePrice.sourceUrl ?? null,
        dataOrigin: sourcePrice.dataOrigin,
        sourceScope: sourcePrice.sourceScope,
        price: sourcePrice.price,
        comparisonPrice:
          typeof sourcePrice.comparisonPrice === "number" &&
          Number.isFinite(sourcePrice.comparisonPrice)
            ? sourcePrice.comparisonPrice
            : sourcePrice.price,
        priceCondition:
          typeof sourcePrice.priceCondition === "string"
            ? sourcePrice.priceCondition
            : null,
        alternatePrices: parseAlternatePrices(sourcePrice.alternatePrices),
        packageQuantity:
          typeof sourcePrice.packageQuantity === "number" &&
          Number.isFinite(sourcePrice.packageQuantity)
            ? sourcePrice.packageQuantity
            : null,
        packageLabel:
          typeof sourcePrice.packageLabel === "string"
            ? sourcePrice.packageLabel
            : null,
        category:
          typeof sourcePrice.category === "string"
            ? sourcePrice.category
            : undefined,
        currency: "ARS",
        productName: sourcePrice.productName,
        productUrl: sourcePrice.productUrl ?? null,
        confidenceScore:
          typeof sourcePrice.confidenceScore === "number" &&
          Number.isFinite(sourcePrice.confidenceScore)
            ? sourcePrice.confidenceScore
            : 0,
      },
    ];
  });
}

function parseAlternatePrices(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const alternatePrice = item as Record<string, unknown>;

    if (
      typeof alternatePrice.label !== "string" ||
      typeof alternatePrice.price !== "number" ||
      !Number.isFinite(alternatePrice.price)
    ) {
      return [];
    }

    return [
      {
        label: alternatePrice.label,
        price: alternatePrice.price,
        comparisonPrice:
          typeof alternatePrice.comparisonPrice === "number" &&
          Number.isFinite(alternatePrice.comparisonPrice)
            ? alternatePrice.comparisonPrice
            : alternatePrice.price,
      },
    ];
  });
}

function serializeSourcePrice(sourcePrice: PriceListSourcePrice) {
  return {
    sourceId: sourcePrice.sourceId,
    storeName: sourcePrice.storeName,
    storeType: sourcePrice.storeType,
    sourceUrl: sourcePrice.sourceUrl ?? null,
    dataOrigin: sourcePrice.dataOrigin ?? null,
    sourceScope: sourcePrice.sourceScope ?? null,
    price: sourcePrice.price,
    comparisonPrice: sourcePrice.comparisonPrice ?? sourcePrice.price,
    priceCondition: sourcePrice.priceCondition ?? null,
    alternatePrices: sourcePrice.alternatePrices ?? [],
    packageQuantity: sourcePrice.packageQuantity ?? null,
    packageLabel: sourcePrice.packageLabel ?? null,
    category: sourcePrice.category ?? null,
    currency: sourcePrice.currency,
    productName: sourcePrice.productName,
    productUrl: sourcePrice.productUrl ?? null,
    confidenceScore: sourcePrice.confidenceScore,
  };
}

function parseOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
