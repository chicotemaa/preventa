import assert from "node:assert/strict";
import test from "node:test";
import { persistPricingAlerts } from "./pricing-alert-store";
import { refreshPricingAlertsAfterCatalogSync } from "./pricing-alert-sync";

test("cron vencido no guarda ni resuelve alertas como si el analisis estuviera completo", async () => {
  const before = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://db.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  const signal = AbortSignal.abort(new Error("Tiempo agotado"));
  let writes = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/rest/v1/")) writes += 1;
    assert.equal(options?.signal?.aborted, true);
    options?.signal?.throwIfAborted();
    throw new Error("Unexpected request");
  };
  try {
    const stored = await persistPricingAlerts([], { signal, resolveMissing: true });
    assert.match(stored.errorMessage ?? "", /Tiempo agotado/);
    const refresh = await refreshPricingAlertsAfterCatalogSync({ workerUrl: "https://worker.example.test", catalog: null, signal });
    assert.equal(refresh.successfulCategories, 0);
    assert.equal(refresh.persistence.resolved, 0);
    assert.equal(refresh.email.sent, false);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (before.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = before.url;
    if (before.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = before.key;
  }
});
