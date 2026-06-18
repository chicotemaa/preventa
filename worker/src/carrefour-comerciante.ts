import type { BrowserContext, Page } from "playwright";
import { findAllowedBrand } from "./brands.js";
import { launchBrowser } from "./browser.js";
import {
  buildCatalogCategorySearchTerms,
  findCatalogCategory,
} from "./categories.js";
import { config } from "./config.js";
import { createProductResult } from "./extractors.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import {
  getStoredSourceSessionCredentials,
  type SourceCatalogSnapshot,
} from "./source-session-store.js";
import { textLooksOutOfStock } from "./stock.js";
import type { AlternatePrice, ProductSearchResult, ScrapingSource } from "./types.js";

const BASE_URL = "https://comerciante.carrefour.com.ar/";
const CARREFOUR_COMERCIANTE_SOURCE_ID = "carrefour-comerciante-maxi";
const DEFAULT_SYNC_QUERIES = [
  "alfajor",
  "galletitas",
  "chocolate",
  "jugo en polvo",
  "mayonesa",
  "mermelada",
  "salsa",
  "pure tomate",
  "caramelos",
  "chupetin",
  "gomas",
  "cereal",
  "barritas",
  "bon o bon",
  "cofler",
  "aguila",
  "bagley",
  "arcor",
];

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

export type CarrefourComercianteCatalogSyncRequest = {
  cookie?: string;
  userAgent?: string;
  queries?: string[];
  maxPagesPerQuery?: number;
  itemsPerPage?: number;
};

export type CarrefourComercianteLoginSessionRequest = {
  name?: string;
  document?: string;
  phone?: string;
  email?: string;
  query?: string;
};

export type CarrefourComercianteLoginSessionResponse =
  CarrefourComercianteSessionValidationResponse & {
    cookie?: string;
    userAgent: string;
  };

