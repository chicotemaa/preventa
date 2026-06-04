import { extractProductsFromVtexApi } from "./api-extractors.js";
import { config } from "./config.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { buildSearchUrl } from "./url.js";

type CookieJar = Map<string, string>;

type VtexAuthCookie = {
  Name?: string;
  Value?: string;
};

type VtexValidateResponse = {
  authStatus?: string;
  authCookie?: VtexAuthCookie | null;
  accountAuthCookie?: VtexAuthCookie | null;
};

const VEA_AUTH_TIMEOUT_MS = 7_000;

export async function extractProductsFromVeaAuth(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const email = config.vea.email ?? config.tokin.email;
  const password = config.vea.password ?? config.tokin.password;

  if (config.vea.enabled && email && password) {
    const authenticatedResults = await withLocalTimeout(
      fetchAuthenticatedVeaProducts(url, source, query, email, password),
      VEA_AUTH_TIMEOUT_MS,
    ).catch(() => null);

    if (authenticatedResults && authenticatedResults.length > 0) {
      return authenticatedResults;
    }
  }

  return extractProductsFromVtexApi(url, source, query);
}

async function fetchAuthenticatedVeaProducts(
  url: string,
  source: ScrapingSource,
  query: string,
  email: string,
  password: string,
) {
  const cookies: CookieJar = new Map();

  await startVeaLogin(cookies);
  await validateVeaPassword(cookies, email, password);

  return extractProductsFromVtexApi(url, source, query, {
    cookie: serializeCookies(cookies),
  });
}

async function startVeaLogin(cookies: CookieJar) {
  const params = new URLSearchParams({
    accountName: config.vea.accountName,
    scope: config.vea.scope,
    returnUrl: config.vea.homeUrl,
  });
  const response = await fetch(
    `${config.vea.authBaseUrl}/startlogin?scope=${encodeURIComponent(
      config.vea.scope,
    )}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent":
          "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
      },
      body: params,
    },
  );

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`Vea startlogin respondio ${response.status}.`);
  }
}

async function validateVeaPassword(
  cookies: CookieJar,
  email: string,
  password: string,
) {
  const params = new URLSearchParams({
    login: email,
    password,
    recaptcha: "",
    fingerprint: "",
  });
  const response = await fetch(
    `${config.vea.authBaseUrl}/classic/validate?scope=${encodeURIComponent(
      config.vea.scope,
    )}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        cookie: serializeCookies(cookies),
        referer: config.vea.homeUrl,
        "user-agent":
          "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
      },
      body: params,
    },
  );

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`Vea validate respondio ${response.status}.`);
  }

  const payload = (await response.json().catch(() => ({}))) as VtexValidateResponse;

  if (payload.authStatus !== "Success") {
    throw new Error(`Vea login no autorizado: ${payload.authStatus ?? "unknown"}.`);
  }

  storeAuthCookie(cookies, payload.authCookie);
  storeAuthCookie(cookies, payload.accountAuthCookie);
}

function storeAuthCookie(cookies: CookieJar, cookie?: VtexAuthCookie | null) {
  if (!cookie?.Name || !cookie.Value) {
    return;
  }

  cookies.set(cookie.Name, cookie.Value);
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
