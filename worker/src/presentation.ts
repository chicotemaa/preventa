const PRESENTATION_MISSING_PENALTY = 28;
const PRESENTATION_AMOUNT_TOLERANCE = 0.1;

export type PresentationFamily = "weight" | "liquid" | "unit" | "unknown";
export type PresentationUnit = "g" | "ml" | "u";

export type ProductPresentation = {
  family: PresentationFamily;
  unit: PresentationUnit | null;
  amount: number | null;
  packageCount: number | null;
  totalAmount: number | null;
  hasExplicitPresentation: boolean;
  hasPowderSignal: boolean;
  hasLiquidSignal: boolean;
};

export function applyPresentationScore(
  baseScore: number,
  inputText: string,
  productText: string,
) {
  const inputPresentation = extractProductPresentation(inputText);
  const allowsWeightLiquidCompatibility = shouldAllowWeightLiquidCompatibility(
    inputText,
    productText,
  );

  if (
    !inputPresentation.hasExplicitPresentation &&
    !inputPresentation.hasPowderSignal &&
    !inputPresentation.hasLiquidSignal
  ) {
    return baseScore;
  }

  const productPresentation = extractProductPresentation(productText);
  const compatibility = comparePresentations(
    inputPresentation,
    productPresentation,
    allowsWeightLiquidCompatibility,
  );

  if (!compatibility.compatible) {
    return 0;
  }

  return Math.max(0, baseScore - compatibility.penalty);
}

function comparePresentations(
  input: ProductPresentation,
  product: ProductPresentation,
  allowsWeightLiquidCompatibility: boolean,
) {
  if (
    input.hasPowderSignal &&
    product.family === "liquid" &&
    !allowsWeightLiquidCompatibility
  ) {
    return { compatible: false, penalty: 0 };
  }

  if (
    input.hasLiquidSignal &&
    product.family === "weight" &&
    !allowsWeightLiquidCompatibility
  ) {
    return { compatible: false, penalty: 0 };
  }

  const hasWeightLiquidMismatch =
    (input.family === "weight" && product.family === "liquid") ||
    (input.family === "liquid" && product.family === "weight");

  if (
    input.family !== "unknown" &&
    product.family !== "unknown" &&
    input.family !== product.family &&
    !(hasWeightLiquidMismatch && allowsWeightLiquidCompatibility)
  ) {
    return { compatible: false, penalty: 0 };
  }

  if (input.packageCount && input.packageCount > 1) {
    return comparePackPresentation(input, product);
  }

  if (!input.amount) {
    return { compatible: true, penalty: 0 };
  }

  if (!product.amount) {
    return {
      compatible: product.family === "unknown",
      penalty: product.family === "unknown" ? PRESENTATION_MISSING_PENALTY : 0,
    };
  }

  return {
    compatible: amountsAreClose(input.amount, product.amount),
    penalty: 0,
  };
}

function comparePackPresentation(
  input: ProductPresentation,
  product: ProductPresentation,
) {
  if (product.packageCount && product.packageCount > 1) {
    const countMatches = product.packageCount === input.packageCount;
    const amountMatches =
      !input.amount ||
      !product.amount ||
      amountsAreClose(input.amount, product.amount);

    return {
      compatible: countMatches && amountMatches,
      penalty: 0,
    };
  }

  if (input.totalAmount && product.amount) {
    if (input.amount && amountsAreClose(input.amount, product.amount)) {
      return {
        compatible: true,
        penalty: 6,
      };
    }

    return {
      compatible: amountsAreClose(input.totalAmount, product.amount),
      penalty: 0,
    };
  }

  return {
    compatible: false,
    penalty: 0,
  };
}

