import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/cron/catalog-sync/route";
import {
  CATALOG_REBUILD_TIMEOUT_MS,
  CATALOG_SOURCE_SYNC_TIMEOUT_MS,
  CATALOG_SYNC_MAX_TERMS,
  CATALOG_SYNC_SOURCE_IDS,
} from "./catalog-sync-sources";

test("el cron sincroniza cada fuente y consolida el catalogo", async () => {
  const originalFetch = globalThis.fetch;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalWorkerCronSecret = process.env.WORKER_CRON_SECRET;
  const originalWorkerUrl = process.env.WORKER_URL;
  const requestedUrls: string[] = [];
  const sourceBodies: unknown[] = [];

  process.env.CRON_SECRET = "cron-test-secret";
  process.env.WORKER_CRON_SECRET = "worker-test-secret";
  process.env.WORKER_URL = "https://worker.example.test";
  globalThis.fetch = async (input, init) => {
    const requestedUrl = String(input);
    requestedUrls.push(requestedUrl);
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer worker-test-secret",
    );

    if (requestedUrl.endsWith("/catalog/rebuild")) {
      return Response.json({
        ok: true,
        catalog: { status: "ready", productsCount: 120 },
      });
    }

    sourceBodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      ok: true,
      productsCount: 10,
      progress: { processedTerms: CATALOG_SYNC_MAX_TERMS },
    });
  };

  try {
    const response = await GET(
      new Request("https://web.example.test/api/cron/catalog-sync", {
        headers: { Authorization: "Bearer cron-test-secret" },
      }),
    );
    const body = (await response.json()) as {
      ok: boolean;
      successfulSources: number;
      catalog: { status: string };
    };

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.successfulSources, CATALOG_SYNC_SOURCE_IDS.length);
    assert.equal(body.catalog.status, "ready");
    assert.equal(
      requestedUrls.filter((url) => url.endsWith("/catalog/sync/source"))
        .length,
      CATALOG_SYNC_SOURCE_IDS.length,
    );
    assert.equal(requestedUrls.at(-1), "https://worker.example.test/catalog/rebuild");
    assert.equal(
      (sourceBodies[0] as { sourceId: string }).sourceId,
      CATALOG_SYNC_SOURCE_IDS[0],
    );
    assert.equal(
      (sourceBodies[0] as { maxTerms: number }).maxTerms,
      CATALOG_SYNC_MAX_TERMS,
    );
    assert.equal(
      (sourceBodies[0] as { deferCatalogRebuild: boolean })
        .deferCatalogRebuild,
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("CRON_SECRET", originalCronSecret);
    restoreEnv("WORKER_CRON_SECRET", originalWorkerCronSecret);
    restoreEnv("WORKER_URL", originalWorkerUrl);
  }
});

test("reserva tiempo para consolidar antes del limite de Vercel", () => {
  assert.ok(
    CATALOG_SOURCE_SYNC_TIMEOUT_MS + CATALOG_REBUILD_TIMEOUT_MS <=
      260_000,
  );
});

test("el cron rechaza produccion sin WORKER_URL explicito", async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalWorkerUrl = process.env.WORKER_URL;

  process.env.CRON_SECRET = "cron-test-secret";
  delete process.env.WORKER_URL;

  try {
    const response = await GET(
      new Request("https://web.example.test/api/cron/catalog-sync", {
        headers: { Authorization: "Bearer cron-test-secret" },
      }),
    );
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 500);
    assert.match(body.error, /WORKER_URL/);
  } finally {
    restoreEnv("CRON_SECRET", originalCronSecret);
    restoreEnv("WORKER_URL", originalWorkerUrl);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
