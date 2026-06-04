import { findAllowedBrand } from "./brands.js";
import { config } from "./config.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { withUnitPricing } from "./unit-pricing.js";

type TokinSession = {
  email: string;
  expiresAt: number;
  idPdv: number;
  tenantId: "AR" | "ARG" | "CL" | string;
  token: string;
};

type TokinLoginResponse = {
  authStatus?: string;
  exp?: string;
  message?: string;
  tokinJwt?: string;
  user?: {
    email?: string;
    idpdv?: number | string;
    tenantid?: string;
  };
};

type TokinSearchResponse = {
  results?: TokinSearchHit[];
};

type TokinErrorPayload = {
  data?: {
    error?: string;
    message?: string;
  };
  error?: string;
  message?: string;
  status?: number;
};

type TokinSearchHit = {
  additional_content?: {
    raw?: {
      brand?: { name?: string } | string;
      image?: string | { src?: string; url?: string };
      variants?: TokinVariant[];
    };
  };
  brand?: { name?: string } | string;
  brand_name?: TokinRawField;
  child_category?: TokinRawField;
  id?: TokinRawField | number | string;
  image?: string;
  name?: TokinRawField | string;
  parent_category?: TokinRawField;
  product_id?: TokinRawField | number | string;
  ref_id_product?: TokinRawField | string;
  variants?: TokinVariant[];
};

type TokinRawField = {
  raw?: string | number;
};

type TokinVariant = {
  barcode?: string;
  ean?: string;
  price?: TokinPrice | number;
  prices?: TokinPrice;
  sku?: string;
  skuId?: number | string;
  stock?: number;
  uom?: string;
};

type TokinPrice = {
  listPrice?: number;
  listPriceWithTax?: number;
  sellingPrice?: number;
  sellingPriceWithTax?: number;
};

const elasticIndexes: Record<string, string> = {
  AR: "search-tokin-ar",
  ARG: "search-tokin-ar",
  CL: "search-tokin-cl",
};
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

let cachedTokinSession: TokinSession | undefined;

export async function extractProductsFromTokin(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  if (!config.tokin.email || !config.tokin.password) {
    throw new Error("Faltan TOKIN_EMAIL y TOKIN_PASSWORD para consultar Tokin.");
  }

  const session = await getTokinSession();
  const payload = await postTokinSearch(session, query, source.maxCards ?? 80);

  return (payload.results ?? [])
    .map((product) => toTokinProductResult(product, source, query))
    .filter((result): result is ProductSearchResult => result !== null);
}

async function getTokinSession(): Promise<TokinSession> {
  if (cachedTokinSession && cachedTokinSession.expiresAt > Date.now() + 60_000) {
    return cachedTokinSession;
  }

  const configuredEmail = config.tokin.email;
  const configuredPassword = config.tokin.password;

  if (!configuredEmail || !configuredPassword) {
    throw new Error("Faltan TOKIN_EMAIL y TOKIN_PASSWORD para consultar Tokin.");
  }

  const loginResponse = await postTokinApi<TokinLoginResponse>(
    "loginWithPassword",
    {
      email: configuredEmail,
      password: configuredPassword,
    },
  );

  if (loginResponse.authStatus !== "Success" || !loginResponse.tokinJwt) {
    throw new Error(
      loginResponse.message ??
        "Tokin no acepto las credenciales o requiere validacion adicional.",
    );
  }

  const idPdv = Number(loginResponse.user?.idpdv);
  const tenantId = loginResponse.user?.tenantid ?? "AR";
  const email = loginResponse.user?.email ?? configuredEmail;

  if (!Number.isFinite(idPdv) || idPdv <= 0) {
    throw new Error("Tokin autentico, pero no devolvio idPdv para buscar.");
  }

  cachedTokinSession = {
    email,
    expiresAt: parseTokinExpiration(loginResponse.exp),
    idPdv,
    tenantId,
    token: loginResponse.tokinJwt,
  };

  return cachedTokinSession;
}

async function postTokinApi<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(new URL(endpoint, config.tokin.apiBaseUrl), {
    body: JSON.stringify(body),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": userAgent,
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || payload === null) {
    throw new Error(
      getTokinErrorMessage(payload, `Tokin API respondio ${response.status} en ${endpoint}.`),
    );
  }

  return payload;
}

