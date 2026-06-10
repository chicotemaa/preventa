import type { BrowserContext } from "playwright";
import { findAllowedBrand } from "./brands.js";
import { launchBrowser } from "./browser.js";
import { findCatalogCategory } from "./categories.js";
import { config } from "./config.js";
import { createProductResult } from "./extractors.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import { textLooksOutOfStock } from "./stock.js";
import type { AlternatePrice, ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

const BASE_URL = "https://comerciante.carrefour.com.ar/";
const LOGIN_URL = "https://comerciante.carrefour.com.ar/login";
const ORIGIN = "https://comerciante.carrefour.com.ar";
const RECAPTCHA_SITE_KEY = "6LdiZHIqAAAAAJO8Gn9RbfC6bMckPmMXgoBrqfmJ";
const LOGIN_TIMEOUT_MS = 30_000;

type CarrefourComercianteCard = {
  html: string;
  name: string;
  price: number | null;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  hasPrivatePrice: boolean;
  hasVisibleProduct: boolean;
};

export async function extractProductsFromCarrefourComerciante(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  assertCarrefourComercianteConfig();

  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  try {
    await establishCarrefourComercianteSession(context);

    const url = buildSearchUrl(source.searchUrlTemplate, query);
    const response = await context.request.get(url, {
      headers: {
        accept: "text/html, */*; q=0.01",
        referer: `${BASE_URL}search/${encodeURIComponent(query.trim())}`,
        "x-requested-with": "XMLHttpRequest",
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Carrefour Comerciante respondio ${response.status()} al consultar productos.`,
      );
    }

    const html = await response.text();
    return extractCarrefourComercianteProductsFromHtml(html, source, query, url);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

export function extractCarrefourComercianteProductsFromHtml(
  html: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
) {
  const cards = extractCarrefourComercianteCards(html);
  const results = cards
    .slice(0, source.maxCards ?? 80)
    .map((card) => toCarrefourComercianteProductResult(card, source, query, baseUrl))
    .filter((result): result is ProductSearchResult => result !== null);

  if (results.length > 0) {
    return results;
  }

  const hasProductsWithPrivatePrices = cards.some(
    (card) => card.hasVisibleProduct && card.hasPrivatePrice,
  );

  if (hasProductsWithPrivatePrices) {
    throw new Error(
      "Carrefour Comerciante devolvio productos pero precios privados; la sesion no quedo autorizada o reCAPTCHA fue rechazado.",
    );
  }

  return [];
}

async function establishCarrefourComercianteSession(context: BrowserContext) {
  const page = await context.newPage();
  page.setDefaultTimeout(LOGIN_TIMEOUT_MS);

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const token = await page.evaluate(
      async (siteKey) => {
        const recaptcha = (
          window as unknown as {
            grecaptcha?: {
              enterprise?: {
                ready?: (callback: () => void) => void;
                execute?: (
                  key: string,
                  options: { action: string },
                ) => Promise<string>;
              };
            };
          }
        ).grecaptcha?.enterprise;

        if (!recaptcha?.execute) {
          return "";
        }

        await new Promise<void>((resolve) => {
          if (typeof recaptcha.ready === "function") {
            recaptcha.ready(resolve);
            return;
          }

          resolve();
        });

        return recaptcha.execute(siteKey, { action: "signup" });
      },
      RECAPTCHA_SITE_KEY,
    );

    if (!token) {
      throw new Error(
        "Carrefour Comerciante no entrego token reCAPTCHA en runtime.",
      );
    }

    const response = await context.request.post(LOGIN_URL, {
      form: buildCarrefourComercianteLoginForm(token),
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        origin: ORIGIN,
        referer: BASE_URL,
      },
    });

    if (response.status() >= 400) {
      throw new Error(
        `Carrefour Comerciante respondio ${response.status()} en login.`,
      );
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

function buildCarrefourComercianteLoginForm(token: string) {
  return {
    action: "signup",
    token,
    sliderTO: "",
    customerType: "business",
    url_c: BASE_URL,
    delivery: config.carrefourComerciante.deliveryType,
    selected_delivery: config.carrefourComerciante.deliveryType,
    region: config.carrefourComerciante.region,
    seller: config.carrefourComerciante.sellerId,
    name: config.carrefourComerciante.name ?? "",
    numberId: config.carrefourComerciante.document ?? "",
    phone: config.carrefourComerciante.phone ?? "",
    email: config.carrefourComerciante.email ?? "",
  };
}

function assertCarrefourComercianteConfig() {
  const missingFields = [
    ["CARREFOUR_COMERCIANTE_NAME", config.carrefourComerciante.name],
    ["CARREFOUR_COMERCIANTE_DOCUMENT", config.carrefourComerciante.document],
    ["CARREFOUR_COMERCIANTE_PHONE", config.carrefourComerciante.phone],
    ["CARREFOUR_COMERCIANTE_EMAIL", config.carrefourComerciante.email],
  ].flatMap(([label, value]) => (value ? [] : [label]));

  if (!config.carrefourComerciante.enabled) {
    throw new Error(
      "Carrefour Comerciante esta deshabilitado. Activar CARREFOUR_COMERCIANTE_ENABLED=true para intentar login.",
    );
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Carrefour Comerciante requiere variables de entorno: ${missingFields.join(", ")}.`,
    );
  }
}

function extractCarrefourComercianteCards(html: string): CarrefourComercianteCard[] {
  const blocks = extractRepeatedBlocks(
    html,
    /<div[^>]*class=["'][^"']*\bitem_card_public\b[^"']*["'][^>]*>/gi,
  );

  return blocks
    .map(parseCarrefourComercianteCard)
    .filter((card): card is CarrefourComercianteCard => card !== null);
}

function parseCarrefourComercianteCard(
  cardHtml: string,
): CarrefourComercianteCard | null {
  const dataDescription = decodeHtml(readHtmlAttribute(cardHtml, "data-description"));
  const descriptionText = decodeHtml(
    stripTags(
      matchFirst(
        cardHtml,
        /<div[^>]*class=["'][^"']*\bitem_card__description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      ),
    ),
  );
  const name = (dataDescription || descriptionText).replace(/\s+/g, " ").trim();

  if (!name || textLooksOutOfStock(cardHtml)) {
    return null;
  }

  const rawPrice = readHtmlAttribute(cardHtml, "data-price");
  const price = normalizeCarrefourComerciantePrice(rawPrice, cardHtml);
  const sku =
    normalizeIdentifier(readHtmlAttribute(cardHtml, "data-codprod")) ||
    normalizeIdentifier(
      stripTags(
        matchFirst(
          cardHtml,
          /<div[^>]*class=["'][^"']*\bitem_card__cod\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        ),
      ),
    ) ||
    null;
  const barcode = normalizeIdentifier(readHtmlAttribute(cardHtml, "data-ean")) || null;
  const category = decodeHtml(readHtmlAttribute(cardHtml, "data-category"));
  const section = decodeHtml(readHtmlAttribute(cardHtml, "data-section"));
  const sector = decodeHtml(readHtmlAttribute(cardHtml, "data-sector"));
  const sourceCategory = cleanCategoryValue(category || section || sector);
  const imageUrl = resolveUrl(findCardImageUrl(cardHtml), BASE_URL);
  const productUrl =
    barcode || sku
      ? resolveUrl(`/product/${barcode || sku}`, BASE_URL)
      : resolveUrl(findCardProductUrl(cardHtml), BASE_URL);

  return {
    html: cardHtml,
    name,
    price,
    sku,
    barcode,
    brand: findAllowedBrand(name)?.name ?? null,
    category: findCatalogCategory(name)?.name ?? sourceCategory,
    imageUrl,
    productUrl,
    hasPrivatePrice: normalizePrivatePrice(rawPrice) === "private",
    hasVisibleProduct: Boolean(name),
  };
}

function toCarrefourComercianteProductResult(
  card: CarrefourComercianteCard,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
): ProductSearchResult | null {
  if (card.price === null) {
    return null;
  }

  const product = createProductResult(
    source,
    query,
    card.name,
    card.price,
    resolveUrl(card.productUrl, baseUrl),
    resolveUrl(card.imageUrl, baseUrl),
  );
  const matchText = [
    card.brand,
    card.category,
    card.name,
    card.sku,
    card.barcode,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...product,
    sku: card.sku,
    barcodes: card.barcode ? [card.barcode] : [],
    brand: card.brand ?? undefined,
    category: card.category ?? product.category,
    priceCondition: "Carrefour Comerciante - precio de sesion",
    alternatePrices: findAlternatePrices(card.html),
    availability: "in_stock",
    confidenceScore: calculateCarrefourComercianteConfidenceScore(
      query,
      matchText,
      [card.sku, card.barcode],
    ),
  };
}

function normalizeCarrefourComerciantePrice(rawPrice: string, cardHtml: string) {
  const normalizedRawPrice = normalizePrivatePrice(rawPrice);

  if (normalizedRawPrice && normalizedRawPrice !== "private") {
    const price = normalizePrice(normalizedRawPrice);

    if (price !== null) {
      return price;
    }
  }

  const visiblePrice = matchFirst(cardHtml, /\$\s*\d[\d.,]*/);
  return visiblePrice ? normalizePrice(visiblePrice) : null;
}

function normalizePrivatePrice(value: string) {
  return decodeHtml(value).trim().toLowerCase();
}

function findAlternatePrices(cardHtml: string): AlternatePrice[] {
  const fullText = decodeHtml(stripTags(cardHtml)).replace(/\s+/g, " ").trim();
  const promoPrice = findPriceAfterLabel(fullText, "precio promocion");
  const listPrice = findPriceAfterLabel(fullText, "precio lista");
  const alternatePrices: AlternatePrice[] = [];

  if (promoPrice !== null) {
    alternatePrices.push({
      label: "Precio promocion",
      price: promoPrice,
      comparisonPrice: promoPrice,
    });
  }

  if (listPrice !== null) {
    alternatePrices.push({
      label: "Precio lista",
      price: listPrice,
      comparisonPrice: listPrice,
    });
  }

  return alternatePrices;
}

function findPriceAfterLabel(text: string, label: string) {
  const pattern = new RegExp(
    `${label.replace(/\s+/g, "\\s+")}\\s*:?\\s*(\\$\\s*\\d[\\d.,]*)`,
    "i",
  );
  const match = text.match(pattern);
  return match?.[1] ? normalizePrice(match[1]) : null;
}

function calculateCarrefourComercianteConfidenceScore(
  query: string,
  matchText: string,
  identifiers: Array<string | null | undefined>,
) {
  const normalizedQueryIdentifier = normalizeIdentifier(query);
  const exactIdentifierMatch = identifiers.some(
    (identifier) =>
      normalizedQueryIdentifier &&
      normalizeIdentifier(identifier) === normalizedQueryIdentifier,
  );

  if (exactIdentifierMatch) {
    return 100;
  }

  return calculateConfidenceScore(query, matchText);
}

function extractRepeatedBlocks(html: string, pattern: RegExp) {
  const starts = Array.from(html.matchAll(pattern)).map((match) => match.index ?? 0);

  return starts.map((start, index) => {
    const nextStart = starts[index + 1] ?? html.length;
    return html.slice(start, nextStart);
  });
}

function findCardImageUrl(cardHtml: string) {
  return (
    matchFirst(
      cardHtml,
      /<img[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*class=["'][^"']*\bprincipal_img\b[^"']*["'][^>]*>/i,
    ) ||
    matchFirst(
      cardHtml,
      /<img[^>]*class=["'][^"']*\bprincipal_img\b[^"']*["'][^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i,
    ) ||
    matchFirst(cardHtml, /<img[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i)
  );
}

function findCardProductUrl(cardHtml: string) {
  return matchFirst(cardHtml, /<a[^>]*href=["']([^"']+)["'][^>]*>/i);
}

function readHtmlAttribute(html: string, attribute: string) {
  const pattern = new RegExp(`${attribute}=["']([^"']*)["']`, "i");
  return matchFirst(html, pattern);
}

function matchFirst(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return (match?.[1] ?? match?.[0] ?? "").trim();
}

function resolveUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function cleanCategoryValue(value: string | null | undefined) {
  const cleanedValue = value?.replace(/[/>]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleanedValue) {
    return null;
  }

  return cleanedValue;
}

function normalizeIdentifier(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return normalized || null;
}

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, " ");
}

function decodeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/gi, "a")
    .replace(/&eacute;/gi, "e")
    .replace(/&iacute;/gi, "i")
    .replace(/&oacute;/gi, "o")
    .replace(/&uacute;/gi, "u")
    .replace(/&ntilde;/gi, "n")
    .replace(/\s+/g, " ")
    .trim();
}
