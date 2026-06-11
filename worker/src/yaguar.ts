import { extractProductsFromStaticHtmlText } from "./api-extractors.js";
import { launchBrowser } from "./browser.js";
import { config } from "./config.js";
import { createProductResult } from "./extractors.js";
import { normalizePrice } from "./normalizers.js";
import type { Page, Response as PlaywrightResponse } from "playwright";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

type CookieJar = Map<string, string>;

type YaguarLoginResponse = {
  success?: boolean;
  data?: {
    status?: boolean;
    redirect?: string;
    message?: string;
  };
};

type YaguarNonceResponse = {
  success?: boolean;
  data?: string;
};

type YaguarVisibleCandidate = {
  rawName: string;
  priceText: string;
  sku: string | null;
  imageUrl: string | null;
  productUrl: string | null;
};

const YAGUAR_AUTH_TIMEOUT_MS = config.yaguar.sourceTimeoutMs;
const YAGUAR_MAX_REDIRECTS = 5;
const YAGUAR_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function extractProductsFromYaguarAuth(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const email = config.yaguar.email ?? config.tokin.email;
  const password = config.yaguar.password ?? config.tokin.password;

  if (!config.yaguar.enabled || !email || !password) {
    throw new Error(
      "Faltan YAGUAR_EMAIL/YAGUAR_PASSWORD o TOKIN_EMAIL/TOKIN_PASSWORD para consultar Yaguar Chaco.",
    );
  }

  return withLocalTimeout(
    fetchAuthenticatedYaguarProducts(source, query, email, password)
      .then((results) => {
        if (results.length > 0 || !config.yaguar.browserFallback) {
          return results;
        }

        return fetchYaguarProductsWithBrowser(source, query, email, password);
      })
      .catch((error) => {
        if (!config.yaguar.browserFallback) {
          throw error;
        }

        return fetchYaguarProductsWithBrowser(source, query, email, password);
      }),
    YAGUAR_AUTH_TIMEOUT_MS,
  );
}

async function fetchAuthenticatedYaguarProducts(
  source: ScrapingSource,
  query: string,
  email: string,
  password: string,
) {
  const cookies: CookieJar = new Map();
  const loginHtml = await fetchYaguarHtml(config.yaguar.loginUrl, cookies);
  const pageNonce = findYaguarLoginNonce(loginHtml);

  if (!pageNonce) {
    throw new Error("Yaguar no expuso nonce de login.");
  }

  const nonce = await refreshYaguarLoginNonce(cookies, pageNonce);
  await loginYaguar(cookies, email, password, nonce);

  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const html = await fetchYaguarHtml(url, cookies);

  if (isYaguarLoginPage(html)) {
    throw new Error("Yaguar no mantuvo la sesion luego del login.");
  }

  return extractProductsFromStaticHtmlText(html, url, source, query);
}