async function postTokinSearch(
  session: TokinSession,
  query: string,
  resultsPerPage: number,
) {
  const response = await fetch(config.tokin.searchApiUrl, {
    body: JSON.stringify({
      collections: false,
      current: 1,
      email: session.email,
      filters: [],
      idPdv: session.idPdv,
      index: elasticIndexes[session.tenantId] ?? elasticIndexes.AR,
      resultsPerPage,
      searchTerm: query,
      sortDirection: "asc",
      sortField: "rank",
    }),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      cookie: `TokinJWT=${session.token}`,
      tokin_jwt: session.token,
      "user-agent": userAgent,
    },
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as
    | TokinSearchResponse
    | null;

  if (!response.ok || payload === null) {
    throw new Error(
      getTokinErrorMessage(payload, `Tokin search respondio ${response.status}.`),
    );
  }

  return payload;
}

function toTokinProductResult(
  product: TokinSearchHit,
  source: ScrapingSource,
  query: string,
): ProductSearchResult | null {
  const rawName = getRawValue(product.name);
  const variant = findBestTokinVariant(product);
  const price = findTokinVariantPrice(variant);

  if (!rawName || price === null) {
    return null;
  }

  const brand = findTokinBrand(product);
  const matchText = findAllowedBrand(rawName)
    ? rawName
    : [brand, getRawValue(product.parent_category), getRawValue(product.child_category), rawName]
        .filter(Boolean)
        .join(" ");

  return withUnitPricing({
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: getTokinSku(variant, product),
    barcodes: getTokinBarcodes(variant),
    brand: brand || undefined,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: null,
    imageUrl: findTokinImageUrl(product),
    confidenceScore: calculateConfidenceScore(query, matchText),
  }, [matchText, variant?.uom].filter(Boolean).join(" "));
}

function findBestTokinVariant(product: TokinSearchHit) {
  const variants =
    product.additional_content?.raw?.variants ?? product.variants ?? [];

  return variants.find((variant) => findTokinVariantPrice(variant) !== null);
}

function findTokinVariantPrice(variant: TokinVariant | undefined) {
  if (!variant) {
    return null;
  }

  const price =
    typeof variant.price === "number"
      ? variant.price
      : variant.price?.sellingPriceWithTax ??
        variant.prices?.sellingPriceWithTax ??
        variant.price?.listPriceWithTax ??
        variant.prices?.listPriceWithTax ??
        variant.price?.sellingPrice ??
        variant.prices?.sellingPrice ??
        variant.price?.listPrice ??
        variant.prices?.listPrice;

  if (typeof price !== "number") {
    return normalizePrice(String(price ?? ""));
  }

  return Number.isFinite(price) && price > 0 ? price : null;
}

function findTokinBrand(product: TokinSearchHit) {
  const brand =
    product.additional_content?.raw?.brand ?? product.brand ?? product.brand_name;

  if (typeof brand === "string") {
    return brand;
  }

  if ("name" in (brand ?? {})) {
    return (brand as { name?: string }).name ?? "";
  }

  return getRawValue(brand as TokinRawField | undefined);
}

function findTokinImageUrl(product: TokinSearchHit) {
  const image = product.additional_content?.raw?.image ?? product.image;

  if (!image) {
    return null;
  }

  if (typeof image === "string") {
    return image;
  }

  return image.url ?? image.src ?? null;
}

function getTokinSku(
  variant: TokinVariant | undefined,
  product: TokinSearchHit,
) {
  return (
    String(variant?.skuId ?? variant?.sku ?? "") ||
    String(getRawValue(product.ref_id_product) || getRawValue(product.product_id) || "") ||
    null
  );
}

function getTokinBarcodes(variant: TokinVariant | undefined) {
  return [variant?.barcode, variant?.ean]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\D/g, ""))
    .filter((value) => /^\d{8,14}$/.test(value));
}

function getRawValue(field: TokinRawField | string | number | undefined) {
  if (typeof field === "string") {
    return field.replace(/\s+/g, " ").trim();
  }

  if (typeof field === "number") {
    return String(field);
  }

  const raw = field?.raw;

  if (typeof raw === "number") {
    return String(raw);
  }

  return raw?.replace(/\s+/g, " ").trim() ?? "";
}

function parseTokinExpiration(value: string | undefined) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now() + 30 * 60_000;
}

function getTokinErrorMessage(payload: unknown, fallback: string) {
  const errorPayload = payload as TokinErrorPayload | null;
  const message =
    errorPayload?.data?.message ??
    errorPayload?.message ??
    errorPayload?.data?.error ??
    errorPayload?.error;

  return message ? `Tokin: ${message}` : fallback;
}
