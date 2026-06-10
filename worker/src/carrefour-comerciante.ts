import type { BrowserContext, Page } from "playwright";
import { findAllowedBrand } from "./brands.js";
import { launchBrowser } from "./browser.js";
import { findCatalogCategory } from "./categories.js";
import { config } from "./config.js";
import { createProductResult } from "./extractors.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import { textLooksOutOfStock } from "./stock.js";
import type { AlternatePrice, ProductSearchResult, ScrapingSource } from "./types.js";

const BASE_URL = "https://comerciante.carrefour.com.ar/";

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

type CarrefourComercianteDeliveryType = "envio" | "retiro";

export async function extractProductsFromCarrefourComerciante(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  assertCarrefourComercianteConfig();

  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    userAgent: config.carrefourComerciante.userAgent,
  });

  try {
    if (await seedCarrefourComercianteSessionCookies(context)) {
      const page = await context.newPage();

      try {
        const url = buildCarrefourComercianteProductsUrl(source, query);
        const html = await fetchCarrefourComercianteProductsHtml(page, url, query);
        return extractCarrefourComercianteProductsFromHtml(html, source, query, url);
      } catch (error) {
        throw enrichCookieSessionError(error);
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    let lastError: unknown;

    for (const deliveryType of getCarrefourComercianteDeliveryTypes()) {
      const page = await context.newPage();

      try {
        await establishCarrefourComercianteSession(page, deliveryType);

        const url = buildCarrefourComercianteProductsUrl(source, query);
        const html = await fetchCarrefourComercianteProductsHtml(page, url, query);
        return extractCarrefourComercianteProductsFromHtml(html, source, query, url);
      } catch (error) {
        lastError = error;

        if (!shouldRetryWithNextDeliveryType(error)) {
          throw error;
        }
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Carrefour Comerciante no pudo completar la consulta.");
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
      "Carrefour Comerciante devolvio productos pero precios privados; la sesion no quedo autorizada o reCAPTCHA Enterprise rechazo el login automatico. Para esta fuente conviene cargar CARREFOUR_COMERCIANTE_COOKIE con una sesion manual vigente.",
    );
  }

  return [];
}

async function establishCarrefourComercianteSession(
  page: Page,
  deliveryType: CarrefourComercianteDeliveryType,
) {
  page.setDefaultTimeout(config.carrefourComerciante.loginTimeoutMs);

  await page.goto(BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: config.carrefourComerciante.loginTimeoutMs,
  });

  try {
    await page.waitForFunction(
      () =>
        Boolean(
          (
            window as unknown as {
              grecaptcha?: {
                enterprise?: {
                  execute?: unknown;
                };
              };
              jQuery?: unknown;
            }
          ).grecaptcha?.enterprise?.execute &&
            (window as unknown as { jQuery?: unknown }).jQuery,
        ),
      null,
      { timeout: config.carrefourComerciante.recaptchaTimeoutMs },
    );
  } catch {
    throw new Error(
      `Carrefour Comerciante no cargo formulario/reCAPTCHA Enterprise en ${config.carrefourComerciante.recaptchaTimeoutMs}ms; la fuente queda sin datos para no bloquear el tablero.`,
    );
  }

  const navigationPromise = page
    .waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: config.carrefourComerciante.loginTimeoutMs,
    })
    .catch(() => null);

  await page.evaluate(
    ({ deliveryType: selectedDeliveryType, formValues }) => {
      const form = document.querySelector<HTMLFormElement>("#userForm");

      if (!form) {
        throw new Error("No se encontro el formulario de Carrefour Comerciante.");
      }

      const setInputValue = (selector: string, value: string) => {
        const input = document.querySelector<HTMLInputElement>(selector);

        if (!input) {
          return;
        }

        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const ensureSelectedOption = (
        selector: string,
        value: string,
        label = value,
      ) => {
        const select = document.querySelector<HTMLSelectElement>(selector);

        if (!select) {
          return;
        }

        if (!Array.from(select.options).some((option) => option.value === value)) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          select.appendChild(option);
        }

        select.value = value;
      };

      document
        .querySelector<HTMLInputElement>('input[name="customerType"][value="business"]')
        ?.click();

      const deliveryRadios = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="delivery"]'),
      );

      for (const radio of deliveryRadios) {
        radio.checked = radio.value === selectedDeliveryType;
      }

      const selectedDelivery =
        document.querySelector<HTMLInputElement>("#selected_delivery");

      if (selectedDelivery) {
        selectedDelivery.value = selectedDeliveryType;
      }

      const envioCheckbox = document.querySelector<HTMLInputElement>("#envio");

      if (envioCheckbox) {
        envioCheckbox.checked = selectedDeliveryType === "envio";
      }

      setInputValue("#url_c", window.location.href);
      ensureSelectedOption("#region", formValues.region);
      ensureSelectedOption(
        "#seller",
        formValues.seller,
        "CARREFOUR MAXI RESISTENCIA CHACO",
      );
      setInputValue("#user-name", formValues.name);
      setInputValue("#user-cuit", formValues.numberId);
      setInputValue("#user-phone", formValues.phone);
      setInputValue("#user-email", formValues.email);

      const submitButton =
        document.querySelector<HTMLButtonElement>("#btn_step3") ?? undefined;
      form.requestSubmit(submitButton);
    },
    {
      deliveryType,
      formValues: buildCarrefourComercianteLoginFormValues(),
    },
  );

  const navigation = await navigationPromise;

  if (!navigation && !page.url().startsWith(BASE_URL)) {
    throw new Error("Carrefour Comerciante no completo la navegacion de login.");
  }
}

