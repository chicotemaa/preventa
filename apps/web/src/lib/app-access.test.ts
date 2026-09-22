import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { requireAppAccess } from "./app-access";
import { middleware } from "../middleware";
import { GET as history } from "../app/api/price-list/history/route";

const env = { NODE_ENV: "production", APP_ACCESS_USERNAME: "demo", APP_ACCESS_PASSWORD: "test-secret-".repeat(3) };
const authorization = `Basic ${Buffer.from(`${env.APP_ACCESS_USERNAME}:${env.APP_ACCESS_PASSWORD}`).toString("base64")}`;
const request = (headers: HeadersInit = {}, method = "GET") => new Request("https://app.example.test/api/price-list", { method, headers });

test("acceso privado: credenciales validas, ausentes, invalidas y configuracion incompleta", async () => {
  assert.equal(await requireAppAccess(request({ authorization }), env), null);
  for (const value of ["", "Basic !invalid", "Basic ZGVtbzpiYWQ=", "Bearer cron-secret"]) {
    const response = await requireAppAccess(request({ authorization: value }), env);
    assert.equal(response?.status, 401);
    assert.match(response?.headers.get("www-authenticate") ?? "", /Basic/);
    assert.equal(response?.headers.get("cache-control"), "private, no-store");
  }
  assert.equal((await requireAppAccess(request(), { NODE_ENV: "production" }))?.status, 503);
  assert.equal((await requireAppAccess(request(), { ...env, APP_ACCESS_PASSWORD: "short" }))?.status, 503);
  assert.equal(await requireAppAccess(request(), { NODE_ENV: "development" }), null);
});

test("autenticacion no permite escrituras desde otro origen", async () => {
  for (const headers of [{ origin: "https://evil.example.test" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) {
    assert.equal((await requireAppAccess(request({ authorization, ...headers }, "POST"), env))?.status, 403);
  }
  assert.equal(await requireAppAccess(request({ authorization, origin: "https://app.example.test" }, "POST"), env), null);
  assert.equal(await requireAppAccess(new Request("http://localhost:3010/api/price-list", {
    method: "POST", headers: { authorization, host: "127.0.0.1:3010", origin: "http://127.0.0.1:3010" },
  }), env), null);
});

test("middleware protege paginas y API; solo cron conocido queda a cargo de su propio Bearer", async () => {
  const before = { username: process.env.APP_ACCESS_USERNAME, password: process.env.APP_ACCESS_PASSWORD };
  process.env.APP_ACCESS_USERNAME = env.APP_ACCESS_USERNAME;
  process.env.APP_ACCESS_PASSWORD = env.APP_ACCESS_PASSWORD;
  try {
    for (const path of ["/", "/historial", "/api/price-list/history", "/api/cron/other"]) {
      assert.equal((await middleware(new NextRequest(`https://app.example.test${path}`))).status, 401);
    }
    for (const path of ["/api/cron/catalog-sync", "/api/cron/catalog-source/test"]) {
      assert.equal((await middleware(new NextRequest(`https://app.example.test${path}`))).status, 200);
    }
    assert.equal((await history(request())).status, 401, "handler protegido incluso sin middleware");
  } finally {
    if (before.username === undefined) delete process.env.APP_ACCESS_USERNAME; else process.env.APP_ACCESS_USERNAME = before.username;
    if (before.password === undefined) delete process.env.APP_ACCESS_PASSWORD; else process.env.APP_ACCESS_PASSWORD = before.password;
  }
});

test("todos los handlers privados mantienen guardia antes de consultar datos", () => {
  const root = join(process.cwd(), "src/app/api");
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (path !== join(root, "cron")) scan(path); continue; }
      if (entry.name !== "route.ts") continue;
      const code = readFileSync(path, "utf8");
      const handlers = [...code.matchAll(/export async function (?:GET|POST|PATCH)\([\s\S]*?\) \{\s*([^\n]+)/g)];
      assert.ok(handlers.length, path);
      for (const handler of handlers) assert.match(handler[1], /await requireAppAccess\(request\)/, path);
    }
  }
  scan(root);
});
