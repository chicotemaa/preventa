import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "@/app/api/cron/catalog-sync/route";

test("el cron dispara la sincronizacion completa en background", async () => {
  const originalFetch = globalThis.fetch;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalWorkerCronSecret = process.env.WORKER_CRON_SECRET;
  const originalWorkerUrl = process.env.WORKER_URL;
  let requestedUrl = "";

  process.env.CRON_SECRET = "cron-test-secret";
  process.env.WORKER_CRON_SECRET = "worker-test-secret";
  process.env.WORKER_URL = "https://worker.example.test";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer worker-test-secret",
    );

    return Response.json(
      {
        ok: true,
        started: true,
        alreadyRunning: false,
        catalog: { status: "syncing" },
      },
      { status: 202 },
    );
  };

  try {
    const response = await GET(
      new Request("https://web.example.test/api/cron/catalog-sync", {
        headers: { Authorization: "Bearer cron-test-secret" },
      }),
    );
    const body = (await response.json()) as {
      ok: boolean;
      started: boolean;
    };

    assert.equal(response.status, 202);
    assert.equal(body.ok, true);
    assert.equal(body.started, true);
    assert.equal(
      requestedUrl,
      "https://worker.example.test/catalog/sync/background",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("CRON_SECRET", originalCronSecret);
    restoreEnv("WORKER_CRON_SECRET", originalWorkerCronSecret);
    restoreEnv("WORKER_URL", originalWorkerUrl);
  }
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