export async function extractProductsFromCarrefourComerciante(
  source: ScrapingSource,
  query: string,
): Promise<CarrefourComercianteExtractionResult> {
  const storedSession = await getStoredSourceSessionCredentials(source.id);
  const cookie = storedSession?.cookie ?? config.carrefourComerciante.cookie;
  const userAgent =
    storedSession?.userAgent ?? config.carrefourComerciante.userAgent;

  assertCarrefourComercianteConfig(Boolean(cookie));

  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    userAgent,
  });

  try {
    if (await seedCarrefourComercianteSessionCookies(context, cookie)) {
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

export async function loginAndValidateCarrefourComercianteSession(
  request: CarrefourComercianteLoginSessionRequest,
): Promise<CarrefourComercianteLoginSessionResponse> {
  const startedAt = Date.now();
  const query = (request.query?.trim() || "alfajor").slice(0, 120);
  const userAgent = config.carrefourComerciante.userAgent;

  if (!config.carrefourComerciante.enabled) {
    return {
      ok: false,
      status: "failed",
      message:
        "Carrefour Comerciante esta deshabilitado. Activar CARREFOUR_COMERCIANTE_ENABLED=true antes de conectar.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      privateProductsCount: 0,
      visiblePriceProductsCount: 0,
      sampleProducts: [],
      nextAction:
        "Activar CARREFOUR_COMERCIANTE_ENABLED=true en el entorno del worker y redeployar.",
      requiredEnv: getCarrefourComercianteRequiredEnv(),
      userAgent,
    };
  }

  const formValues = buildCarrefourComercianteLoginFormValues(request);

  try {
    assertCarrefourComercianteLoginFields(formValues);
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Faltan datos del comercio para conectar Carrefour Comerciante desde backend.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      privateProductsCount: 0,
      visiblePriceProductsCount: 0,
      sampleProducts: [],
      nextAction:
        "Completar nombre, CUIT/DNI, telefono e email en la pantalla o cargarlos como variables del worker.",
      requiredEnv: getCarrefourComercianteRequiredEnv(),
      userAgent,
    };
  }

  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    userAgent,
  });
  let lastValidation: CarrefourComercianteLoginSessionResponse | null = null;
  let lastError: unknown;

  try {
    for (const deliveryType of getCarrefourComercianteDeliveryTypes()) {
      const page = await context.newPage();

      try {
        await establishCarrefourComercianteSession(page, deliveryType, formValues);

        const url = buildCarrefourComercianteProductsUrlFromQuery(query);
        const html = await fetchCarrefourComercianteProductsHtml(page, url, query);
        const validation = buildCarrefourComercianteValidationFromHtml({
          html,
          query,
          startedAt,
          fallbackUserAgent: userAgent,
        });

        lastValidation = validation;

        if (!validation.ok) {
          continue;
        }

        const cookieHeader = cookiesToHeader(await context.cookies(BASE_URL));

        return {
          ...validation,
          cookie: cookieHeader,
          userAgent,
          nextAction:
            "Sesion creada desde el worker. Guardarla y ejecutar sincronizacion de catalogo.",
        };
      } catch (error) {
        lastError = error;
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    if (lastValidation) {
      return {
        ...lastValidation,
        nextAction:
          "Se probaron las modalidades configuradas, pero Carrefour siguio devolviendo precios privados. Revisar cookie manual, API/feed oficial o navegador remoto persistente.",
      };
    }

    throw lastError;
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo iniciar sesion en Carrefour Comerciante desde el worker.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      privateProductsCount: 0,
      visiblePriceProductsCount: 0,
      sampleProducts: [],
      nextAction:
        "Si aparece reCAPTCHA o precios privados, Carrefour esta rechazando login automatico desde backend y se necesita API/feed oficial o navegador remoto persistente.",
      requiredEnv: getCarrefourComercianteRequiredEnv(),
      userAgent,
    };
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
  const storedSession = request.cookie?.trim()
    ? null
    : await getStoredSourceSessionCredentials(CARREFOUR_COMERCIANTE_SOURCE_ID);
  const cookie =
    normalizeCookieHeader(request.cookie) ||
    storedSession?.cookie ||
    config.carrefourComerciante.cookie;
  const userAgent =
    normalizeHeaderValue(request.userAgent, "user-agent") ||
    storedSession?.userAgent ||
    config.carrefourComerciante.userAgent;
  const requiredEnv = getCarrefourComercianteRequiredEnv();

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
    const validation = buildCarrefourComercianteValidationFromHtml({
      html,
      query,
      startedAt,
      fallbackUserAgent: userAgent,
    });

    if (
      validation.status === "authorized" ||
      validation.status === "private_prices"
    ) {
      return validation;
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

export async function syncCarrefourComercianteCatalog(
  source: ScrapingSource,
  request: CarrefourComercianteCatalogSyncRequest = {},
): Promise<SourceCatalogSnapshot> {
  const startedAt = Date.now();
  const storedSession = request.cookie?.trim()
    ? null
    : await getStoredSourceSessionCredentials(source.id);
  const cookie =
    normalizeCookieHeader(request.cookie) ||
    storedSession?.cookie ||
    config.carrefourComerciante.cookie;
  const userAgent =
    normalizeHeaderValue(request.userAgent, "user-agent") ||
    storedSession?.userAgent ||
    config.carrefourComerciante.userAgent;
  const maxPagesPerQuery = clampPositiveInteger(
    request.maxPagesPerQuery,
    config.carrefourComerciante.syncMaxPagesPerQuery,
    20,
  );
  const itemsPerPage = clampPositiveInteger(
    request.itemsPerPage,
    config.carrefourComerciante.syncItemsPerPage,
    48,
  );
  const queries = normalizeSyncQueries(request.queries);
  const products: ProductSearchResult[] = [];
  const errors: string[] = [];
  let privateProductsCount = 0;
  let visiblePriceProductsCount = 0;

  if (!cookie) {
    throw new Error(
      "No hay sesion guardada para Carrefour Comerciante. Validar y guardar una cookie vigente antes de sincronizar catalogo.",
    );
  }

  for (const query of queries) {
    for (let page = 1; page <= maxPagesPerQuery; page += 1) {
      try {
        const url = buildCarrefourComercianteProductsUrlFromQuery(
          query,
          page,
          itemsPerPage,
        );
        const html = await fetchCarrefourComercianteProductsHtmlWithCookie(
          url,
          cookie,
          userAgent,
          query,
        );
        const cards = extractCarrefourComercianteCards(html);

        if (cards.length === 0) {
          break;
        }

        privateProductsCount += cards.filter(
          (card) => card.hasVisibleProduct && card.hasPrivatePrice,
        ).length;

        for (const card of cards) {
          if (card.price !== null) {
            visiblePriceProductsCount += 1;
          }

          const result = toCarrefourComercianteProductResult(
            card,
            source,
            query,
            url,
          );

          if (result) {
            products.push(result);
          }
        }

        if (cards.length < itemsPerPage) {
          break;
        }
      } catch (error) {
        errors.push(
          `${query} pagina ${page}: ${
            error instanceof Error ? error.message : "error desconocido"
          }`,
        );
        break;
      }
    }
  }

  const dedupedProducts = dedupeCarrefourComercianteProducts(products);

  return {
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: source.sourceUrl ?? null,
    dataOrigin: source.dataOrigin,
    sourceScope: source.sourceScope,
    status:
      dedupedProducts.length > 0
        ? "success"
        : errors.length > 0
        ? "failed"
        : "no_results",
    syncedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    queries,
    productsCount: dedupedProducts.length,
    privateProductsCount,
    visiblePriceProductsCount,
    errors,
    products: dedupedProducts,
  };
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
  formValues = buildCarrefourComercianteLoginFormValues(),
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
    async ({ deliveryType: selectedDeliveryType, formValues }) => {
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

      const setSelectValue = (
        selector: string,
        value: string,
        fallbackLabel = value,
      ) => {
        const select = document.querySelector<HTMLSelectElement>(selector);

        if (!select) {
          return;
        }

        if (!Array.from(select.options).some((option) => option.value === value)) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = fallbackLabel;
          select.appendChild(option);
        }

        select.value = value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const fetchHtml = async (path: string, body: string) => {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest",
          },
          body,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(
            `Carrefour respondio ${response.status} al preparar ${path}.`,
          );
        }

        return response.text();
      };

      document
        .querySelector<HTMLInputElement>('input[name="customerType"][value="business"]')
        ?.click();

      (
        window as unknown as {
          setCurrentReturnUrl?: () => void;
          setStoreChangeMode?: (enabled: boolean) => void;
          setStep?: (step: number) => void;
          applyCurrentDeliveryType?: (deliveryType: string) => void;
        }
      ).setCurrentReturnUrl?.();
      (
        window as unknown as {
          setStoreChangeMode?: (enabled: boolean) => void;
        }
      ).setStoreChangeMode?.(false);
      (
        window as unknown as {
          setStep?: (step: number) => void;
        }
      ).setStep?.(3);

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

      (
        window as unknown as {
          applyCurrentDeliveryType?: (deliveryType: string) => void;
        }
      ).applyCurrentDeliveryType?.(selectedDeliveryType);

      setInputValue("#url_c", window.location.href);

      const regionSelect = document.querySelector<HTMLSelectElement>("#region");
      const sellerSelect = document.querySelector<HTMLSelectElement>("#seller");
      const sellerDeliveryType = selectedDeliveryType === "envio" ? "1" : "0";

      if (regionSelect) {
        regionSelect.innerHTML = await fetchHtml("seller?method=zone", "");
      }

      setSelectValue("#region", formValues.region);

      if (sellerSelect) {
        sellerSelect.innerHTML = await fetchHtml(
          "seller?method=sellersLists",
          `zoneId=${encodeURIComponent(formValues.region)}&deliveryType=${sellerDeliveryType}`,
        );
      }

      setSelectValue(
        "#seller",
        formValues.seller,
        "CARREFOUR MAXI RESISTENCIA CHACO -  (Ruta 11 y alvear) Av.estado de Israel 4419",
      );
      setInputValue("#user-name", formValues.name);
      setInputValue("#user-cuit", formValues.numberId);
      setInputValue("#user-phone", formValues.phone);
      setInputValue("#user-email", formValues.email);

      const submitButton =
        document.querySelector<HTMLButtonElement>("#btn_step3") ?? undefined;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove("disabled", "btn-disabled-outlined");
        submitButton.classList.add("btn-blue-filled");
        submitButton.click();
        return;
      }

      form.requestSubmit();
    },
    {
      deliveryType,
      formValues,
    },
  );

  const navigation = await navigationPromise;

  if (!navigation && !page.url().startsWith(BASE_URL)) {
    throw new Error("Carrefour Comerciante no completo la navegacion de login.");
  }
}

