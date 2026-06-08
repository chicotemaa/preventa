import { findAllowedBrand } from "./brands.js";
import { findCatalogCategory } from "./categories.js";
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

type TokinVariant = Record<string, unknown> & {
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
    .flatMap((product) => toTokinProductResults(product, source, query))
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

function toTokinProductResults(
  product: TokinSearchHit,
  source: ScrapingSource,
  query: string,
) {
  return findPricedTokinVariants(product).map((variant) =>
    toTokinProductResult(product, source, query, variant),
  );
}

function toTokinProductResult(
  product: TokinSearchHit,
  source: ScrapingSource,
  query: string,
  variant: TokinVariant,
): ProductSearchResult | null {
  const productName = getRawValue(product.name);
  const variantName = findTokinVariantName(variant);
  const rawName = mergeTokinProductName(productName, variantName);
  const price = findTokinVariantPrice(variant);

  if (!rawName || price === null) {
    return null;
  }

  const brand = findTokinBrand(product);
  const category = findTokinCategory(product, rawName);
  const matchText = findAllowedBrand(rawName)
    ? [category, rawName].filter(Boolean).join(" ")
    : [brand, category, rawName]
        .filter(Boolean)
        .join(" ");
  const pricingContext = buildTokinPricingContext(product, variant, matchText);

  return withUnitPricing({
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: getTokinSku(variant, product),
    barcodes: getTokinBarcodes(variant, product),
    brand: brand || undefined,
    category: category || undefined,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: null,
    imageUrl: findTokinImageUrl(product),
    confidenceScore: calculateConfidenceScore(query, matchText),
  }, pricingContext);
}

function findTokinVariantName(variant: TokinVariant) {
  const preferredKeys = [
    "name",
    "variantName",
    "variant_name",
    "description",
    "descripcion",
    "presentation",
    "presentacion",
  ];

  for (const key of preferredKeys) {
    const value = stringifyTokinVariantValue(variant[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function mergeTokinProductName(productName: string, variantName: string) {
  if (!productName) {
    return variantName;
  }

  if (!variantName) {
    return productName;
  }

  const normalizedProductName = normalizeProductName(productName);
  const normalizedVariantName = normalizeProductName(variantName);

  if (normalizedProductName.includes(normalizedVariantName)) {
    return productName;
  }

  if (normalizedVariantName.includes(normalizedProductName)) {
    return variantName;
  }

  return `${productName} ${variantName}`.replace(/\s+/g, " ").trim();
}

function findPricedTokinVariants(product: TokinSearchHit) {
  const variants =
    product.additional_content?.raw?.variants ?? product.variants ?? [];

  return variants.filter((variant) => findTokinVariantPrice(variant) !== null);
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

function buildTokinPricingContext(
  product: TokinSearchHit,
  variant: TokinVariant,
  matchText: string,
) {
  const packageQuantity = findTokinPackageQuantity(variant);
  const fragments = [
    matchText,
    getRawValue(product.parent_category),
    getRawValue(product.child_category),
    ...getTokinVariantPackagingFragments(variant),
    packageQuantity ? `bulto x ${packageQuantity}` : null,
  ];

  return Array.from(
    new Set(
      fragments
        .map((fragment) => String(fragment ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ).join(" ");
}

function getTokinVariantPackagingFragments(variant: TokinVariant) {
  const fragments: string[] = [];

  for (const [key, value] of Object.entries(variant)) {
    if (key === "price" || key === "prices" || key === "stock") {
      continue;
    }

    if (!isTokinPackagingTextKey(key) && key !== "uom") {
      continue;
    }

    const text = stringifyTokinVariantValue(value);

    if (text) {
      fragments.push(`${key} ${text}`);
    }
  }

  return fragments;
}

function findTokinPackageQuantity(variant: TokinVariant) {
  for (const [key, value] of Object.entries(variant)) {
    if (!isTokinPackageQuantityKey(key)) {
      continue;
    }

    const quantity = parseTokinPackageQuantity(value);

    if (quantity !== null) {
      return quantity;
    }
  }

  return null;
}

function isTokinPackageQuantityKey(key: string) {
  const normalizedKey = normalizeTokinKey(key);

  return (
    /(?:units|unidades|items|cantidad|cant|qty|contenido|content).*(?:pack|package|box|case|bulto|caja|display)/i.test(
      normalizedKey,
    ) ||
    /(?:pack|package|box|case|bulto|caja|display).*(?:units|unidades|items|cantidad|cant|qty|quantity|contenido|content|size)/i.test(
      normalizedKey,
    ) ||
    [
      "casepack",
      "packsize",
      "packagequantity",
      "packquantity",
      "bulkquantity",
      "boxquantity",
      "bultoquantity",
      "cajaquantity",
      "itemsperpack",
      "itemspercase",
      "unitsperpack",
      "unitsperpackage",
      "unitsperbox",
      "unitspercase",
      "unidadesporbulto",
      "unidadesporcaja",
      "cantidadporbulto",
      "cantidadporcaja",
      "cantporbulto",
      "cantporcaja",
    ].includes(normalizedKey)
  );
}

function isTokinPackagingTextKey(key: string) {
  const normalizedKey = normalizeTokinKey(key);

  return (
    /(?:uom|unidad|unit|presentacion|presentation|empaque|packaging|package|pack|bulto|caja|display|contenido|content|formato|format|medida|measure)/i.test(
      normalizedKey,
    ) || isTokinPackageQuantityKey(key)
  );
}

function parseTokinPackageQuantity(value: unknown) {
  if (typeof value === "number") {
    return isValidTokinPackageQuantity(value) ? value : null;
  }

  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/\b(\d{1,3})(?:\.0+)?\b/);
    const parsedValue = match?.[1] ? Number(match[1]) : NaN;
    return isValidTokinPackageQuantity(parsedValue) ? parsedValue : null;
  }

  if (value && typeof value === "object" && "raw" in value) {
    return parseTokinPackageQuantity((value as TokinRawField).raw);
  }

  return null;
}

function isValidTokinPackageQuantity(value: number) {
  return Number.isInteger(value) && value > 1 && value <= 200;
}

function stringifyTokinVariantValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object" && "raw" in value) {
    return getRawValue(value as TokinRawField);
  }

  return "";
}

function normalizeTokinKey(key: string) {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
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

function findTokinCategory(product: TokinSearchHit, rawName: string) {
  return (
    findCatalogCategory(rawName)?.name ||
    getRawValue(product.child_category) ||
    getRawValue(product.parent_category) ||
    ""
  );
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
  const sku =
    findTokinIdentifierValue(variant, [
      "sku",
      "skuId",
      "sku_id",
      "refId",
      "ref_id",
      "refIdProduct",
      "ref_id_product",
      "codigo",
      "code",
      "internalCode",
      "internal_code",
    ]) ||
    getRawValue(product.ref_id_product) ||
    getRawValue(product.product_id) ||
    getRawValue(product.id as TokinRawField | string | number | undefined);

  return sku || null;
}

function getTokinBarcodes(
  variant: TokinVariant | undefined,
  product: TokinSearchHit,
) {
  const values = new Set<string>();

  collectTokinIdentifierValues(variant, values);
  collectTokinIdentifierValues(product, values);

  return Array.from(values)
    .map((value) => value.replace(/\D/g, ""))
    .filter((value) => /^\d{8,14}$/.test(value));
}

function findTokinIdentifierValue(
  value: unknown,
  keys: string[],
): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const normalizedKeys = new Set(keys.map(normalizeTokinKey));

  for (const [key, itemValue] of Object.entries(value)) {
    if (!normalizedKeys.has(normalizeTokinKey(key))) {
      continue;
    }

    const text = stringifyTokinVariantValue(itemValue);

    if (text) {
      return text;
    }
  }

  return "";
}

function collectTokinIdentifierValues(
  value: unknown,
  identifiers: Set<string>,
  depth = 0,
) {
  if (!value || typeof value !== "object" || depth > 2) {
    return;
  }

  for (const [key, itemValue] of Object.entries(value)) {
    const normalizedKey = normalizeTokinKey(key);
    const shouldReadValue =
      /(?:ean|barcode|barcod|barras|barra|gtin|upc)/i.test(normalizedKey);

    if (shouldReadValue) {
      for (const identifier of extractTokinNumericIdentifiers(itemValue)) {
        identifiers.add(identifier);
      }
    }

    if (
      itemValue &&
      typeof itemValue === "object" &&
      !["price", "prices", "stock"].includes(normalizedKey)
    ) {
      collectTokinIdentifierValues(itemValue, identifiers, depth + 1);
    }
  }
}

function extractTokinNumericIdentifiers(value: unknown): string[] {
  if (typeof value === "number") {
    return [String(value)];
  }

  if (typeof value === "string") {
    return value.match(/\d{8,14}/g) ?? [];
  }

  if (value && typeof value === "object" && "raw" in value) {
    return extractTokinNumericIdentifiers((value as TokinRawField).raw);
  }

  return [];
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
