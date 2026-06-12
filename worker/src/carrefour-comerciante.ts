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
type CarrefourComercianteExtractionIssue = {
  status: "failed" | "no_results";
  message: string;
};

export type CarrefourComercianteExtractionResult = {
  products: ProductSearchResult[];
  issue?: CarrefourComercianteExtractionIssue;
};

export type CarrefourComercianteSessionValidationRequest = {
  cookie?: string;
  userAgent?: string;
  query?: string;
};

export type CarrefourComercianteSessionValidationResponse = {
  ok: boolean;
  status:
    | "authorized"
    | "private_prices"
    | "missing_cookie"
    | "logged_out"
    | "no_public_products"
    | "failed";
  message: string;
  checkedAt: string;
  query: string;
  durationMs: number;
  productsCount: number;
  privateProductsCount: number;
  visiblePriceProductsCount: number;
  sampleProducts: Array<{
    name: string;
    price: number | null;
    barcode: string | null;
  }>;
  nextAction: string;
  requiredEnv: string[];
};

export async function extractProductsFromCarrefourComerciante(
  source: ScrapingSource,
  query: string,
): Promise<CarrefourComercianteExtractionResult> {
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
        return extractCarrefourComercianteProductsWithDiagnostics(
          html,
          source,
          query,
          url,
          "cookie",
        );
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
        return extractCarrefourComercianteProductsWithDiagnostics(
          html,
          source,
          query,
          url,
          "auto-login",
        );
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

export async function validateCarrefourComercianteSession(
  request: CarrefourComercianteSessionValidationRequest,
): Promise<CarrefourComercianteSessionValidationResponse> {
  const startedAt = Date.now();
  const query = (request.query?.trim() || "alfajor").slice(0, 120);
  const cookie = request.cookie?.trim() || config.carrefourComerciante.cookie;
  const userAgent =
    request.userAgent?.trim() || config.carrefourComerciante.userAgent;
  const requiredEnv = [
    "CARREFOUR_COMERCIANTE_ENABLED=true",
    "CARREFOUR_COMERCIANTE_COOKIE",
    "CARREFOUR_COMERCIANTE_USER_AGENT",
    "CARREFOUR_COMERCIANTE_REGION=CHACO",
    "CARREFOUR_COMERCIANTE_SELLER_ID=506",
    "CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio",
  ];

  if (!cookie) {
    return {
      ok: false,
      status: "missing_cookie",
      message:
        "No hay cookie para validar. Inicia sesion manualmente en Carrefour Comerciante, confirma que ves precios y copia el header Cookie.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      privateProductsCount: 0,
      visiblePriceProductsCount: 0,
      sampleProducts: [],
      nextAction:
        "Copiar una cookie vigente desde una sesion manual donde los precios ya sean visibles.",
      requiredEnv,
    };
  }

  try {
    const url = buildCarrefourComercianteProductsUrlFromQuery(query);
    const html = await fetchCarrefourComercianteProductsHtmlWithCookie(
      url,
      cookie,
      userAgent,
      query,
    );
    const cards = extractCarrefourComercianteCards(html);
    const visiblePriceCards = cards.filter((card) => card.price !== null);
    const privateCards = cards.filter(
      (card) => card.hasVisibleProduct && card.hasPrivatePrice,
    );
    const sampleProducts = cards.slice(0, 5).map((card) => ({
      name: card.name,
      price: card.price,
      barcode: card.barcode,
    }));

    if (visiblePriceCards.length > 0) {
      return {
        ok: true,
        status: "authorized",
        message:
          "Sesion valida: Carrefour Comerciante devolvio productos con precios visibles.",
        checkedAt: new Date().toISOString(),
        query,
        durationMs: Date.now() - startedAt,
        productsCount: cards.length,
        privateProductsCount: privateCards.length,
        visiblePriceProductsCount: visiblePriceCards.length,
        sampleProducts,
        nextAction:
          "Cargar CARREFOUR_COMERCIANTE_COOKIE y CARREFOUR_COMERCIANTE_USER_AGENT en el entorno del worker y redeployar.",
        requiredEnv,
      };
    }

    if (privateCards.length > 0) {
      return {
        ok: false,
        status: "private_prices",
        message:
          "La cookie funciona para ver catalogo publico, pero Carrefour sigue devolviendo precios privados. La sesion no esta autorizada para precios.",
        checkedAt: new Date().toISOString(),
        query,
        durationMs: Date.now() - startedAt,
        productsCount: cards.length,
        privateProductsCount: privateCards.length,
        visiblePriceProductsCount: 0,
        sampleProducts,
        nextAction:
          "Abrir Carrefour Comerciante manualmente, completar sucursal/datos hasta ver precios reales y volver a copiar la cookie de esa sesion.",
        requiredEnv,
      };
    }

    const publicHtml = await fetchPublicCarrefourComercianteProductsHtml(url);
    const publicCards = extractCarrefourComercianteCards(publicHtml);

    if (publicCards.length > 0) {
      return {
        ok: false,
        status: "logged_out",
        message:
          "La busqueda existe en Carrefour, pero la cookie no mantuvo una sesion autorizada.",
        checkedAt: new Date().toISOString(),
        query,
        durationMs: Date.now() - startedAt,
        productsCount: 0,
        privateProductsCount: 0,
        visiblePriceProductsCount: 0,
        sampleProducts: publicCards.slice(0, 5).map((card) => ({
          name: card.name,
          price: card.price,
          barcode: card.barcode,
        })),
        nextAction:
          "Renovar la cookie desde una sesion manual vigente y copiar tambien el User-Agent del mismo navegador.",
        requiredEnv,
      };
    }

    return {
      ok: false,
      status: "no_public_products",
      message:
        "Carrefour Comerciante no devolvio productos publicos para esta consulta de prueba.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      privateProductsCount: 0,
      visiblePriceProductsCount: 0,
      sampleProducts: [],
      nextAction:
        "Probar con otra busqueda frecuente, por ejemplo alfajor, galletitas o leche.",
      requiredEnv,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo validar la sesion de Carrefour Comerciante.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      privateProductsCount: 0,
      visiblePriceProductsCount: 0,
      sampleProducts: [],
      nextAction:
        "Revisar que la cookie y el User-Agent esten completos y correspondan a la misma sesion.",
      requiredEnv,
    };
  }
}

export function extractCarrefourComercianteProductsFromHtml(
  html: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
) {
  const analysis = analyzeCarrefourComercianteProductsFromHtml(
    html,
    source,
    query,
    baseUrl,
  );

  if (analysis.issue?.status === "failed") {
    throw new Error(analysis.issue.message);
  }

  return analysis.products;
}

function analyzeCarrefourComercianteProductsFromHtml(
  html: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
): CarrefourComercianteExtractionResult {
  const cards = extractCarrefourComercianteCards(html);
  const results = cards
    .slice(0, source.maxCards ?? 80)
    .map((card) => toCarrefourComercianteProductResult(card, source, query, baseUrl))
    .filter((result): result is ProductSearchResult => result !== null);

  if (results.length > 0) {
    return { products: results };
  }

  const hasProductsWithPrivatePrices = cards.some(
    (card) => card.hasVisibleProduct && card.hasPrivatePrice,
  );

  if (hasProductsWithPrivatePrices) {
    return {
      products: [],
      issue: {
        status: "failed",
        message:
          "Carrefour Comerciante devolvio productos pero precios privados; la sesion no quedo autorizada o reCAPTCHA Enterprise rechazo el login automatico. Para esta fuente conviene cargar CARREFOUR_COMERCIANTE_COOKIE con una sesion manual vigente.",
      },
    };
  }

  return { products: [] };
}

async function extractCarrefourComercianteProductsWithDiagnostics(
  html: string,
  source: ScrapingSource,
  query: string,
  baseUrl: string,
  sessionKind: "cookie" | "auto-login",
): Promise<CarrefourComercianteExtractionResult> {
  const analysis = analyzeCarrefourComercianteProductsFromHtml(
    html,
    source,
    query,
    baseUrl,
  );

  if (
    analysis.products.length > 0 ||
    extractCarrefourComercianteCards(html).length > 0
  ) {
    if (
      analysis.issue?.status === "failed" &&
      sessionKind === "cookie" &&
      /precios privados/i.test(analysis.issue.message)
    ) {
      return {
        products: [],
        issue: {
          status: "failed",
          message:
            "Carrefour Comerciante recibio CARREFOUR_COMERCIANTE_COOKIE, pero la sesion sigue mostrando precios privados. Renovar la cookie desde una sesion manual donde ya se vean precios.",
        },
      };
    }

    return analysis;
  }

  if (looksLikeCarrefourComercianteLoggedOutHtml(html)) {
    return {
      products: [],
      issue: {
        status: "failed",
        message:
          sessionKind === "cookie"
            ? "Carrefour Comerciante recibio CARREFOUR_COMERCIANTE_COOKIE, pero la respuesta quedo sin sesion. Renovar la cookie desde una sesion manual donde ya se vean precios."
            : "Carrefour Comerciante no mantuvo la sesion luego del login automatico.",
      },
    };
  }

  const publicHtml = await fetchPublicCarrefourComercianteProductsHtml(baseUrl);
  const publicCards = extractCarrefourComercianteCards(publicHtml);

  if (publicCards.length === 0) {
    return { products: [] };
  }

  if (publicCards.some((card) => card.hasPrivatePrice)) {
    return {
      products: [],
      issue: {
        status: "failed",
        message:
          sessionKind === "cookie"
            ? "Carrefour Comerciante encontro productos publicos para esta busqueda, pero la cookie manual no devuelve el catalogo autorizado. Renovar CARREFOUR_COMERCIANTE_COOKIE desde una sesion manual vigente con precios visibles."
            : "Carrefour Comerciante encontro productos publicos para esta busqueda, pero el login automatico no habilito precios. Cargar CARREFOUR_COMERCIANTE_COOKIE desde una sesion manual vigente.",
      },
    };
  }

  return {
    products: [],
    issue: {
      status: "failed",
      message:
        "Carrefour Comerciante encontro productos publicos para esta busqueda, pero la sesion activa devolvio una respuesta vacia. Revisar cookie, sucursal y tipo de entrega.",
    },
  };
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

async function fetchPublicCarrefourComercianteProductsHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html, */*; q=0.01",
      "accept-language": "es-AR,es;q=0.9,en;q=0.8",
      "user-agent": config.carrefourComerciante.userAgent,
      "x-requested-with": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    return "";
  }

  return response.text();
}

async function fetchCarrefourComercianteProductsHtmlWithCookie(
  url: string,
  cookie: string,
  userAgent: string,
  query: string,
) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html, */*; q=0.01",
      "accept-language": "es-AR,es;q=0.9,en;q=0.8",
      cookie,
      referer: `${BASE_URL}search/${buildCarrefourComercianteSearchSlug(query)}`,
      "user-agent": userAgent,
      "x-requested-with": "XMLHttpRequest",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Carrefour Comerciante respondio ${response.status} al validar la sesion.`,
    );
  }

  return response.text();
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

function buildCarrefourComercianteProductsUrlFromQuery(query: string) {
  return `${BASE_URL}products?currentUrl=search/${buildCarrefourComercianteSearchSlug(
    query,
  )}&filters=&orderBy=&currentPage=1&itemsPerPage=24&method=productsList`;
}

function buildCarrefourComercianteSearchSlug(query: string) {
  return encodeURIComponent(query.trim().replace(/\s+/g, "-"));
}

function looksLikeCarrefourComercianteLoggedOutHtml(html: string) {
  return /Por favor,\s*inicia sesi[oó]n|Te pedimos que completes los datos|id=["']userForm["']|name=["']token["']/i.test(
    html,
  );
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
  if (!config.carrefourComerciante.enabled) {
    throw new Error(
      "Carrefour Comerciante esta deshabilitado. Activar CARREFOUR_COMERCIANTE_ENABLED=true y cargar una sesion manual vigente.",
    );
  }

  if (config.carrefourComerciante.cookie) {
    return;
  }

  if (!config.carrefourComerciante.autoLoginEnabled) {
    throw new Error(
      "Carrefour Comerciante requiere CARREFOUR_COMERCIANTE_COOKIE y CARREFOUR_COMERCIANTE_USER_AGENT de una sesion manual vigente. El login automatico esta desactivado por defecto porque reCAPTCHA Enterprise devuelve precios privados.",
    );
  }

  const missingFields = [
    ["CARREFOUR_COMERCIANTE_NAME", config.carrefourComerciante.name],
    ["CARREFOUR_COMERCIANTE_DOCUMENT", config.carrefourComerciante.document],
    ["CARREFOUR_COMERCIANTE_PHONE", config.carrefourComerciante.phone],
    ["CARREFOUR_COMERCIANTE_EMAIL", config.carrefourComerciante.email],
  ].flatMap(([label, value]) => (value ? [] : [label]));

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
