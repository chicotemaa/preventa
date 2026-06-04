import { config } from "./config.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { extractProductsFromAuthenticatedVtexApi } from "./vtex-auth.js";

export async function extractProductsFromCarrefourAuth(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const email = config.carrefour.email ?? config.tokin.email;
  const password = config.carrefour.password ?? config.tokin.password;

  return extractProductsFromAuthenticatedVtexApi(source, query, {
    enabled: config.carrefour.enabled,
    email,
    password,
    accountName: config.carrefour.accountName,
    scope: config.carrefour.scope,
    homeUrl: config.carrefour.homeUrl,
    authBaseUrl: config.carrefour.authBaseUrl,
    label: "Carrefour",
  });
}
