import { config } from "./config.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";
import { extractProductsFromAuthenticatedVtexApi } from "./vtex-auth.js";

export async function extractProductsFromVeaAuth(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const email = config.vea.email ?? config.tokin.email;
  const password = config.vea.password ?? config.tokin.password;

  return extractProductsFromAuthenticatedVtexApi(source, query, {
    enabled: config.vea.enabled,
    email,
    password,
    accountName: config.vea.accountName,
    scope: config.vea.scope,
    homeUrl: config.vea.homeUrl,
    authBaseUrl: config.vea.authBaseUrl,
    label: "Vea",
  });
}
