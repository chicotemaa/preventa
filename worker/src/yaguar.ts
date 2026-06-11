import { extractProductsFromStaticHtmlText } from "./api-extractors.js";
import { launchBrowser } from "./browser.js";
import { config } from "./config.js";
import type { Response as PlaywrightResponse } from "playwright";
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

const YAGUAR_AUTH_TIMEOUT_MS = Math.max(config.sourceTimeoutMs, 20_000);
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
    fetchAuthenticatedYaguarProducts(source, query, email, password).catch(
      (error) => {
        if (!config.yaguar.browserFallback) {
          throw error;
        }

        return fetchYaguarProductsWithBrowser(source, query, email, password);
      },
    ),
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

  page.setDefaultTimeout(config.sourceTimeoutMs);

  try {
    await page.goto(config.yaguar.loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.sourceTimeoutMs,
    });

    await page.fill('input[name="username"], #username', email);
    await page.fill('input[name="password"], #password', password);

    const loginResponse = page
      .waitForResponse(
        (response) =>
          response.url().includes("/wp-admin/admin-ajax.php") &&
          response.request().method() === "POST",
        { timeout: Math.min(config.sourceTimeoutMs, 12_000) },
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
      timeout: config.sourceTimeoutMs,
    });

    const homeHtml = await page.content();

    if (isYaguarLoginPage(homeHtml)) {
      throw new Error(
        "Yaguar no mantuvo la sesion con navegador; revisar si las credenciales estan aprobadas para la tienda Chaco.",
      );
    }

    const url = buildSearchUrl(source.searchUrlTemplate, query);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.sourceTimeoutMs,
    });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {
      return undefined;
    });

    const html = await page.content();

    if (isYaguarLoginPage(html)) {
      throw new Error("Yaguar redirigio a login al consultar productos.");
    }

    return extractProductsFromStaticHtmlText(html, url, source, query);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
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
