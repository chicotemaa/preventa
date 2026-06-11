import { extractProductsFromStaticHtmlText } from "./api-extractors.js";
import { config } from "./config.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

type CookieJar = Map<string, string>;

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function extractProductsFromMaxiconsumoAuth(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const email = config.maxiconsumo.email ?? config.tokin.email;
  const password = config.maxiconsumo.password;
  const searchUrl = buildSearchUrl(source.searchUrlTemplate, query);
  const publicResults = await fetchPublicSearchResults(searchUrl, source, query);

  if (publicResults.length > 0) {
    return publicResults;
  }

  if (email && password) {
    const authenticatedResults = await withLocalTimeout(
      fetchAuthenticatedSearchHtml(searchUrl, email, password)
        .then((html) =>
          extractProductsFromStaticHtmlText(html, searchUrl, source, query),
        )
        .then((results) => (results.length > 0 ? results : null)),
      10_000,
    )
      .catch(() => null);

    if (authenticatedResults) {
      return authenticatedResults;
    }
  }

  return [];
}

async function fetchPublicSearchResults(
  searchUrl: string,
  source: ScrapingSource,
  query: string,
) {
  const cookies: CookieJar = new Map();
  await fetchHtml(config.maxiconsumo.homeUrl, cookies).catch(() => undefined);
  const publicHtml = await fetchHtml(searchUrl, cookies);
  return extractProductsFromStaticHtmlText(publicHtml, searchUrl, source, query);
}

async function fetchAuthenticatedSearchHtml(
  searchUrl: string,
  email: string,
  password: string,
) {
  const cookies: CookieJar = new Map();
  const loginHtml = await fetchHtml(config.maxiconsumo.loginUrl, cookies);
  const formKey = findFormKey(loginHtml);
  const actionUrl =
    findLoginActionUrl(loginHtml, config.maxiconsumo.loginUrl) ??
    new URL("customer/account/loginPost/", config.maxiconsumo.homeUrl).toString();

  if (!formKey) {
    throw new Error("Maxiconsumo no expuso form_key de login.");
  }

  await postLogin(actionUrl, cookies, formKey, email, password);
  const html = await fetchHtml(searchUrl, cookies);

  if (isLoginPage(html)) {
    throw new Error(
      "Maxiconsumo no acepto la sesion o requiere validacion adicional.",
    );
  }

  return html;
}

async function fetchHtml(url: string, cookies: CookieJar) {
  const response = await fetch(url, {
    headers: buildHeaders(cookies),
  });

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`Maxiconsumo respondio ${response.status} para ${url}`);
  }

  return response.text();
}

async function postLogin(
  url: string,
  cookies: CookieJar,
  formKey: string,
  email: string,
  password: string,
) {
  const body = new URLSearchParams({
    form_key: formKey,
    "login[username]": email,
    "login[password]": password,
    send: "",
  });

  let nextUrl: string | null = url;

  for (let redirectCount = 0; nextUrl && redirectCount < 4; redirectCount += 1) {
    const response = await fetch(nextUrl, {
      body,
      headers: {
        ...buildHeaders(cookies),
        "content-type": "application/x-www-form-urlencoded",
        referer: config.maxiconsumo.loginUrl,
      },
      method: "POST",
      redirect: "manual",
    });

    storeResponseCookies(cookies, response);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      nextUrl = location ? new URL(location, nextUrl).toString() : null;

      if (nextUrl) {
        await fetchHtml(nextUrl, cookies);
      }

      return;
    }

    if (!response.ok) {
      throw new Error(`Maxiconsumo login respondio ${response.status}.`);
    }

    await response.text();
    return;
  }
}

function buildHeaders(cookies: CookieJar) {
  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "es-AR,es;q=0.9,en;q=0.7",
    "cache-control": "max-age=0",
    referer: config.maxiconsumo.homeUrl,
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "upgrade-insecure-requests": "1",
    "user-agent": userAgent,
  };
  const cookieHeader = serializeCookies(cookies);

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
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
  const headersWithGetSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const directCookies = headersWithGetSetCookie.getSetCookie?.();

  if (directCookies?.length) {
    return directCookies;
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

function findFormKey(html: string) {
  return html.match(/name=["']form_key["'][^>]*value=["']([^"']+)["']/i)?.[1];
}

function findLoginActionUrl(html: string, baseUrl: string) {
  const action = html.match(
    /<form[^>]+action=["']([^"']*customer\/account\/loginPost\/?[^"']*)["']/i,
  )?.[1];

  return action ? new URL(action, baseUrl).toString() : null;
}

function isLoginPage(html: string) {
  return /name=["']login\[username\]["']/i.test(html);
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