async function seedCarrefourComercianteSessionCookies(
  context: BrowserContext,
  cookieHeader?: string,
) {
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
    signal: AbortSignal.timeout(config.carrefourComerciante.productTimeoutMs),
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
    signal: AbortSignal.timeout(config.carrefourComerciante.productTimeoutMs),
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

function buildCarrefourComercianteProductsUrlFromQuery(
  query: string,
  page = 1,
  itemsPerPage = 24,
) {
  return `${BASE_URL}products?currentUrl=search/${buildCarrefourComercianteSearchSlug(
    query,
  )}&filters=&orderBy=&currentPage=${page}&itemsPerPage=${itemsPerPage}&method=productsList`;
}

function buildCarrefourComercianteValidationFromHtml({
  html,
  query,
  startedAt,
  fallbackUserAgent,
}: {
  html: string;
  query: string;
  startedAt: number;
  fallbackUserAgent: string;
}): CarrefourComercianteLoginSessionResponse {
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
        "Guardar la sesion en el worker y sincronizar catalogo.",
      requiredEnv: getCarrefourComercianteRequiredEnv(),
      userAgent: fallbackUserAgent,
    };
  }

  if (privateCards.length > 0) {
    return {
      ok: false,
      status: "private_prices",
      message:
        "La sesion permite ver catalogo, pero Carrefour sigue devolviendo precios privados. No esta autorizada para precios en el worker.",
      checkedAt: new Date().toISOString(),
      query,
      durationMs: Date.now() - startedAt,
      productsCount: cards.length,
      privateProductsCount: privateCards.length,
      visiblePriceProductsCount: 0,
      sampleProducts,
      nextAction:
        "Usar conexion desde backend con datos del comercio. Si vuelve a quedar privado, Carrefour esta bloqueando automatizacion y hace falta API/feed oficial o navegador remoto persistente.",
      requiredEnv: getCarrefourComercianteRequiredEnv(),
      userAgent: fallbackUserAgent,
    };
  }

  return {
    ok: false,
    status: "logged_out",
    message:
      "Carrefour no devolvio productos autorizados con esta sesion.",
    checkedAt: new Date().toISOString(),
    query,
    durationMs: Date.now() - startedAt,
    productsCount: 0,
    privateProductsCount: 0,
    visiblePriceProductsCount: 0,
    sampleProducts,
    nextAction:
      "Revisar que la sesion pertenezca al mismo backend o intentar conexion desde backend.",
    requiredEnv: getCarrefourComercianteRequiredEnv(),
    userAgent: fallbackUserAgent,
  };
}

