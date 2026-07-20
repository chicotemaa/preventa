import type {
  PriceListInputItem,
  ProductMatchOverride,
  ProductMatchOverridesResponse,
} from "@/types/search";
import {
  isSupabaseConfigured,
  selectSupabaseRows,
  upsertSupabaseRows,
} from "./supabase-admin";

type MatchOverrideRow = {
  id: string;
  input_fingerprint: string;
  input_description: string | null;
  input_code: string | null;
  input_ean13_di: string | null;
  input_ean13_bu: string | null;
  source_id: string;
  store_name: string;
  product_fingerprint: string;
  product_name: string;
  product_url: string | null;
  status: "confirmed" | "rejected";
  updated_at: string;
};

export type SaveMatchOverrideInput = {
  item: Pick<
    PriceListInputItem,
    "rowNumber" | "description" | "rubro" | "code" | "ean13Di" | "ean13Bu"
  >;
  candidate: {
    sourceId: string;
    storeName: string;
    productName: string;
    productUrl?: string | null;
  };
  status: "confirmed" | "rejected";
};

export async function getProductMatchOverrides(): Promise<ProductMatchOverridesResponse> {
  if (!isSupabaseConfigured()) {
    return { enabled: false, overrides: [] };
  }

  try {
    const rows = await selectSupabaseRows<MatchOverrideRow[]>(
      "product_match_overrides",
      {
        select:
          "id,input_fingerprint,input_description,input_code,input_ean13_di,input_ean13_bu,source_id,store_name,product_fingerprint,product_name,product_url,status,updated_at",
        order: "updated_at.desc",
      },
    );

    return { enabled: true, overrides: rows.map(mapOverrideRow) };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    return {
      enabled: true,
      overrides: [],
      migrationRequired: isMissingTableError(errorMessage),
      errorMessage,
    };
  }
}

export async function saveProductMatchOverride(input: SaveMatchOverrideInput) {
  if (!isSupabaseConfigured()) {
    return {
      enabled: false,
      saved: false,
      errorMessage: "Supabase no esta configurado.",
    };
  }

  const now = new Date().toISOString();
  const row = {
    input_fingerprint: buildInputFingerprint(input.item),
    input_description: input.item.description ?? null,
    input_code: input.item.code ?? null,
    input_ean13_di: input.item.ean13Di ?? null,
    input_ean13_bu: input.item.ean13Bu ?? null,
    source_id: input.candidate.sourceId,
    store_name: input.candidate.storeName,
    product_fingerprint: buildProductFingerprint(input.candidate),
    product_name: input.candidate.productName,
    product_url: input.candidate.productUrl ?? null,
    status: input.status,
    updated_at: now,
  };

  try {
    const rows = await upsertSupabaseRows<MatchOverrideRow[]>(
      "product_match_overrides",
      row,
      {
        onConflict: "input_fingerprint,source_id,product_fingerprint",
        returning: "representation",
        select:
          "id,input_fingerprint,input_description,input_code,input_ean13_di,input_ean13_bu,source_id,store_name,product_fingerprint,product_name,product_url,status,updated_at",
      },
    );

    return {
      enabled: true,
      saved: true,
      override: rows?.[0] ? mapOverrideRow(rows[0]) : null,
    };
  } catch (error) {
    return {
      enabled: true,
      saved: false,
      migrationRequired: isMissingTableError(getErrorMessage(error)),
      errorMessage: getErrorMessage(error),
    };
  }
}

export function buildInputFingerprint(
  item: Pick<
    PriceListInputItem,
    "rowNumber" | "description" | "rubro" | "code" | "ean13Di" | "ean13Bu"
  >,
) {
  const identifierFingerprint =
    buildIdentifierFingerprint("ean", item.ean13Di) ??
    buildIdentifierFingerprint("ean", item.ean13Bu) ??
    buildIdentifierFingerprint("code", item.code);

  if (identifierFingerprint) {
    return identifierFingerprint;
  }

  const normalizedText = normalizeFingerprintText(
    [item.description, item.rubro].filter(Boolean).join(" "),
  );

  return normalizedText ? `text:${normalizedText}` : `row:${item.rowNumber}`;
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

function mapOverrideRow(row: MatchOverrideRow): ProductMatchOverride {
  return {
    id: row.id,
    inputFingerprint: row.input_fingerprint,
    inputDescription: row.input_description,
    inputCode: row.input_code,
    inputEan13Di: row.input_ean13_di,
    inputEan13Bu: row.input_ean13_bu,
    sourceId: row.source_id,
    storeName: row.store_name,
    productFingerprint: row.product_fingerprint,
    productName: row.product_name,
    productUrl: row.product_url,
    status: row.status,
    updatedAt: row.updated_at,
  };
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

function normalizeFingerprintText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function isMissingTableError(value: string) {
  return /product_match_overrides|PGRST205|42P01/i.test(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar la equivalencia.";
}
