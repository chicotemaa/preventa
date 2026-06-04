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
import { withUnitPricing } from "./unit-pricing.js";

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

type RedNorteCatalogResponse = {
  productos?: RedNorteProduct[];
  paginacion?: {
    page?: number;
    limit?: number;
    total?: number;
    pages?: number;
  };
};

type RedNorteProduct = {
  id?: number;
  sku_externo?: string;
  nombre?: string;
  imagen_url?: string | null;
  categoria_nombre?: string | null;
  presentaciones?: Array<{
    nombre?: string;
    factor?: number;
    es_default?: number | boolean;
    precio_centavos?: number | null;
  }>;
};

type WooCommercePmwProduct = {
  id?: string | number;
  sku?: string;
  price?: number | string;
  brand?: string;
  name?: string;
  category?: string[];
};

export async function extractProductsFromRedNorteApi(
  url: string,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const firstPage = await fetchRedNorteCatalogPage(url, source);
  const pages = Math.min(firstPage.paginacion?.pages ?? 1, 10);
  const pageUrls = Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
    setQueryParam(url, "page", String(index + 2)),
  );
  const additionalPages = await Promise.all(
    pageUrls.map((pageUrl) => fetchRedNorteCatalogPage(pageUrl, source)),
  );
  const products = [firstPage, ...additionalPages].flatMap(
    (page) => page.productos ?? [],
  );

  return products
    .slice(0, source.maxCards ?? products.length)
    .map((product) => toRedNorteProductResult(source, query, product))
    .filter((result): result is ProductSearchResult => result !== null);
}

export async function extractProductsFromVtexApi(
  url: string,
  source: ScrapingSource,
  query: string,
  customHeaders: Record<string, string> = {},
): Promise<ProductSearchResult[]> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
      ...customHeaders,
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
  return extractProductsFromStaticHtmlText(html, url, source, query);
}

export async function extractProductsFromLaAnonimaHtml(
  url: string,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: "https://www.laanonima.com.ar/supermercado/",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTML La Anonima respondio ${response.status} para ${source.storeName}`,
    );
  }

  const html = await response.text();
  return extractLaAnonimaProductBlocks(html)
    .slice(0, source.maxCards ?? 80)
    .map((card) => toLaAnonimaProductResult(card, source, query, url))
    .filter((result): result is ProductSearchResult => result !== null);
}

export function extractProductsFromStaticHtmlText(
  html: string,
  baseUrl: string,
  source: ScrapingSource,
  query: string,
): ProductSearchResult[] {
  const cards = findStaticHtmlCards(html);

  return cards
    .slice(0, source.maxCards ?? 40)
    .map((card) => toStaticHtmlProductResult(card, source, query, baseUrl))
    .filter((result): result is ProductSearchResult => result !== null);
}

export async function extractProductsFromWooCommercePmwJson(
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
  const products = extractPmwProducts(html);

  return products
    .map((product) => toWooCommercePmwProductResult(source, query, product))
    .filter((result): result is ProductSearchResult => result !== null);
}

async function fetchRedNorteCatalogPage(
  url: string,
  source: ScrapingSource,
): Promise<RedNorteCatalogResponse> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `API Red Norte respondio ${response.status} para ${source.storeName}`,
    );
  }

  return (await response.json()) as RedNorteCatalogResponse;
}

function toRedNorteProductResult(
  source: ScrapingSource,
  query: string,
  product: RedNorteProduct,
): ProductSearchResult | null {
  const rawName = product.nombre?.replace(/\s+/g, " ").trim();
  const presentation =
    product.presentaciones?.find((item) => Boolean(item.es_default)) ??
    product.presentaciones?.[0];
  const price =
    typeof presentation?.precio_centavos === "number"
      ? presentation.precio_centavos / 100
      : null;

  if (!rawName || price === null || price <= 0) {
    return null;
  }

  const matchText = [product.categoria_nombre, rawName].filter(Boolean).join(" ");
  const pricingText = [
    matchText,
    presentation?.nombre,
    typeof presentation?.factor === "number" && presentation.factor > 1
      ? `pack x ${presentation.factor}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return withUnitPricing({
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: product.sku_externo ?? (product.id ? String(product.id) : null),
    barcodes: [],
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: product.id
      ? resolveUrl(`/producto/${product.id}`, source.sourceUrl ?? source.searchUrlTemplate)
      : null,
    imageUrl: resolveUrl(
      product.imagen_url ?? "",
      source.sourceUrl ?? source.searchUrlTemplate,
    ),
    confidenceScore: calculateConfidenceScore(query, matchText),
  }, pricingText);
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

  return withUnitPricing({
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
  }, matchText);
}