function buildCarrefourComercianteSearchSlug(query: string) {
  return encodeURIComponent(query.trim().replace(/\s+/g, "-"));
}

function looksLikeCarrefourComercianteLoggedOutHtml(html: string) {
  return /Por favor,\s*inicia sesi[oó]n|Te pedimos que completes los datos|id=["']userForm["']|name=["']token["']/i.test(
    html,
  );
}

function buildCarrefourComercianteLoginFormValues(
  overrides?: CarrefourComercianteLoginSessionRequest,
) {
  return {
    region: config.carrefourComerciante.region,
    seller: config.carrefourComerciante.sellerId,
    name: overrides?.name?.trim() || config.carrefourComerciante.name || "",
    numberId:
      overrides?.document?.trim() || config.carrefourComerciante.document || "",
    phone: overrides?.phone?.trim() || config.carrefourComerciante.phone || "",
    email: overrides?.email?.trim() || config.carrefourComerciante.email || "",
  };
}

function assertCarrefourComercianteLoginFields(
  formValues: ReturnType<typeof buildCarrefourComercianteLoginFormValues>,
) {
  const missingFields = [
    ["nombre y apellido", formValues.name],
    ["CUIT/DNI", formValues.numberId],
    ["telefono", formValues.phone],
    ["email", formValues.email],
  ].flatMap(([label, value]) => (value ? [] : [label]));

  if (missingFields.length > 0) {
    throw new Error(
      `Faltan datos del comercio para conectar Carrefour Comerciante desde backend: ${missingFields.join(", ")}.`,
    );
  }
}

