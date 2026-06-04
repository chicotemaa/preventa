import { extractProductsFromStaticHtmlText } from "./api-extractors.js";
import { config } from "./config.js";
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

const YAGUAR_AUTH_TIMEOUT_MS = 10_000;

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
    fetchAuthenticatedYaguarProducts(source, query, email, password),
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
  const nonce = findYaguarLoginNonce(loginHtml);

  if (!nonce) {
    throw new Error("Yaguar no expuso nonce de login.");
  }

  await loginYaguar(cookies, email, password, nonce);

  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const html = await fetchYaguarHtml(url, cookies);

  if (isYaguarLoginPage(html)) {
    throw new Error("Yaguar no mantuvo la sesion luego del login.");
  }

  return extractProductsFromStaticHtmlText(html, url, source, query);
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
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      cookie: serializeCookies(cookies),
      origin: "https://yaguar.com.ar",
      referer: config.yaguar.loginUrl,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
    },
    body: new URLSearchParams({
      username: email,
      password,
      CaptchaResponse: "",
      redirect: config.yaguar.homeUrl,
    }),
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
}

async function fetchYaguarHtml(url: string, cookies: CookieJar) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      cookie: serializeCookies(cookies),
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`Yaguar respondio ${response.status} para ${url}`);
  }

  return response.text();
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
    /Ingres[aá] tu usuario o correo electr[oó]nico/i.test(html)
  );
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

  if (cookieHeaders) {
    return cookieHeaders;
  }

  const combinedCookie = response.headers.get("set-cookie");
  return combinedCookie ? [combinedCookie] : [];
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