function toStaticHtmlProductResult(
  cardHtml: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
): ProductSearchResult | null {
  const rawName = decodeHtml(stripTags(findStaticProductName(cardHtml)));
  const rawPrice = decodeHtml(stripTags(findStaticProductPrice(cardHtml)));
  const price = normalizePrice(rawPrice);

  if (!rawName || price === null) {
    return null;
  }

  const product = createProductResult(
    source,
    query,
    rawName,
    price,
    resolveUrl(findStaticProductUrl(cardHtml), baseUrl),
    resolveUrl(findStaticImageUrl(cardHtml), baseUrl),
  );

  return {
    ...product,
    sku:
      decodeHtml(stripTags(matchFirst(cardHtml, /product-sku[\s\S]*?SKU<\/span>\s*([^<]+)/i))) ||
      null,
  };
}

function toWooCommercePmwProductResult(
  source: ScrapingSource,
  query: string,
  product: WooCommercePmwProduct,
): ProductSearchResult | null {
  const rawName = product.name?.replace(/\s+/g, " ").trim();
  const price =
    typeof product.price === "number"
      ? product.price
      : normalizePrice(String(product.price ?? ""));

  if (!rawName || price === null || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const brand = product.brand || inferBrandFromCategories(product.category);
  const matchText = findAllowedBrand(rawName)
    ? rawName
    : [brand, ...(product.category ?? []), rawName].filter(Boolean).join(" ");

  return withUnitPricing({
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: product.sku || String(product.id ?? "") || null,
    barcodes: findWooCommerceBarcodes(product),
    brand: brand || undefined,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: null,
    imageUrl: null,
    confidenceScore: calculateConfidenceScore(query, matchText),
  }, matchText);
}

function toLaAnonimaProductResult(
  cardHtml: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
): ProductSearchResult | null {
  const rawName = decodeHtml(readHtmlAttribute(cardHtml, "data-nombre"));
  const rawPrice =
    readHtmlAttribute(cardHtml, "data-precio_oferta") ||
    readHtmlAttribute(cardHtml, "data-precio");
  const price = normalizePrice(rawPrice);

  if (!rawName || price === null) {
    return null;
  }

  const sku =
    readHtmlAttribute(cardHtml, "id-codigo-producto") ||
    readHtmlAttribute(cardHtml, "data-codigo") ||
    null;
  const brand = decodeHtml(readHtmlAttribute(cardHtml, "data-marca"));
  const categories = decodeHtml(readHtmlAttribute(cardHtml, "data-rutacategorias"));
  const productUrl =
    resolveUrl(readHtmlAttribute(cardHtml, "href"), baseUrl) ??
    (sku ? resolveUrl(`/art_${sku}/`, baseUrl) : null);
  const imageUrl = resolveUrl(findLaAnonimaImageUrl(cardHtml), baseUrl);
  const matchText = [brand, categories, rawName].filter(Boolean).join(" ");

  return withUnitPricing({
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku,
    barcodes: [],
    brand: brand || undefined,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl,
    imageUrl,
    confidenceScore: calculateConfidenceScore(query, matchText),
  }, matchText);
}

function extractLaAnonimaProductBlocks(html: string) {
  return extractRepeatedBlocks(
    html,
    /<div[^>]*\bclass=["'][^"']*\bproducto-item\b[^"']*["'][^>]*>/gi,
  );
}

function findLaAnonimaImageUrl(cardHtml: string) {
  return (
    matchFirst(cardHtml, /<img[^>]*\bdata-src=["']([^"']+)["'][^>]*>/i) ||
    findStaticImageUrl(cardHtml)
  );
}

function findStaticHtmlCards(html: string) {
  const cards = [
    ...(html.match(
      /<li[^>]*class=["'][^"']*product-item[^"']*["'][\s\S]*?<\/li>/gi,
    ) ?? []),
    ...(html.match(
      /<li[^>]*class=["'][^"']*\bproduct\b[^"']*["'][\s\S]*?<\/li>/gi,
    ) ?? []),
    ...extractRepeatedBlocks(
      html,
      /<div[^>]*class=["'][^"']*\bproduct-card\b[^"']*\bproduct\b[^"']*["'][^>]*>/gi,
    ),
    ...extractRepeatedBlocks(
      html,
      /<div[^>]*class=["'][^"']*\bproduct\b[^"']*\btype-product\b[^"']*["'][^>]*>/gi,
    ),
    ...extractRepeatedBlocks(
      html,
      /<div[^>]*class=["'][^"']*\bjet-listing-grid__item\b[^"']*["'][^>]*>/gi,
    ),
  ];

  return Array.from(new Set(cards));
}

function extractRepeatedBlocks(html: string, pattern: RegExp) {
  const starts = Array.from(html.matchAll(pattern)).map((match) => match.index ?? 0);

  return starts.map((start, index) => {
    const nextStart = starts[index + 1] ?? html.length;
    return html.slice(start, nextStart);
  });
}

function findStaticProductName(cardHtml: string) {
  return (
    matchFirst(
      cardHtml,
      /<a[^>]*class=["'][^"']*product-item-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<h[23][^>]*class=["'][^"']*product-card__name[^"']*["'][^>]*>([\s\S]*?)<\/h[23]>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<h[23][^>]*class=["'][^"']*woocommerce-loop-product__title[^"']*["'][^>]*>([\s\S]*?)<\/h[23]>/i,
    ) ||
    findElementorProductHeading(cardHtml)?.labelHtml ||
    ""
  );
}

function findStaticProductPrice(cardHtml: string) {
  return (
    matchFirst(
      cardHtml,
      /highest[\s\S]*?<span class=['"]price['"]>([\s\S]*?)<\/span>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<div[^>]*class=["'][^"']*product-card__price-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ) ||
    findWooCommercePriceAmount(cardHtml) ||
    matchFirst(
      cardHtml,
      /<span[^>]*class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    )
  );
}

function findWooCommercePriceAmount(cardHtml: string) {
  const directMatch = cardHtml.match(
    /<span[^>]*class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>\s*<span[^>]*class=["'][^"']*woocommerce-Price-currencySymbol[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*([^<]+)\s*<\/span>/i,
  );

  if (directMatch?.[2]) {
    return `${directMatch[1] ?? "$"} ${directMatch[2]}`;
  }

  const bdiMatch = cardHtml.match(
    /<span[^>]*class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>\s*<bdi>([\s\S]*?)<\/bdi>\s*<\/span>/i,
  );

  return bdiMatch?.[1]?.trim() ?? "";
}

function findStaticProductUrl(cardHtml: string) {
  return (
    matchFirst(
      cardHtml,
      /<a[^>]*class=["'][^"']*product-item-link[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*product-item-link[^"']*["'][^>]*>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<a[^>]*class=["'][^"']*(?:woocommerce-LoopProduct-link|product-card__link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*(?:woocommerce-LoopProduct-link|product-card__link)[^"']*["'][^>]*>/i,
    ) ||
    findElementorProductHeading(cardHtml)?.url ||
    ""
  );
}

function findStaticImageUrl(cardHtml: string) {
  return (
    matchFirst(
      cardHtml,
      /<img[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*class=["'][^"']*product-card__image[^"']*["'][^>]*>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<img[^>]*class=["'][^"']*product-card__image[^"']*["'][^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i,
    ) ||
    matchFirst(cardHtml, /<img[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i)
  );
}

function findElementorProductHeading(cardHtml: string) {
  const pattern =
    /<div[^>]*class=["'][^"']*elementor-heading-title[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']*\/productos\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<\/div>/gi;

  for (const match of cardHtml.matchAll(pattern)) {
    const url = match[1] ?? "";
    const labelHtml = match[2] ?? "";
    const label = decodeHtml(stripTags(labelHtml)).trim();

    if (
      !label ||
      label.includes("$") ||
      /woocommerce-Price-amount|<img\b/i.test(labelHtml)
    ) {
      continue;
    }

    return { url, labelHtml };
  }

  return null;
}

function extractPmwProducts(html: string) {
  const products: WooCommercePmwProduct[] = [];
  const assignmentPattern =
    /window\.pmwDataLayer\.products\s*=\s*Object\.assign\(\s*window\.pmwDataLayer\.products\s*,\s*({[\s\S]*?})\s*\);/g;

  for (const match of html.matchAll(assignmentPattern)) {
    try {
      const payload = JSON.parse(match[1] ?? "{}") as Record<
        string,
        WooCommercePmwProduct
      >;
      products.push(...Object.values(payload));
    } catch {
      continue;
    }
  }

  return products;
}

function inferBrandFromCategories(categories: string[] | undefined) {
  return categories?.find((category) => !isGenericWooCommerceCategory(category)) ?? "";
}

function isGenericWooCommerceCategory(category: string) {
  const normalized = normalizeProductName(category);
  const genericTerms = [
    "nuevo",
    "granel",
    "otros snacks salados",
    "otros snacks dulces",
    "galletas dulces",
    "aceites salsas",
    "harinas premezclas",
    "cereales desayuno semillas",
    "otras golosinas",
  ];

  return genericTerms.includes(normalized);
}

function findWooCommerceBarcodes(product: WooCommercePmwProduct) {
  const values = [product.sku, String(product.id ?? "")].filter(
    (value): value is string => Boolean(value),
  );

  return values.filter((value) => /^\d{8,14}$/.test(value.replace(/\D/g, "")));
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

function setQueryParam(url: string, name: string, value: string) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set(name, value);
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function matchFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1]?.trim() ?? "";
}

function readHtmlAttribute(html: string, attribute: string) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const doubleQuoted = new RegExp(`${escapedAttribute}\\s*=\\s*"([^"]*)"`, "i");
  const singleQuoted = new RegExp(`${escapedAttribute}\\s*=\\s*'([^']*)'`, "i");
  const unquoted = new RegExp(`${escapedAttribute}\\s*=\\s*([^\\s>]+)`, "i");

  return (
    matchFirst(html, doubleQuoted) ||
    matchFirst(html, singleQuoted) ||
    matchFirst(html, unquoted)
  );
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
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
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
