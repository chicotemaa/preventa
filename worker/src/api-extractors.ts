import { findAllowedBrand } from "./brands.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizeProductName } from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";

type VtexProduct = {
  productName?: string;
  brand?: string;
  link?: string;
  items?: VtexItem[];
};

type VtexItem = {
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