async function fetchYaguarProductsWithBrowser(
  source: ScrapingSource,
  query: string,
  email: string,
  password: string,
) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    userAgent: YAGUAR_USER_AGENT,
  });
  const page = await context.newPage();

  page.setDefaultTimeout(config.yaguar.sourceTimeoutMs);

  try {
    await page.goto(config.yaguar.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.yaguar.sourceTimeoutMs,
    });

    await page.fill('input[name="username"], #username', email);
    await page.fill('input[name="password"], #password', password);

    const loginResponse = page
      .waitForResponse(
        (response) =>
          response.url().includes("/wp-admin/admin-ajax.php") &&
          response.request().method() === "POST",
        { timeout: Math.min(config.yaguar.sourceTimeoutMs, 12_000) },
      )
      .catch(() => null);

    await page.click("#user_registration_ajax_login_submit, button[name='login']");
    const response = await loginResponse;
    const loginError = await readYaguarBrowserLoginError(response);

    if (loginError) {
      throw new Error(loginError);
    }

    await page
      .waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 6_000,
      })
      .catch(() => undefined);

    await page.goto(config.yaguar.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.yaguar.sourceTimeoutMs,
    });

    const homeHtml = await page.content();

    if (isYaguarLoginPage(homeHtml)) {
      throw new Error(
        "Yaguar no mantuvo la sesion con navegador; revisar si las credenciales estan aprobadas para la tienda Chaco.",
      );
    }

    await page.goto(config.yaguar.homeUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.yaguar.sourceTimeoutMs,
    });

    await applyYaguarVisibleSearch(page, query);
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {
      return undefined;
    });
    await page.waitForTimeout(1_000);

    const html = await page.content();

    if (isYaguarLoginPage(html)) {
      throw new Error("Yaguar redirigio a login al consultar productos.");
    }

    const browserResults = await extractProductsFromYaguarVisibleGrid(
      page,
      source,
      query,
    );

    if (browserResults.length > 0) {
      return browserResults;
    }

    const url = buildSearchUrl(source.searchUrlTemplate, query);
    return extractProductsFromStaticHtmlText(html, url, source, query);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function applyYaguarVisibleSearch(page: Page, query: string) {
  const input = page
    .locator(
      [
        'input[type="search"]',
        'input[type="text"]',
        'input:not([type])',
      ].join(", "),
    )
    .filter({ visible: true })
    .first();

  try {
    await input.fill(query, { timeout: 5_000 });
    await input.press("Enter", { timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(1_500);
  } catch {
    return undefined;
  }
}

async function extractProductsFromYaguarVisibleGrid(
  page: Page,
  source: ScrapingSource,
  query: string,
) {
  const candidates = (await page.evaluate(() => {
    const addToCartPattern = /a(?:ñ|n)adir\s+al\s+carrito|agregar\s+al\s+carrito/i;
    const pricePattern = /\$\s*\d[\d.,]*(?:\s*final)?/i;
    const addToCartElements = "button, a, input[type='submit'], input[type='button']";
    const buttons = Array.from(document.querySelectorAll(addToCartElements)).filter(
      (element) => addToCartPattern.test(getElementText(element)),
    );
    const seen = new Set<Element>();

    return buttons
      .map((button) => {
        const card = findProductCard(button);

        if (!card || seen.has(card)) {
          return null;
        }

        seen.add(card);
        const text = (card as HTMLElement).innerText
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const joinedText = text.join(" ");
        const priceText = joinedText.match(pricePattern)?.[0] ?? "";
        const priceLineIndex = text.findIndex((line) => pricePattern.test(line));
        const nameLines = text
          .slice(0, priceLineIndex >= 0 ? priceLineIndex : text.length)
          .filter(isProductNameLine);
        const rawName = nameLines.join(" ").replace(/\s+/g, " ").trim();
        const code =
          joinedText.match(/\bCod\.?\s*([A-Z0-9-]+)/i)?.[1] ??
          joinedText.match(/\bSKU\s*([A-Z0-9-]+)/i)?.[1] ??
          null;
        const image = card.querySelector("img") as HTMLImageElement | null;
        const link = card.querySelector('a[href*="/producto"], a[href*="/tienda/"]');

        if (!rawName || !priceText) {
          return null;
        }

        return {
          rawName,
          priceText,
          sku: code,
          imageUrl:
            image?.currentSrc ||
            image?.getAttribute("data-src") ||
            image?.getAttribute("src") ||
            null,
          productUrl: link?.getAttribute("href") ?? null,
        };
      })
      .filter(Boolean)
      .slice(0, 80);

    function findProductCard(button: Element) {
      let current = button.parentElement;

      while (current && current !== document.body) {
        const text = (current as HTMLElement).innerText ?? "";
        const addButtonsCount = Array.from(
          current.querySelectorAll(addToCartElements),
        ).filter((element) => addToCartPattern.test(getElementText(element)))
          .length;

        if (
          addButtonsCount === 1 &&
          pricePattern.test(text) &&
          /\bCod\.?\s*[A-Z0-9-]+/i.test(text)
        ) {
          return current;
        }

        current = current.parentElement;
      }

      return null;
    }

    function isProductNameLine(line: string) {
      return (
        line.length >= 4 &&
        !pricePattern.test(line) &&
        !/^Cod\.?/i.test(line) &&
        !/^\d+$/.test(line) &&
        !addToCartPattern.test(line) &&
        !/^limpiar filtros$/i.test(line) &&
        !/^filtros$/i.test(line)
      );
    }

    function getElementText(element: Element) {
      const text = element.textContent?.trim();
      const value = (element as HTMLInputElement).value?.trim();
      const label = element.getAttribute("aria-label")?.trim();

      return text || value || label || "";
    }
  })) as YaguarVisibleCandidate[];

  const results: ProductSearchResult[] = [];

  for (const candidate of candidates) {
    const price = normalizePrice(candidate.priceText);

    if (price === null) {
      continue;
    }

    results.push({
      ...createProductResult(
        source,
        query,
        candidate.rawName,
        price,
        resolveYaguarUrl(candidate.productUrl),
        resolveYaguarUrl(candidate.imageUrl),
      ),
      sku: candidate.sku,
    });
  }

  return results;
}

async function readYaguarBrowserLoginError(
  response: PlaywrightResponse | null,
) {
  if (!response) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | YaguarLoginResponse
    | null;

  if (!payload || payload.success) {
    return null;
  }

  return stripHtml(payload.data?.message ?? "Yaguar no autorizo el login.");
}

async function refreshYaguarLoginNonce(cookies: CookieJar, fallbackNonce: string) {
  const response = await fetch(config.yaguar.ajaxUrl, {
    method: "POST",
    headers: buildYaguarHeaders(cookies, {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: config.yaguar.loginUrl,
      "x-requested-with": "XMLHttpRequest",
    }),
    body: new URLSearchParams({
      action: "user_registration_get_recent_nonce",
      nonce_for: "login",
    }),
    redirect: "manual",
  });

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    return fallbackNonce;
  }

  const payload = (await response.json().catch(() => ({}))) as YaguarNonceResponse;
  return payload.success && payload.data ? payload.data : fallbackNonce;
}

async function loginYaguar(
  cookies: CookieJar,
  email: string,
  password: string,
  nonce: string,
) {
  const url = new URL(config.yaguar.ajaxUrl);
  url.searchParams.set("action", "user_registration_ajax_login_submit");
  url.searchParams.set("security", nonce);

  const response = await fetch(url, {
    method: "POST",
    headers: buildYaguarHeaders(cookies, {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://yaguar.com.ar",
      referer: config.yaguar.loginUrl,
      "x-requested-with": "XMLHttpRequest",
    }),
    body: new URLSearchParams({
      username: email,
      password,
      CaptchaResponse: "",
      redirect: config.yaguar.homeUrl,
    }),
    redirect: "manual",
  });

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`Yaguar login respondio ${response.status}.`);
  }

  const payload = (await response.json().catch(() => ({}))) as YaguarLoginResponse;

  if (!payload.success) {
    throw new Error(
      stripHtml(payload.data?.message ?? "Yaguar no autorizo el login."),
    );
  }

  const redirectUrl = resolveYaguarPostLoginUrl(payload);
  await fetchYaguarHtml(redirectUrl, cookies, config.yaguar.loginUrl);
}

