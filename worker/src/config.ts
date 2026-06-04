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
  autoSyncOnStartup: process.env.AUTO_SYNC_ON_STARTUP !== "false",
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