function getCarrefourComercianteRequiredEnv() {
  return [
    "CARREFOUR_COMERCIANTE_ENABLED=true",
    "SOURCE_SESSION_SECRET",
    "CARREFOUR_COMERCIANTE_REGION=CHACO",
    "CARREFOUR_COMERCIANTE_SELLER_ID=506",
    "CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio",
  ];
}

function normalizeCookieHeader(value?: string) {
  if (!value) {
    return "";
  }

  const cookieLine = value
    .replace(/\r?\n/g, "; ")
    .split(/(?:^|\s)(?:cookie|Cookie):\s*/u)
    .pop()
    ?.replace(/^['"]|['"]$/g, "")
    .trim();

  if (!cookieLine) {
    return "";
  }

  const seen = new Set<string>();
  const parts = cookieLine
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex <= 0) {
        return [];
      }

      const name = part.slice(0, separatorIndex).trim();
      const cookieValue = part.slice(separatorIndex + 1).trim();

      if (!name || !cookieValue || seen.has(name)) {
        return [];
      }

      seen.add(name);
      return [`${name}=${cookieValue}`];
    });

  return parts.join("; ");
}

function normalizeHeaderValue(value: string | undefined, headerName: string) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\r?\n/g, " ")
    .replace(new RegExp(`^${headerName}\\s*:\\s*`, "i"), "")
    .trim();
}

function cookiesToHeader(
  cookies: Array<{
    name: string;
    value: string;
  }>,
) {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function assertCarrefourComercianteConfig(hasCookie = false) {
  if (!config.carrefourComerciante.enabled) {
    throw new Error(
      "Carrefour Comerciante esta deshabilitado. Activar CARREFOUR_COMERCIANTE_ENABLED=true y cargar una sesion manual vigente.",
    );
  }

  if (hasCookie || config.carrefourComerciante.cookie) {
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

function normalizeSyncQueries(queries?: string[]) {
  const normalizedQueries = new Set<string>();

  for (const query of [
    ...(queries ?? []),
    ...DEFAULT_SYNC_QUERIES,
    ...buildCatalogCategorySearchTerms(),
  ]) {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");

    if (normalizedQuery.length >= 2) {
      normalizedQueries.add(normalizedQuery);
    }
  }

  return Array.from(normalizedQueries).slice(
    0,
    config.carrefourComerciante.syncMaxQueries,
  );
}

function clampPositiveInteger(
  value: number | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function dedupeCarrefourComercianteProducts(products: ProductSearchResult[]) {
  const byKey = new Map<string, ProductSearchResult>();

  for (const product of products) {
    const key = [
      product.sourceId,
      product.sku ?? "",
      product.barcodes?.[0] ?? "",
      product.normalizedName,
      product.price,
    ].join("|");
    const current = byKey.get(key);

    if (!current || product.confidenceScore > current.confidenceScore) {
      byKey.set(key, product);
    }
  }

  return Array.from(byKey.values()).sort(
    (first, second) => first.price - second.price,
  );
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