export function extractProductPresentation(value: string): ProductPresentation {
  const normalizedValue = normalizePresentationText(value);
  const unitPattern =
    "(grs?|g|kg|ml|cc|lts?|lt|l|unid(?:ad)?(?:es)?|uni|uds?|u)";
  const packMatch = normalizedValue.match(
    new RegExp(
      `\\b(\\d+(?:[,.]\\d+)?)\\s*(?:x|por|\\*)\\s*(\\d+(?:[,.]\\d+)?)\\s*${unitPattern}\\b`,
      "i",
    ),
  );
  const singleMatch = normalizedValue.match(
    new RegExp(`\\b(\\d+(?:[,.]\\d+)?)\\s*${unitPattern}\\b`, "i"),
  );
  const hasPowderSignal =
    /\b(pv|polvo|sobre|sobres|jugo polvo|jugo en polvo)\b/i.test(
      normalizedValue,
    );
  const hasLiquidSignal = /\b(listo|bebida|liquido|jugo listo)\b/i.test(
    normalizedValue,
  );

  if (packMatch?.[1] && packMatch[2] && packMatch[3]) {
    const packageCount = parsePresentationNumber(packMatch[1]);
    const amount = parsePresentationNumber(packMatch[2]);
    const unit = normalizePresentationUnit(packMatch[3]);

    if (packageCount && amount && unit) {
      const baseAmount = convertPresentationAmount(amount, unit);

      return {
        family: getPresentationFamily(unit),
        unit: getBasePresentationUnit(unit),
        amount: baseAmount,
        packageCount,
        totalAmount: baseAmount * packageCount,
        hasExplicitPresentation: true,
        hasPowderSignal,
        hasLiquidSignal,
      };
    }
  }

  if (singleMatch?.[1] && singleMatch[2]) {
    const amount = parsePresentationNumber(singleMatch[1]);
    const unit = normalizePresentationUnit(singleMatch[2]);

    if (amount && unit) {
      const baseAmount = convertPresentationAmount(amount, unit);

      return {
        family: getPresentationFamily(unit),
        unit: getBasePresentationUnit(unit),
        amount: baseAmount,
        packageCount: null,
        totalAmount: baseAmount,
        hasExplicitPresentation: true,
        hasPowderSignal,
        hasLiquidSignal,
      };
    }
  }

  return {
    family: "unknown",
    unit: null,
    amount: null,
    packageCount: null,
    totalAmount: null,
    hasExplicitPresentation: false,
    hasPowderSignal,
    hasLiquidSignal,
  };
}

function parsePresentationNumber(value: string) {
  const parsedValue = Number(value.replace(",", "."));
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function normalizePresentationText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,*\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePresentationUnit(
  value: string,
): "g" | "kg" | "ml" | "l" | "u" | null {
  const normalizedUnit = value.toLowerCase();

  if (["g", "gr", "grs"].includes(normalizedUnit)) {
    return "g";
  }

  if (normalizedUnit === "kg") {
    return "kg";
  }

  if (["ml", "cc"].includes(normalizedUnit)) {
    return "ml";
  }

  if (["l", "lt", "lts"].includes(normalizedUnit)) {
    return "l";
  }

  if (
    ["u", "ud", "uds", "uni", "unid", "unidad", "unidades"].includes(
      normalizedUnit,
    )
  ) {
    return "u";
  }

  return null;
}

function getPresentationFamily(unit: "g" | "kg" | "ml" | "l" | "u") {
  if (unit === "g" || unit === "kg") {
    return "weight" as const;
  }

  if (unit === "ml" || unit === "l") {
    return "liquid" as const;
  }

  return "unit" as const;
}

function getBasePresentationUnit(unit: "g" | "kg" | "ml" | "l" | "u") {
  if (unit === "kg") {
    return "g" as const;
  }

  if (unit === "l") {
    return "ml" as const;
  }

  return unit;
}

function convertPresentationAmount(
  amount: number,
  unit: "g" | "kg" | "ml" | "l" | "u",
) {
  if (unit === "kg" || unit === "l") {
    return amount * 1000;
  }

  return amount;
}

function amountsAreClose(first: number, second: number) {
  const reference = Math.max(first, second, 1);
  return Math.abs(first - second) / reference <= PRESENTATION_AMOUNT_TOLERANCE;
}

function shouldAllowWeightLiquidCompatibility(
  inputText: string,
  productText: string,
) {
  const normalizedText = normalizePresentationText(`${inputText} ${productText}`);

  return /\b(mayonesa|ketchup|mostaza|salsa|aderezo|dressing)\b/i.test(
    normalizedText,
  );
}
