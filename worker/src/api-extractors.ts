import { findAllowedBrand } from "./brands.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { createProductResult } from "./extractors.js";

type VtexProduct = {
  productName?: string;
  brand?: string;
  link?: string;
  productReference?: string;
  productReferenceCode?: string | null;
  items?: VtexItem[];
};

type VtexItem = {
  itemId?: string;
  ean?: string;
  referenceId?: Array<{ Value?: string }>;
  images?: Array<{ imageUrl?: string }>;
  sellers?: Array<{
    commertialOffer?: {
      Price?: number;
      ListPrice?: number;
      AvailableQuantity?: number;
      IsAvailable?: boolean;
    };
  }>;
};

export async function extractProductsFromVtexApi(
  url: string,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
    },
  });

  if (!response.ok) {
    throw new Error(`VTEX respondio ${response.status} para ${source.storeName}`);
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new Error(`Respuesta VTEX inesperada en ${source.storeName}`);
  }

  return payload
    .map((product) => toVtexProductResult(source, query, product as VtexProduct))
    .filter((result): result is ProductSearchResult => result !== null);
}

export async function extractProductsFromStaticHtml(
  url: string,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html",
      "user-agent":
        "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
    },
  });

  if (!response.ok) {
    throw new Error(`HTML respondio ${response.status} para ${source.storeName}`);
  }

  const html = await response.text();
  const cards =
    html.match(/<li[^>]*class=["'][^"']*product-item[^"']*["'][\s\S]*?<\/li>/gi) ??
    [];

  return cards
    .slice(0, source.maxCards ?? 40)
    .map((card) => toStaticHtmlProductResult(card, source, query, url))
    .filter((result): result is ProductSearchResult => result !== null);
}

function toVtexProductResult(
  source: ScrapingSource,
  query: string,
  product: VtexProduct,
): ProductSearchResult | null {
  const rawName = product.productName?.replace(/\s+/g, " ").trim();
  const price = findVtexPrice(product);

  if (!rawName || price === null) {
    return null;
  }

  const matchText = findAllowedBrand(rawName)
    ? rawName
    : [product.brand, rawName].filter(Boolean).join(" ");

  return {
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: findVtexSku(product),
    barcodes: findVtexBarcodes(product),
    brand: product.brand || undefined,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: product.link ?? null,
    imageUrl: findVtexImageUrl(product),
    confidenceScore: calculateConfidenceScore(query, matchText),
  };
}

function toStaticHtmlProductResult(
  cardHtml: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
): ProductSearchResult | null {
  const rawName = decodeHtml(
    stripTags(
      matchFirst(
        cardHtml,
        /<a[^>]*class=["'][^"']*product-item-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      ),
    ),
  );
  const rawPrice = decodeHtml(
    stripTags(
      matchFirst(cardHtml, /highest[\s\S]*?<span class=['"]price['"]>([\s\S]*?)<\/span>/i) ||
        matchFirst(
          cardHtml,
          /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
        ),
    ),
  );
  const price = normalizePrice(rawPrice);

  if (!rawName || price === null) {
    return null;
  }

  const product = createProductResult(
    source,
    query,
    rawName,
    price,
    resolveUrl(matchFirst(cardHtml, /<a[^>]*href=["']([^"']+)["'][^>]*>/i), baseUrl),
    resolveUrl(
      matchFirst(
        cardHtml,
        /<img[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i,
      ),
      baseUrl,
    ),
  );

  return {
    ...product,
    sku:
      decodeHtml(stripTags(matchFirst(cardHtml, /product-sku[\s\S]*?SKU<\/span>\s*([^<]+)/i))) ||
      null,
  };
}

function findVtexSku(product: VtexProduct) {
  return (
    product.productReferenceCode ||
    product.productReference ||
    product.items?.find((item) => item.itemId)?.itemId ||
    null
  );
}

function findVtexBarcodes(product: VtexProduct) {
  const values = new Set<string>();

  for (const item of product.items ?? []) {
    addIdentifier(values, item.ean);

    for (const reference of item.referenceId ?? []) {
      addIdentifier(values, reference.Value);
    }
  }

  addIdentifier(values, product.productReferenceCode);
  addIdentifier(values, product.productReference);

  return Array.from(values).filter((value) => /^\d{8,14}$/.test(value));
}

function addIdentifier(values: Set<string>, value: string | null | undefined) {
  const normalizedValue = value?.replace(/\D/g, "");

  if (normalizedValue) {
    values.add(normalizedValue);
  }
}

function matchFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1]?.trim() ?? "";
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveUrl(value: string, baseUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function findVtexPrice(product: VtexProduct) {
  for (const item of product.items ?? []) {
    for (const seller of item.sellers ?? []) {
      const offer = seller.commertialOffer;
      const price = offer?.Price;

      if (
        offer?.IsAvailable === false ||
        (typeof offer?.AvailableQuantity === "number" &&
          offer.AvailableQuantity <= 0)
      ) {
        continue;
      }

      if (typeof price === "number" && Number.isFinite(price) && price > 0) {
        return price;
      }
    }
  }

  return null;
}

function findVtexImageUrl(product: VtexProduct) {
  for (const item of product.items ?? []) {
    const imageUrl = item.images?.find((image) => image.imageUrl)?.imageUrl;

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}