async function fetchYaguarHtml(
  url: string,
  cookies: CookieJar,
  referer = config.yaguar.homeUrl,
) {
  let currentUrl = url;
  let currentReferer = referer;

  for (let redirectCount = 0; redirectCount <= YAGUAR_MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      headers: buildYaguarHeaders(cookies, {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: currentReferer,
      }),
      redirect: "manual",
    });

    storeResponseCookies(cookies, response);

    if (isRedirectResponse(response)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error(`Yaguar redirigio sin location desde ${currentUrl}`);
      }

      currentReferer = currentUrl;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Yaguar respondio ${response.status} para ${currentUrl}`);
    }

    return response.text();
  }

  throw new Error(`Yaguar excedio ${YAGUAR_MAX_REDIRECTS} redirecciones para ${url}`);
}

function findYaguarLoginNonce(html: string) {
  return (
    html.match(/ur_login_form_save_nonce["']?\s*:\s*["']([^"']+)/)?.[1] ??
    html.match(/name=["']user-registration-login-nonce["'][^>]*value=["']([^"']+)/)
      ?.[1] ??
    ""
  );
}

function isYaguarLoginPage(html: string) {
  return (
    /user_registration_ajax_login_submit/i.test(html) ||
    /user-registration-login-nonce/i.test(html) ||
    /Ingres[aá] tu usuario o correo electr[oó]nico/i.test(html)
  );
}

function resolveYaguarPostLoginUrl(payload: YaguarLoginResponse) {
  const redirectCandidate =
    payload.data?.redirect ??
    (looksLikeUrl(payload.data?.message) ? payload.data?.message : undefined) ??
    config.yaguar.homeUrl;

  return new URL(redirectCandidate, config.yaguar.homeUrl).toString();
}

function resolveYaguarUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:image/")) {
    return null;
  }

  try {
    return new URL(value, config.yaguar.homeUrl).toString();
  } catch {
    return value;
  }
}

function looksLikeUrl(value: string | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function buildYaguarHeaders(
  cookies: CookieJar,
  headers: Record<string, string>,
) {
  const cookieHeader = serializeCookies(cookies);

  return {
    "accept-language": "es-AR,es;q=0.9,en;q=0.8",
    "user-agent": YAGUAR_USER_AGENT,
    ...headers,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function isRedirectResponse(response: Response) {
  return response.status >= 300 && response.status < 400;
}

function storeResponseCookies(cookies: CookieJar, response: Response) {
  for (const cookie of getSetCookieHeaders(response)) {
    const [nameValue] = cookie.split(";");
    const separatorIndex = nameValue.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    cookies.set(
      nameValue.slice(0, separatorIndex).trim(),
      nameValue.slice(separatorIndex + 1).trim(),
    );
  }
}

function getSetCookieHeaders(response: Response) {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookieHeaders = headersWithSetCookie.getSetCookie?.();

  if (cookieHeaders?.length) {
    return cookieHeaders;
  }

  const combinedCookie = response.headers.get("set-cookie");
  return combinedCookie ? splitCombinedSetCookie(combinedCookie) : [];
}

function splitCombinedSetCookie(value: string) {
  return value.split(/,\s*(?=[^=;,]+=)/);
}

function serializeCookies(cookies: CookieJar) {
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function withLocalTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeout),
  );
}