async function seedCarrefourComercianteSessionCookies(context: BrowserContext) {
  const cookieHeader = config.carrefourComerciante.cookie;

  if (!cookieHeader) {
    return false;
  }

  const cookies = parseCookieHeader(cookieHeader).map(({ name, value }) => ({
    name,
    value,
    domain: "comerciante.carrefour.com.ar",
    path: "/",
    secure: true,
    sameSite: "Lax" as const,
  }));

  if (cookies.length === 0) {
    return false;
  }

  await context.addCookies(cookies);
  return true;
}

function parseCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .flatMap((part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex <= 0) {
        return [];
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();

      return name && value ? [{ name, value }] : [];
    });
}

function enrichCookieSessionError(error: unknown) {
  if (
    error instanceof Error &&
    error.message.toLowerCase().includes("precios privados")
  ) {
    return new Error(
      "Carrefour Comerciante recibio CARREFOUR_COMERCIANTE_COOKIE, pero la sesion sigue sin precios. Renovar la cookie desde una sesion manual que ya muestre precios.",
    );
  }

  return error;
}

async function fetchCarrefourComercianteProductsHtml(
  page: Page,
  url: string,
  query: string,
) {
  const searchUrl = `${BASE_URL}search/${buildCarrefourComercianteSearchSlug(query)}`;

  await page.goto(searchUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.carrefourComerciante.productTimeoutMs,
  });

  const response = await page.evaluate(async (productsUrl) => {
    const fetchResponse = await fetch(productsUrl, {
      credentials: "include",
      headers: {
        accept: "text/html, */*; q=0.01",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    return {
      ok: fetchResponse.ok,
      status: fetchResponse.status,
      text: await fetchResponse.text(),
    };
  }, url);

  if (!response.ok) {
    throw new Error(
      `Carrefour Comerciante respondio ${response.status} al consultar productos.`,
    );
  }

  return response.text;
}

function getCarrefourComercianteDeliveryTypes(): CarrefourComercianteDeliveryType[] {
  const configuredDeliveryType =
    config.carrefourComerciante.deliveryType === "envio" ? "envio" : "retiro";
  const fallbackDeliveryType =
    configuredDeliveryType === "envio" ? "retiro" : "envio";

  return [configuredDeliveryType, fallbackDeliveryType];
}

function shouldRetryWithNextDeliveryType(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("no completo la navegacion") ||
    message.includes("respondio 4") ||
    message.includes("respondio 5")
  );
}

function buildCarrefourComercianteProductsUrl(
  source: ScrapingSource,
  query: string,
) {
  return source.searchUrlTemplate.replaceAll(
    "{query}",
    buildCarrefourComercianteSearchSlug(query),
  );
}

function buildCarrefourComercianteSearchSlug(query: string) {
  return encodeURIComponent(query.trim().replace(/\s+/g, "-"));
}

function buildCarrefourComercianteLoginFormValues() {
  return {
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
