import { findAllowedBrand } from "./brands.js";
import { findCatalogCategory } from "./categories.js";
import { calculateConfidenceScore } from "./matching.js";
import { config } from "./config.js";
import {
  detectQueryType,
  normalizeQuery,
  normalizePrice,
  normalizeProductName,
} from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import type {
  AlternatePrice,
  ProductSearchResult,
  ScrapingSource,
} from "./types.js";
import { createProductResult } from "./extractors.js";
import { textLooksOutOfStock } from "./stock.js";
import { withUnitPricing } from "./unit-pricing.js";

type VtexProduct = {
  productName?: string;
  brand?: string;
  categories?: string[];
  link?: string;
  productReference?: string;
  productReferenceCode?: string | null;
  items?: VtexItem[];
};

type VtexItem = {
  itemId?: string;
  name?: string;
  ean?: string;
  referenceId?: Array<{ Value?: string }>;
  measurementUnit?: string;
  unitMultiplier?: number;
  images?: Array<{ imageUrl?: string }>;
  sellers?: VtexSeller[];
};

type VtexSeller = {
  sellerId?: string;
  sellerName?: string;
  commertialOffer?: VtexCommercialOffer;
};

type VtexCommercialOffer = {
  Price?: number;
  ListPrice?: number;
  PriceWithoutDiscount?: number;
  FullSellingPrice?: number;
  SpotPrice?: number;
  spotPrice?: number;
  AvailableQuantity?: number;
  IsAvailable?: boolean;
  PriceValidUntil?: string;
  DiscountHighLight?: unknown[];
  PromotionTeasers?: unknown[];
  Teasers?: unknown[];
};

type VtexOfferSelection = {
  item: VtexItem;
  seller: VtexSeller;
  offer: VtexCommercialOffer;
  price: number;
};

const VTEX_MIN_USEFUL_CONFIDENCE_SCORE = 60;

type WooCommercePmwProduct = {
  id?: string | number;
  sku?: string;
  price?: number | string;
  brand?: string;
  name?: string;
  category?: string[];
  stock?: number | string | null;
  stock_status?: string;
  stockStatus?: string;
  availability?: string;
  in_stock?: boolean;
  is_in_stock?: boolean;
};

type MaxiconsumoUnitPricing = {
  price: number;
  priceCondition: string | null;
  alternatePrices: AlternatePrice[];
};

type CucherOffer = {
  id?: string | number;
  titulo?: string | null;
  descripcion?: string | null;
  precio_oferta?: number | string | null;
  precio_original?: number | string | null;
  imagen_url?: string | null;
  descuento_porcentaje?: number | string | null;
  categoria?: string | null;
  idarticulo?: string | number | null;
  fecha_fin?: string | null;
};

