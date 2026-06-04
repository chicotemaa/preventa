import { extractProductsFromVtexApi } from "./api-extractors.js";
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

export type VtexAuthConfig = {
  enabled: boolean;
  email?: string;
  password?: string;
  accountName: string;
  scope: string;
  homeUrl: string;
  authBaseUrl: string;
  label: string;
};

const VTEX_AUTH_TIMEOUT_MS = 7_000;

export async function extractProductsFromAuthenticatedVtexApi(
  source: ScrapingSource,
  query: string,
  authConfig: VtexAuthConfig,
): Promise<ProductSearchResult[]> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);

  if (authConfig.enabled && authConfig.email && authConfig.password) {
    const authenticatedResults = await withLocalTimeout(
      fetchAuthenticatedVtexProducts(url, source, query, authConfig),
      VTEX_AUTH_TIMEOUT_MS,
    ).catch(() => null);

    if (authenticatedResults && authenticatedResults.length > 0) {
      return authenticatedResults;
    }
  }

  return extractProductsFromVtexApi(url, source, query);
}

async function fetchAuthenticatedVtexProducts(
  url: string,
  source: ScrapingSource,
  query: string,
  authConfig: VtexAuthConfig,
) {
  const cookies: CookieJar = new Map();

  await startVtexLogin(cookies, authConfig);
  await validateVtexPassword(cookies, authConfig);

  return extractProductsFromVtexApi(url, source, query, {
    cookie: serializeCookies(cookies),
  });
}

async function startVtexLogin(cookies: CookieJar, authConfig: VtexAuthConfig) {
  const params = new URLSearchParams({
    accountName: authConfig.accountName,
    scope: authConfig.scope,
    returnUrl: authConfig.homeUrl,
  });
  const response = await fetch(
    `${authConfig.authBaseUrl}/startlogin?scope=${encodeURIComponent(
      authConfig.scope,
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
    throw new Error(`${authConfig.label} startlogin respondio ${response.status}.`);
  }
}

async function validateVtexPassword(
  cookies: CookieJar,
  authConfig: VtexAuthConfig,
) {
  const params = new URLSearchParams({
    login: authConfig.email ?? "",
    password: authConfig.password ?? "",
    recaptcha: "",
    fingerprint: "",
  });
  const response = await fetch(
    `${authConfig.authBaseUrl}/classic/validate?scope=${encodeURIComponent(
      authConfig.scope,
    )}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        cookie: serializeCookies(cookies),
        referer: authConfig.homeUrl,
        "user-agent":
          "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)",
      },
      body: params,
    },
  );

  storeResponseCookies(cookies, response);

  if (!response.ok) {
    throw new Error(`${authConfig.label} validate respondio ${response.status}.`);
  }

  const payload = (await response.json().catch(() => ({}))) as VtexValidateResponse;

  if (payload.authStatus !== "Success") {
    throw new Error(
      `${authConfig.label} login no autorizado: ${
        payload.authStatus ?? "unknown"
      }.`,
    );
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
