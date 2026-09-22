import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const access = JSON.parse(await readFile(new URL("../.demo/access.json", import.meta.url), "utf8"));
const base = `http://127.0.0.1:${process.env.DEMO_PORT || "3010"}`;
const worker = `http://127.0.0.1:${process.env.DEMO_WORKER_PORT || "4041"}`;
const authorization = `Basic ${Buffer.from(`${access.APP_ACCESS_USERNAME}:${access.APP_ACCESS_PASSWORD}`).toString("base64")}`;
const get = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
const paths = ["/", "/busqueda-general", "/importacion", "/historial", "/evolucion", "/revisiones", "/alertas", "/configuracion"];
for (const path of [...paths, "/api/price-list/history", "/api/source-sessions"]) {
  assert.equal((await get(base + path)).status, 401, `Privado: ${path}`);
}
assert.equal((await get(base + "/api/price-list", { method: "POST", headers: { authorization, origin: "https://other.example.test" }, body: "{}" })).status, 403);
assert.equal((await get(base + "/api/price-list", { method: "POST", headers: { authorization, origin: base }, body: "{}" })).status, 400);
assert.deepEqual(await (await get(worker + "/health")).json(), { ok: true });
assert.equal((await get(worker + "/catalog")).status, 401);
assert.equal((await get(worker + "/catalog", { headers: { authorization } })).status, 401);
assert.equal((await get(worker + "/catalog", { headers: { authorization: `Bearer ${access.WORKER_API_SECRET}` } })).status, 200);
const category = await get(base + "/api/category-search", { method: "POST", headers: { authorization, origin: base, "content-type": "application/json" }, body: JSON.stringify({ query: "alfajores" }) });
assert.equal(category.status, 200);
const categoryData = await category.json();
assert.ok(categoryData.catalog, "La busqueda debe pasar por el worker real y devolver metadata del catalogo");
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
  args: ["--disk-cache-size=1"] });
const errors = [];
try {
  const page = await browser.newPage({ httpCredentials: { username: access.APP_ACCESS_USERNAME, password: access.APP_ACCESS_PASSWORD } });
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      assert.equal((await page.goto(base + path)).status(), 200, path);
      await page.waitForLoadState("networkidle");
      assert.ok((await page.locator("body").innerText()).trim().length > 80, path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} width=${width}`);
      assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0);
    }
    await page.goto(base);
    await page.getByRole("button", { name: /^Alfajores/ }).click();
    await page.getByText("Vigencia de precios sin verificar", { exact: true }).first().waitFor();
    await page.screenshot({ path: new URL(`../.demo/browser-${width}.png`, import.meta.url).pathname, fullPage: false });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ["8 rutas desktop y mobile", "API privada sin credenciales", "origen de escrituras",
    "worker Bearer separado", "consulta real offline al worker", "catalogo historico no se muestra vigente", "sin errores JS ni overflow"],
    catalogProducts: categoryData.catalog.productsCount, localOnly: true }));
} finally { await browser.close(); }
