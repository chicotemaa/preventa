import assert from "node:assert/strict";
import test from "node:test";
import { workerFetch } from "./worker-request";

test("proxy usa clave propia, conserva opciones y no sigue redirecciones con secretos", async () => {
  const before = { ...process.env };
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { NODE_ENV: "production", WORKER_API_SECRET: "s".repeat(32), WORKER_URL: "https://worker.example.test" });
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${"s".repeat(32)}`);
    assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.body, "{}");
    return Response.json({ ok: true });
  };
  try {
    await workerFetch("https://worker.example.test/catalog/search", { method: "POST", headers: { Authorization: "Basic private", "Content-Type": "application/json" }, body: "{}" });
    assert.throws(() => workerFetch("https://different.example.test"), /WORKER_URL/);
    delete process.env.WORKER_API_SECRET;
    assert.throws(() => workerFetch("https://worker.example.test"), /WORKER_API_SECRET/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of ["NODE_ENV", "WORKER_API_SECRET", "WORKER_URL"]) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
});
