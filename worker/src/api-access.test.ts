import assert from "node:assert/strict";
import test from "node:test";
import { workerAccessStatus } from "./api-access.js";

const env = { NODE_ENV: "production", WORKER_API_SECRET: "a".repeat(32), CATALOG_SYNC_SECRET: "cron-secret" };
test("worker protege lecturas, sesiones y escrituras; salud publica no necesita secreto", () => {
  assert.equal(workerAccessStatus("GET", "/health", undefined, env), 200);
  for (const path of ["/", "/catalog", "/source-sessions", "/catalog/price-list", "/source-sessions/carrefour-comerciante/save"]) {
    for (const method of ["GET", "POST"]) {
      assert.equal(workerAccessStatus(method, path, undefined, env), 401);
      assert.equal(workerAccessStatus(method, path, "Bearer cron-secret", env), 401);
      assert.equal(workerAccessStatus(method, path, `Bearer ${env.WORKER_API_SECRET}`, env), 200);
    }
  }
});
test("cron independiente del usuario web y API; produccion falla cerrada", () => {
  for (const path of ["/catalog/sync", "/catalog/sync/background", "/catalog/sync/source", "/catalog/rebuild"]) {
    assert.equal(workerAccessStatus("POST", path, "Bearer cron-secret", env), 200);
    assert.equal(workerAccessStatus("POST", path, `Bearer ${env.WORKER_API_SECRET}`, env), 401);
    assert.equal(workerAccessStatus("POST", path, undefined, { NODE_ENV: "production" }), 503);
  }
  assert.equal(workerAccessStatus("GET", "/catalog", undefined, { NODE_ENV: "production" }), 503);
  assert.equal(workerAccessStatus("GET", "/catalog", undefined, {}), 503);
  assert.equal(workerAccessStatus("GET", "/catalog", undefined, { NODE_ENV: "development" }), 200);
  assert.equal(workerAccessStatus("GET", "/catalog", "Bearer short", { ...env, WORKER_API_SECRET: "short" }), 503);
});
