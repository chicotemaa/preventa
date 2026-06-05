import { extractProductPresentation } from "./presentation.js";
import type { ProductSearchResult } from "./types.js";

export type PriceComparable = {
  price: number;
  comparisonPrice?: number | null;
};

export type UnitPricingFields = {
  comparisonPrice: number;
  packageQuantity: number | null;
  packageLabel: string | null;
};

type DetectedPackage = {
  quantity: number;
  label: string;
};

const MAX_REASONABLE_PACKAGE_QUANTITY = 200;
const MAX_BARE_PRESENTATION_PACKAGE_QUANTITY = 24;
const MIN_BARE_PRESENTATION_UNIT_PRICE = 150;
const PACKAGE_WORD =
  "(?:pack|caja|cajon|display|bulto|fardo|bolsa|paquete|maple)";

export function withUnitPricing(
  product: ProductSearchResult,
  contextText?: string,
): ProductSearchResult {
  return {
    ...product,
    ...calculateUnitPricing(product.price, contextText ?? product.rawName ?? ""),
  };
}

export function calculateUnitPricing(
  price: number,
  text: string,
): UnitPricingFields {
  const detectedPackage = detectPackage(text, price);

  if (detectedPackage) {
    return {
      comparisonPrice: roundMoney(price / detectedPackage.quantity),
      packageQuantity: detectedPackage.quantity,
      packageLabel: `${detectedPackage.label} x ${detectedPackage.quantity}`,
    };
  }

  return {
    comparisonPrice: roundMoney(price),
    packageQuantity: null,
    packageLabel: null,
  };
}

export function getComparisonPrice(price: PriceComparable) {
  return normalizeComparablePrice(price.comparisonPrice) ?? price.price;
}

function detectPackage(text: string, price: number): DetectedPackage | null {
  const normalizedText = normalizePackagingText(text);
  const presentation = extractProductPresentation(text);
  const presentationPackageCount = presentation.packageCount;
  const label = findPackageLabel(normalizedText) ?? "pack";

  if (
    presentationPackageCount !== null &&
    isValidPackageQuantity(presentationPackageCount) &&
    shouldUsePresentationPackageQuantity(
      normalizedText,
      presentationPackageCount,
      presentation.hasPowderSignal,
      price,
    )
  ) {
    return {
      quantity: presentationPackageCount,
      label,
    };
  }

  const unitWord = "(?:unid(?:ad)?(?:es)?|uni|uds?|u)";
  const patterns = [
    new RegExp(`\\b${PACKAGE_WORD}\\s*(?:x|por|de)?\\s*(\\d{1,3})\\b`, "i"),
    new RegExp(`\\b(\\d{1,3})\\s*${unitWord}\\s*(?:por|x)\\s*${PACKAGE_WORD}\\b`, "i"),
    new RegExp(`\\b(?:cantidad|cant|contenido)\\s*(?:por|x)?\\s*${PACKAGE_WORD}\\s*(\\d{1,3})\\b`, "i"),
    new RegExp(`\\b${PACKAGE_WORD}\\s*(?:de|por|x)?\\s*(\\d{1,3})\\s*${unitWord}\\b`, "i"),
    new RegExp(`\\b(?:x|por|de)\\s*(\\d{1,3})\\s*${unitWord}\\b`, "i"),
    new RegExp(`\\bx\\s*(\\d{1,3})\\b(?=\\s+\\d|\\s*${unitWord})`, "i"),
    new RegExp(`\\b(\\d{1,3})\\s*(?:x|\\*)\\s*${unitWord}\\b`, "i"),
    new RegExp(`\\b(\\d{1,3})\\s*${unitWord}\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    const quantity = match?.[1] ? Number(match[1]) : null;

    if (quantity !== null && isValidPackageQuantity(quantity)) {
      return {
        quantity,
        label,
      };
    }
  }

  return null;
}

function shouldUsePresentationPackageQuantity(
  normalizedText: string,
  quantity: number | null,
  hasPowderSignal: boolean,
  price: number,
) {
  if (!quantity) {
    return false;
  }

  if (hasExplicitPackageWord(normalizedText) || hasPowderSignal) {
    return true;
  }

  const unitPrice = price / quantity;

  return (
    quantity <= MAX_BARE_PRESENTATION_PACKAGE_QUANTITY ||
    /\b(sobre|sobres|sachet|stick)\b/i.test(normalizedText)
  ) && unitPrice >= MIN_BARE_PRESENTATION_UNIT_PRICE;
}

function hasExplicitPackageWord(normalizedText: string) {
  return new RegExp(`\\b${PACKAGE_WORD}\\b`, "i").test(normalizedText);
}

function findPackageLabel(normalizedText: string) {
  const match = normalizedText.match(new RegExp(`\\b${PACKAGE_WORD}\\b`, "i"));
  const label = match?.[0];

  if (!label) {
    return null;
  }

  if (label === "cajon") {
    return "cajon";
  }

  return label;
}

function isValidPackageQuantity(value: number | null | undefined) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 1 &&
    value <= MAX_REASONABLE_PACKAGE_QUANTITY
  );
}

function normalizeComparablePrice(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizePackagingText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,*\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
