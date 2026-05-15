import "dotenv/config";

function getNumberEnv(name: string, fallback: number) {
  const value = process.env[name];
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: getNumberEnv("PORT", 4000),
  headless: process.env.HEADLESS !== "false",
  sourceTimeoutMs: getNumberEnv("SOURCE_TIMEOUT_MS", 20_000),
  minConfidenceScore: getNumberEnv("MIN_CONFIDENCE_SCORE", 60),
  maxResultsPerSource: 10,
  autoSyncOnStartup: process.env.AUTO_SYNC_ON_STARTUP !== "false",
};
