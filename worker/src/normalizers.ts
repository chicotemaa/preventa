import type { QueryType } from "./types.js";

const accentMap: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
};

export function normalizeQuery(query: string): string {
  return normalizeText(query);
}

export function detectQueryType(query: string): QueryType {
  const compact = query.replace(/[\s-]/g, "");

  if (/^\d{8,14}$/.test(compact)) {
    return "barcode";
  }

  if (/^[a-zA-Z0-9_-]{3,24}$/.test(compact) && /\d/.test(compact)) {
    return "sku";
  }

  return "text";
}

export function normalizePrice(rawPrice: string): number | null {
  const cleaned = rawPrice
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/(?!^)-/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator =
    lastComma > lastDot && cleaned.length - lastComma <= 3
      ? ","
      : lastDot > lastComma && cleaned.length - lastDot <= 3
        ? "."
        : null;

  let normalized = cleaned;

  if (decimalSeparator === ",") {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (decimalSeparator === ".") {
    normalized = cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned.replace(/[.,]/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeProductName(name: string): string {
  return normalizeText(name)
    .replace(/\b(un|una|el|la|los|las|de|del|x)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[áéíóúüñ]/g, (letter) => accentMap[letter] ?? letter)
    .replace(/[^a-z0-9.,\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
