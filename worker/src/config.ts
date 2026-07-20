import "dotenv/config";

function getNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOptionalStringEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export const config = {
  port: getNumberEnv("PORT", 4000),
  headless: process.env.HEADLESS !== "false",
  sourceTimeoutMs: getNumberEnv("SOURCE_TIMEOUT_MS", 20_000),
  minConfidenceScore: getNumberEnv("MIN_CONFIDENCE_SCORE", 60),
  maxResultsPerSource: 10,
  autoSyncOnStartup: process.env.AUTO_SYNC_ON_STARTUP === "true",
  liveSearchEnabled: process.env.ENABLE_LIVE_SEARCH === "true",
  aiMatching: {
    enabled: process.env.AI_MATCHING_ENABLED === "true",
    apiKey: getOptionalStringEnv("OPENAI_API_KEY"),
    model: getOptionalStringEnv("AI_MATCHING_MODEL") ?? "gpt-4.1-nano",
    minConfidence: getNumberEnv("AI_MATCHING_MIN_CONFIDENCE", 82),
    maxCandidates: getNumberEnv("AI_MATCHING_MAX_CANDIDATES", 5),
    timeoutMs: getNumberEnv("AI_MATCHING_TIMEOUT_MS", 6_000),
  },
  categorySearch: {
    mode:
      process.env.CATEGORY_SEARCH_MODE === "live" ? "live" : "catalog",
    maxQueries: getNumberEnv("CATEGORY_SEARCH_MAX_QUERIES", 8),
    maxQueriesMayorista: getNumberEnv("CATEGORY_SEARCH_MAX_QUERIES_MAYORISTA", 8),
    maxQueriesMinorista: getNumberEnv("CATEGORY_SEARCH_MAX_QUERIES_MINORISTA", 5),
    maxQueriesYaguar: getNumberEnv("CATEGORY_SEARCH_MAX_QUERIES_YAGUAR", 2),
    concurrency: getNumberEnv("CATEGORY_SEARCH_CONCURRENCY", 8),
  },
  priceList: {
    directAguiarLookupEnabled:
      process.env.PRICE_LIST_DIRECT_AGUIAR_LOOKUP === "true",
  },
  catalogSyncSecret:
    getOptionalStringEnv("CATALOG_SYNC_SECRET") ??
    getOptionalStringEnv("CRON_SECRET"),
  catalogSyncTimeoutMs: getNumberEnv("CATALOG_SYNC_TIMEOUT_MS", 20 * 60 * 1000),
  catalogSyncSeedMaxTerms: getNumberEnv("CATALOG_SYNC_SEED_MAX_TERMS", 160),
  maxiconsumo: {
    enabled: process.env.MAXICONSUMO_ENABLED !== "false",
    email: getOptionalStringEnv("MAXICONSUMO_EMAIL"),
    password: getOptionalStringEnv("MAXICONSUMO_PASSWORD"),
    loginUrl:
      getOptionalStringEnv("MAXICONSUMO_LOGIN_URL") ??
      "https://maxiconsumo.com/sucursal_chaco/customer/account/login/",
    homeUrl:
      getOptionalStringEnv("MAXICONSUMO_HOME_URL") ??
      "https://maxiconsumo.com/sucursal_chaco/",
  },
  yaguar: {
    enabled: process.env.YAGUAR_ENABLED !== "false",
    email: getOptionalStringEnv("YAGUAR_EMAIL"),
    password: getOptionalStringEnv("YAGUAR_PASSWORD"),
    browserFallback: process.env.YAGUAR_BROWSER_FALLBACK !== "false",
    sourceTimeoutMs: Math.max(
      getNumberEnv("YAGUAR_SOURCE_TIMEOUT_MS", 45_000),
      20_000,
    ),
    loginUrl:
      getOptionalStringEnv("YAGUAR_LOGIN_URL") ??
      "https://yaguar.com.ar/chaco/login/",
    homeUrl:
      getOptionalStringEnv("YAGUAR_HOME_URL") ??
      "https://yaguar.com.ar/chaco/tienda/",
    ajaxUrl:
      getOptionalStringEnv("YAGUAR_AJAX_URL") ??
      "https://yaguar.com.ar/chaco/wp-admin/admin-ajax.php",
  },
  vea: {
    enabled: process.env.VEA_ENABLED !== "false",
    email: getOptionalStringEnv("VEA_EMAIL"),
    password: getOptionalStringEnv("VEA_PASSWORD"),
    accountName: getOptionalStringEnv("VEA_ACCOUNT_NAME") ?? "veaargentina",
    scope: getOptionalStringEnv("VEA_SCOPE") ?? "veaargentina",
    homeUrl: getOptionalStringEnv("VEA_HOME_URL") ?? "https://www.vea.com.ar/",
    authBaseUrl:
      getOptionalStringEnv("VEA_AUTH_BASE_URL") ??
      "https://www.vea.com.ar/api/vtexid/pub/authentication",
  },
  carrefour: {
    enabled: process.env.CARREFOUR_ENABLED !== "false",
    email: getOptionalStringEnv("CARREFOUR_EMAIL"),
    password: getOptionalStringEnv("CARREFOUR_PASSWORD"),
    accountName:
      getOptionalStringEnv("CARREFOUR_ACCOUNT_NAME") ?? "carrefourar",
    scope: getOptionalStringEnv("CARREFOUR_SCOPE") ?? "carrefourar",
    homeUrl:
      getOptionalStringEnv("CARREFOUR_HOME_URL") ??
      "https://www.carrefour.com.ar/",
    authBaseUrl:
      getOptionalStringEnv("CARREFOUR_AUTH_BASE_URL") ??
      "https://www.carrefour.com.ar/api/vtexid/pub/authentication",
  },
  cucher: {
    enabled: process.env.CUCHER_ENABLED !== "false",
    supabaseAnonKey:
      getOptionalStringEnv("CUCHER_SUPABASE_ANON_KEY") ??
      "sb_publishable_oE88zB98aPc_-SKjOCJtQA_JNVn2lWT",
  },
  cheek: {
    enabled: process.env.CHEEK_ENABLED !== "false",
    homeUrl: getOptionalStringEnv("CHEEK_HOME_URL") ?? "https://cheeksa.com.ar/",
    ocrLanguage: getOptionalStringEnv("CHEEK_OCR_LANGUAGE") ?? "spa",
    timeoutMs: getNumberEnv("CHEEK_OCR_TIMEOUT_MS", 240_000),
  },
  carrefourComerciante: {
    enabled: process.env.CARREFOUR_COMERCIANTE_ENABLED === "true",
    name: getOptionalStringEnv("CARREFOUR_COMERCIANTE_NAME"),
    document: getOptionalStringEnv("CARREFOUR_COMERCIANTE_DOCUMENT"),
    phone: getOptionalStringEnv("CARREFOUR_COMERCIANTE_PHONE"),
    email: getOptionalStringEnv("CARREFOUR_COMERCIANTE_EMAIL"),
    cookie: getOptionalStringEnv("CARREFOUR_COMERCIANTE_COOKIE"),
    userAgent:
      getOptionalStringEnv("CARREFOUR_COMERCIANTE_USER_AGENT") ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    autoLoginEnabled:
      process.env.CARREFOUR_COMERCIANTE_AUTO_LOGIN === "true",
    region: getOptionalStringEnv("CARREFOUR_COMERCIANTE_REGION") ?? "CHACO",
    sellerId: getOptionalStringEnv("CARREFOUR_COMERCIANTE_SELLER_ID") ?? "506",
    deliveryType:
      getOptionalStringEnv("CARREFOUR_COMERCIANTE_DELIVERY_TYPE") ?? "envio",
    sourceTimeoutMs: Math.max(
      getNumberEnv("CARREFOUR_COMERCIANTE_SOURCE_TIMEOUT_MS", 20_000),
      20_000,
    ),
    recaptchaTimeoutMs: getNumberEnv(
      "CARREFOUR_COMERCIANTE_RECAPTCHA_TIMEOUT_MS",
      5_000,
    ),
    loginTimeoutMs: getNumberEnv("CARREFOUR_COMERCIANTE_LOGIN_TIMEOUT_MS", 10_000),
    productTimeoutMs: getNumberEnv(
      "CARREFOUR_COMERCIANTE_PRODUCT_TIMEOUT_MS",
      8_000,
    ),
    syncMaxQueries: getNumberEnv("CARREFOUR_COMERCIANTE_SYNC_MAX_QUERIES", 30),
    syncMaxPagesPerQuery: getNumberEnv(
      "CARREFOUR_COMERCIANTE_SYNC_MAX_PAGES_PER_QUERY",
      6,
    ),
    syncItemsPerPage: getNumberEnv(
      "CARREFOUR_COMERCIANTE_SYNC_ITEMS_PER_PAGE",
      24,
    ),
  },
  tokin: {
    enabled: process.env.TOKIN_ENABLED !== "false",
    email: getOptionalStringEnv("TOKIN_EMAIL"),
    password: getOptionalStringEnv("TOKIN_PASSWORD"),
    loginUrl:
      getOptionalStringEnv("TOKIN_LOGIN_URL") ??
      "https://tokintienda.com.ar/store/login",
    homeUrl:
      getOptionalStringEnv("TOKIN_HOME_URL") ??
      "https://tokintienda.com.ar/store/home",
    apiBaseUrl:
      getOptionalStringEnv("TOKIN_API_BASE_URL") ??
      "https://tokintienda.com.ar/store/tokin/",
    searchApiUrl:
      getOptionalStringEnv("TOKIN_SEARCH_API_URL") ??
      "https://tokintienda.com.ar/store/api/search",
  },
};