export async function extractProductsFromVtexApi(
  url: string,
  source: ScrapingSource,
  query: string,
  customHeaders: Record<string, string> = {},
): Promise<ProductSearchResult[]> {
  const searchUrls = buildVtexProductSearchUrls(url, query);
  let lastError: Error | null = null;

  for (const searchUrl of searchUrls) {
    try {
      const products = await fetchVtexProducts(searchUrl, source, customHeaders);
      const results = products
        .map((product) => toVtexProductResult(source, query, product))
        .filter((result): result is ProductSearchResult => result !== null);
      const hasUsefulResults = results.some(
        (result) => result.confidenceScore >= VTEX_MIN_USEFUL_CONFIDENCE_SCORE,
      );

      if (
        hasUsefulResults ||
        searchUrl === searchUrls[searchUrls.length - 1]
      ) {
        return results;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
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

async function fetchVtexProducts(
  url: string,
  source: ScrapingSource,
  customHeaders: Record<string, string>,
) {
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

  return payload as VtexProduct[];
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

export async function extractProductsFromCucherSupabase(
  url: string,
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      apikey: config.cucher.supabaseAnonKey,
      authorization: `Bearer ${config.cucher.supabaseAnonKey}`,
      "user-agent":
        "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
    },
  });

  if (response.status === 402) {
    throw new Error(
      "Cucher Mercados no expone ofertas por API publica en este momento; Supabase respondio 402. Requiere nueva credencial, endpoint autorizado o carga manual de lista.",
    );
  }

  if (!response.ok) {
    throw new Error(`API Cucher Mercados respondio ${response.status}`);
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new Error("Respuesta Cucher Mercados inesperada");
  }

  const results = (payload as CucherOffer[])
    .slice(0, source.maxCards ?? 80)
    .map((offer) => toCucherOfferResult(source, query, offer))
    .filter((result): result is ProductSearchResult => result !== null);

  return filterCucherResultsForQuery(results, query);
}

function toVtexProductResult(
  source: ScrapingSource,
  query: string,
  product: VtexProduct,
): ProductSearchResult | null {
  const selectedOffer = findBestVtexOffer(product);
  const rawName = (
    selectedOffer?.item.name ??
    product.productName ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const price = selectedOffer?.price ?? null;

  if (!rawName || price === null) {
    return null;
  }

  const sourceCategory = findVtexCategory(product);
  const category = findCatalogCategory(rawName)?.name ?? sourceCategory;
  const matchText = findAllowedBrand(rawName)
    ? [category, rawName].filter(Boolean).join(" ")
    : [product.brand, category, product.productName, rawName]
        .filter(Boolean)
        .join(" ");
  const sku = findVtexSku(product, selectedOffer?.item);
  const barcodes = findVtexBarcodes(product);
  const pricingText = [
    matchText,
    selectedOffer?.item.measurementUnit &&
    selectedOffer.item.unitMultiplier &&
    selectedOffer.item.unitMultiplier !== 1
      ? `${selectedOffer.item.unitMultiplier} ${selectedOffer.item.measurementUnit}`
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
    sku,
    barcodes,
    brand: product.brand || undefined,
    category: category ?? undefined,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl: product.link ?? null,
    imageUrl: findVtexImageUrl(product, selectedOffer?.item),
    confidenceScore: calculateVtexConfidenceScore(query, matchText, [
      sku,
      ...barcodes,
    ]),
  }, pricingText);
}

function toCucherOfferResult(
  source: ScrapingSource,
  query: string,
  offer: CucherOffer,
): ProductSearchResult | null {
  const rawName = String(offer.titulo ?? offer.descripcion ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const price = parseCucherPrice(offer.precio_oferta);

  if (!rawName || price === null) {
    return null;
  }

  const sku = normalizeIdentifier(offer.idarticulo?.toString());
  const originalPrice = parseCucherPrice(offer.precio_original);
  const catalogCategory = findCatalogCategory(
    [rawName, offer.categoria ?? ""].join(" "),
  )?.name;
  const category = catalogCategory ?? offer.categoria ?? undefined;
  const brand = findAllowedBrand(rawName)?.name;
  const matchText = [brand, category, offer.categoria, rawName, offer.idarticulo]
    .filter(Boolean)
    .join(" ");
  const priceCondition = [
    "Oferta Cucher Mercados",
    offer.fecha_fin ? `valida hasta ${formatCucherDate(offer.fecha_fin)}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return withUnitPricing({
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: sku || null,
    barcodes: sku && /^\d{8,14}$/.test(sku) ? [sku] : [],
    brand: brand ?? undefined,
    category,
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    priceCondition,
    alternatePrices:
      originalPrice !== null && originalPrice > price
        ? [
            {
              label: "Precio original",
              price: originalPrice,
              comparisonPrice: originalPrice,
            },
          ]
        : [],
    availability: "in_stock",
    currency: "ARS",
    productUrl: getSourceUrl(source),
    imageUrl: offer.imagen_url ?? null,
    confidenceScore: calculateVtexConfidenceScore(query, matchText, [sku]),
  });
}

function filterCucherResultsForQuery(
  results: ProductSearchResult[],
  query: string,
) {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return results;
  }

  const queryType = detectQueryType(query);

  if (queryType === "barcode" || queryType === "sku") {
    return results.filter((result) => result.confidenceScore === 100);
  }

  return results.filter((result) => result.confidenceScore >= 60);
}

function toStaticHtmlProductResult(
  cardHtml: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
): ProductSearchResult | null {
  const rawName = decodeHtml(stripTags(findStaticProductName(cardHtml)));
  const rawPrice = decodeHtml(stripTags(findStaticProductPrice(cardHtml)));
  const maxiconsumoPricing = findMaxiconsumoUnitPricing(cardHtml, source);
  const price = maxiconsumoPricing?.price ?? normalizePrice(rawPrice);

  if (!rawName || price === null || textLooksOutOfStock(cardHtml)) {
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
    ...(maxiconsumoPricing
      ? {
          comparisonPrice: maxiconsumoPricing.price,
          priceCondition: maxiconsumoPricing.priceCondition,
          alternatePrices: maxiconsumoPricing.alternatePrices,
          packageQuantity: null,
          packageLabel: null,
        }
      : {}),
    sku:
      decodeHtml(stripTags(matchFirst(cardHtml, /product-sku[\s\S]*?SKU<\/span>\s*([^<]+)/i))) ||
      null,
    category: product.category ?? findCatalogCategory(rawName)?.name,
  };
}

function findMaxiconsumoUnitPricing(
  cardHtml: string,
  source: ScrapingSource,
): MaxiconsumoUnitPricing | null {
  if (!source.id.startsWith("maxiconsumo")) {
    return null;
  }

  const text = decodeHtml(stripTags(cardHtml));
  const bulkClosedUnitPrice = findPriceAfterLabel(
    text,
    "Precio unitario por bulto cerrado",
  );
  const unitPrice = findPriceAfterLabel(text, "Precio unitario", [
    "Precio unitario por bulto cerrado",
  ]);

  if (bulkClosedUnitPrice === null && unitPrice === null) {
    return null;
  }

  if (bulkClosedUnitPrice !== null) {
    return {
      price: bulkClosedUnitPrice,
      priceCondition: "Unitario por bulto cerrado",
      alternatePrices:
        unitPrice !== null && !pricesAreEqual(unitPrice, bulkClosedUnitPrice)
          ? [
              {
                label: "Precio unitario",
                price: unitPrice,
                comparisonPrice: unitPrice,
              },
            ]
          : [],
    };
  }

  if (unitPrice === null) {
    return null;
  }

  return {
    price: unitPrice,
    priceCondition: "Precio unitario",
    alternatePrices: [],
  };
}

function findPriceAfterLabel(
  text: string,
  label: string,
  excludedLabels: string[] = [],
) {
  const pricePattern = "\\$\\s*\\d[\\d.,]*";
  const pattern = new RegExp(
    `${buildFlexibleTextPattern(label)}\\s*(${pricePattern})`,
    "gi",
  );

  for (const match of text.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const snippet = normalizeComparableText(text.slice(matchIndex, matchIndex + 90));
    const isExcluded = excludedLabels.some((excludedLabel) =>
      snippet.startsWith(normalizeComparableText(excludedLabel)),
    );

    if (isExcluded) {
      continue;
    }

    const price = normalizePrice(match[1] ?? "");

    if (price !== null) {
      return price;
    }
  }

  return null;
}

function buildFlexibleTextPattern(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pricesAreEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.01;
}

function productLooksOutOfStock(product: WooCommercePmwProduct) {
  if (product.in_stock === false || product.is_in_stock === false) {
    return true;
  }

  if (
    typeof product.stock === "number" &&
    Number.isFinite(product.stock) &&
    product.stock <= 0
  ) {
    return true;
  }

  return textLooksOutOfStock(
    product.stock_status,
    product.stockStatus,
    product.availability,
    typeof product.stock === "string" ? product.stock : null,
  );
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

  if (
    !rawName ||
    price === null ||
    !Number.isFinite(price) ||
    price <= 0 ||
    productLooksOutOfStock(product)
  ) {
    return null;
  }

  const brand = product.brand || inferBrandFromCategories(product.category);
  const category =
    findCatalogCategory(rawName)?.name ??
    findWooCommerceCategory(product.category);
  const matchText = findAllowedBrand(rawName)
    ? [category, rawName].filter(Boolean).join(" ")
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
    category: category ?? undefined,
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

  if (!rawName || price === null || textLooksOutOfStock(cardHtml)) {
    return null;
  }

  const sku =
    readHtmlAttribute(cardHtml, "id-codigo-producto") ||
    readHtmlAttribute(cardHtml, "data-codigo") ||
    null;
  const brand = decodeHtml(readHtmlAttribute(cardHtml, "data-marca"));
  const categories = decodeHtml(readHtmlAttribute(cardHtml, "data-rutacategorias"));
  const category =
    findCatalogCategory(rawName)?.name ?? cleanCategoryValue(categories);
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
    category: category ?? undefined,
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

function findWooCommerceCategory(categories: string[] | undefined) {
  const category = categories?.find((item) => isUsefulSourceCategory(item));

  return cleanCategoryValue(category);
}

function findVtexCategory(product: VtexProduct) {
  const category = product.categories
    ?.map((item) => item.replace(/^\/|\/$/g, "").split("/").filter(Boolean))
    .flat()
    .reverse()
    .find((item) => isUsefulSourceCategory(item));

  return cleanCategoryValue(category);
}

function cleanCategoryValue(value: string | null | undefined) {
  const cleanedValue = value?.replace(/[/>]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleanedValue || !isUsefulSourceCategory(cleanedValue)) {
    return null;
  }

  return cleanedValue;
}

function isUsefulSourceCategory(value: string | null | undefined) {
  const normalized = normalizeProductName(value ?? "");

  return Boolean(normalized) && !isGenericWooCommerceCategory(normalized);
}

function isGenericWooCommerceCategory(category: string) {
  const normalized = normalizeProductName(category);
  const genericTerms = [
    "nuevo",
    "productos",
    "supermercado",
    "almacen",
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

function calculateVtexConfidenceScore(
  query: string,
  matchText: string,
  identifiers: Array<string | null | undefined>,
) {
  const queryType = detectQueryType(query);

  if (queryType === "barcode" || queryType === "sku") {
    const normalizedQueryIdentifier = normalizeIdentifier(query);
    const exactIdentifierMatch = identifiers.some(
      (identifier) => normalizeIdentifier(identifier) === normalizedQueryIdentifier,
    );

    if (normalizedQueryIdentifier && exactIdentifierMatch) {
      return 100;
    }
  }

  return calculateConfidenceScore(query, matchText);
}

function normalizeIdentifier(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCucherPrice(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    return normalizePrice(value);
  }

  return null;
}

function formatCucherDate(value: string) {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function findVtexSku(product: VtexProduct, preferredItem?: VtexItem) {
  return (
    product.productReferenceCode ||
    product.productReference ||
    preferredItem?.itemId ||
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

function buildVtexProductSearchUrls(url: string, query: string) {
  const urls = new Set<string>();
  const compactQuery = query.replace(/\D/g, "");
  const queryType = detectQueryType(query);
  const shouldUseTextFallbacks =
    queryType === "text" || /\s/.test(query.trim());

  if (queryType === "barcode" && compactQuery) {
    const eanUrl = replaceVtexSearchWithFilter(
      url,
      "alternateIds_Ean",
      compactQuery,
    );

    if (eanUrl) {
      urls.add(eanUrl);
    }
  }

  urls.add(url);

  if (shouldUseTextFallbacks) {
    for (const fallbackQuery of buildVtexFallbackQueries(query)) {
      const fallbackUrl = replaceVtexTextSearch(url, fallbackQuery);

      if (fallbackUrl) {
        urls.add(fallbackUrl);
      }
    }
  }

  return Array.from(urls);
}

function buildVtexFallbackQueries(query: string) {
  const normalizedQuery = normalizeQuery(query);
  const withoutPackCount = stripVtexPackCount(normalizedQuery);
  const withoutSizes = stripVtexSizes(withoutPackCount);

  return Array.from(
    new Set([normalizedQuery, withoutPackCount, withoutSizes].filter(Boolean)),
  ).filter((fallbackQuery) => fallbackQuery !== query.trim());
}

function stripVtexPackCount(value: string) {
  const unitPattern = "(?:grs?|g|kg|cc|ml|lts?|lt|l|unid\\.?|unidad(?:es)?|uni|u)";

  return value
    .replace(
      new RegExp(
        `\\b(?:pack|caja|cajon|display|bulto|fardo|bolsa|paquete)\\s*(?:x|por|de)?\\s*\\d{1,3}\\b`,
        "gi",
      ),
      " ",
    )
    .replace(
      new RegExp(`\\b\\d{1,3}\\s*(?:x|\\*)\\s*(?=\\d+(?:[,.]\\d+)?\\s*${unitPattern}\\b)`, "gi"),
      " ",
    )
    .replace(
      new RegExp(`\\b\\d{1,3}\\s+(?=\\d+(?:[,.]\\d+)?\\s*${unitPattern}\\b)`, "gi"),
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripVtexSizes(value: string) {
  return value
    .replace(
      /\b\d+(?:[,.]\d+)?\s*(grs?|g|kg|cc|ml|lts?|lt|l|unid\.?|unidad(?:es)?|uni|u)\b/gi,
      " ",
    )
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceVtexTextSearch(url: string, query: string) {
  try {
    const parsedUrl = new URL(url);
    const placeholder = "__VTEX_QUERY__";
    parsedUrl.searchParams.delete("fq");
    parsedUrl.searchParams.set("ft", placeholder);
    return parsedUrl.toString().replace(placeholder, encodeURIComponent(query));
  } catch {
    return null;
  }
}

function replaceVtexSearchWithFilter(
  url: string,
  fieldName: string,
  value: string,
) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.delete("ft");
    parsedUrl.searchParams.delete("_from");
    parsedUrl.searchParams.delete("_to");
    parsedUrl.searchParams.set("fq", `${fieldName}:${value}`);
    return parsedUrl.toString();
  } catch {
    return null;
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

function findBestVtexOffer(product: VtexProduct): VtexOfferSelection | null {
  const selections: VtexOfferSelection[] = [];

  for (const item of product.items ?? []) {
    for (const seller of item.sellers ?? []) {
      const offer = seller.commertialOffer;

      if (!offer) {
        continue;
      }

      if (
        offer?.IsAvailable === false ||
        (typeof offer?.AvailableQuantity === "number" &&
          offer.AvailableQuantity <= 0)
      ) {
        continue;
      }

      const price = findVtexOfferPrice(offer);

      if (price !== null) {
        selections.push({ item, seller, offer, price });
      }
    }
  }

  return (
    selections.sort((first, second) => {
      const sellerPriority =
        getVtexSellerPriority(first.seller) - getVtexSellerPriority(second.seller);

      if (sellerPriority !== 0) {
        return sellerPriority;
      }

      return first.price - second.price;
    })[0] ?? null
  );
}

function findVtexOfferPrice(offer: VtexCommercialOffer | undefined) {
  if (!offer) {
    return null;
  }

  const currentPrices = [
    offer.Price,
    offer.spotPrice,
    offer.SpotPrice,
    offer.FullSellingPrice,
  ].flatMap((value) => {
    const normalizedValue = normalizePositiveNumber(value);
    return normalizedValue === null ? [] : [normalizedValue];
  });

  if (currentPrices.length > 0) {
    return Math.min(...currentPrices);
  }

  return (
    normalizePositiveNumber(offer.PriceWithoutDiscount) ??
    normalizePositiveNumber(offer.ListPrice)
  );
}

function normalizePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getVtexSellerPriority(seller: VtexSeller) {
  const sellerName = seller.sellerName?.toLowerCase() ?? "";

  if (seller.sellerId === "1" || sellerName.includes("carrefour")) {
    return 0;
  }

  return 1;
}

function findVtexImageUrl(product: VtexProduct, preferredItem?: VtexItem) {
  const items = [preferredItem, ...(product.items ?? [])].filter(
    (item): item is VtexItem => Boolean(item),
  );

  for (const item of items) {
    const imageUrl = item.images?.find((image) => image.imageUrl)?.imageUrl;

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}
