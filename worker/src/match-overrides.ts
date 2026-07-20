import { selectProductMatchOverridesFromSupabase } from "./supabase-source-store.js";
import type { PriceListInputItem, ProductSearchResult } from "./types.js";

export type ProductMatchOverride = {
  id: string;
  inputFingerprint: string;
  inputDescription: string | null;
  inputCode: string | null;
  inputEan13Di: string | null;
  inputEan13Bu: string | null;
  sourceId: string;
  productFingerprint: string;
  productName: string;
  productUrl: string | null;
  status: "confirmed" | "rejected";
  updatedAt: string;
};

export async function loadProductMatchOverrides() {
  try {
    return await selectProductMatchOverridesFromSupabase();
  } catch (error) {
    console.warn("[Matching] No se pudieron cargar equivalencias manuales", {
      errorMessage:
        error instanceof Error ? error.message : "Error desconocido.",
    });
    return [];
  }
}

export function getItemMatchOverrides(
  item: PriceListInputItem,
  overrides: ProductMatchOverride[],
) {
  const fingerprints = new Set(buildInputFingerprints(item));

  return overrides.filter((override) => {
    if (fingerprints.has(override.inputFingerprint)) {
      return true;
    }

    return Boolean(
      (cleanIdentifier(item.ean13Di, true) &&
        cleanIdentifier(item.ean13Di, true) ===
          cleanIdentifier(override.inputEan13Di, true)) ||
        (cleanIdentifier(item.ean13Bu, true) &&
          cleanIdentifier(item.ean13Bu, true) ===
            cleanIdentifier(override.inputEan13Bu, true)) ||
        (cleanIdentifier(item.code, false) &&
          cleanIdentifier(item.code, false) ===
            cleanIdentifier(override.inputCode, false)),
    );
  });
}

export function getProductOverrideStatus(
  product: ProductSearchResult,
  overrides: ProductMatchOverride[],
) {
  const productFingerprint = buildProductFingerprint({
    sourceId: product.sourceId,
    productName: product.rawName,
    productUrl: product.productUrl,
  });
  const override = overrides.find(
    (candidate) =>
      candidate.sourceId === product.sourceId &&
      candidate.productFingerprint === productFingerprint,
  );

  return override?.status ?? null;
}

export function buildInputFingerprint(item: PriceListInputItem) {
  return buildInputFingerprints(item)[0] ?? `row:${item.rowNumber}`;
}

export function buildInputFingerprints(item: PriceListInputItem) {
  const fingerprints = [
    buildIdentifierFingerprint("ean", item.ean13Di),
    buildIdentifierFingerprint("ean", item.ean13Bu),
    buildIdentifierFingerprint("code", item.code),
  ].filter((value): value is string => Boolean(value));
  const normalizedText = normalizeFingerprintText(
    [item.description, item.rubro].filter(Boolean).join(" "),
  );

  if (normalizedText) {
    fingerprints.push(`text:${normalizedText}`);
  }

  return Array.from(new Set(fingerprints));
}

export function buildProductFingerprint(product: {
  sourceId: string;
  productName: string;
  productUrl?: string | null;
}) {
  const normalizedUrl = normalizeProductUrl(product.productUrl);

  if (normalizedUrl) {
    return `url:${normalizedUrl}`;
  }

  return `name:${product.sourceId}:${normalizeFingerprintText(product.productName)}`;
}

function buildIdentifierFingerprint(prefix: string, value?: string | null) {
  const identifier = cleanIdentifier(value, prefix === "ean");
  return identifier ? `${prefix}:${identifier}` : null;
}

function cleanIdentifier(value: string | null | undefined, numericOnly: boolean) {
  if (!value) return "";
  return numericOnly
    ? value.replace(/\D/g, "")
    : value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeProductUrl(value?: string | null) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function normalizeFingerprintText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
