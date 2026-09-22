import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parse } from "dotenv";
import * as freshness from "../apps/web/src/lib/price-freshness.ts";
const { getPriceFreshness } = freshness.default ?? freshness;

const { values } = parseArgs({ options: { remote: { type: "boolean", default: false } } });
const root = new URL("../", import.meta.url);
const checks = [];
const add = (name, status, detail) => checks.push({ name, status, detail });
function parseUrl(value) {
  try { const url = new URL(value); return url.username || url.password ? null : url; }
  catch { return null; }
}
async function environment(path) {
  try { return { ...parse(await readFile(new URL(path, root))), ...process.env }; }
  catch { return { ...process.env }; }
}
const web = await environment("apps/web/.env.local");
const worker = await environment("worker/.env");
for (const [name, env, keys] of [
  ["web", web, ["APP_ACCESS_USERNAME", "APP_ACCESS_PASSWORD", "WORKER_URL", "WORKER_API_SECRET", "SUPABASE_URL", "CRON_SECRET"]],
  ["worker", worker, ["WORKER_API_SECRET", "SUPABASE_URL", "SOURCE_SESSION_SECRET"]],
]) {
  for (const key of keys) add(`${name}.${key}`, env[key]?.trim() ? "configured" : "missing", "Presencia local; no acredita el entorno publicado.");
  add(`${name}.SUPABASE_KEY`, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY ? "configured" : "missing", "Se requiere clave privada del servidor; no se imprime su valor.");
}
add("WORKER_API_SECRET.coincidencia", web.WORKER_API_SECRET?.length >= 32 && web.WORKER_API_SECRET === worker.WORKER_API_SECRET ? "ok" : "missing", "Web y worker deben usar la misma clave de al menos 32 caracteres.");
const cronWorker = worker.CATALOG_SYNC_SECRET || worker.CRON_SECRET;
add("CRON_SECRET.coincidencia", cronWorker && cronWorker === (web.WORKER_CRON_SECRET || web.CRON_SECRET) ? "ok" : "missing", "Clave de sincronizacion separada de WORKER_API_SECRET.");
try {
  const config = JSON.parse(await readFile(new URL("apps/web/vercel.json", root), "utf8"));
  add("cron.configuracion", config.crons?.some(c => c.path === "/api/cron/catalog-sync" && c.schedule === "0 15 * * *") ? "ok" : "review", "Configuracion: todos los dias a las 12 de Argentina. No verifica ejecucion ni cobertura completa.");
} catch { add("cron.configuracion", "missing", "No se pudo leer vercel.json."); }
try {
  const catalog = JSON.parse(await readFile(new URL("worker/data/catalog.json", root), "utf8"));
  const products = catalog.products ?? [];
  const counts = { fresh: 0, aging: 0, stale: 0, unknown: 0 };
  for (const product of products) counts[getPriceFreshness(product.observedAt).status]++;
  add("catalogo.local", products.length && counts.fresh === products.length ? "ok" : "review",
    { products: products.length, consolidatedAt: catalog.lastSyncedAt, observations: counts });
} catch { add("catalogo.local", "missing", "No se pudo leer el catalogo local."); }

// Read-only probes. No supplier requests, cron triggers, imports or DB writes.
if (values.remote) {
  if (web.WORKER_URL && web.WORKER_API_SECRET) {
    const url = parseUrl(web.WORKER_URL);
    if (!url || url.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      add("worker.conexion", "error", "Se requiere HTTPS fuera de localhost.");
    } else {
      try {
        const response = await fetch(new URL("/catalog", url), { headers: { Authorization: `Bearer ${web.WORKER_API_SECRET}` }, signal: AbortSignal.timeout(15_000), redirect: "error" });
        const data = response.ok ? await response.json() : null;
        add("worker.conexion", response.ok ? "ok" : "error", { status: response.status, productsCount: data?.productsCount ?? data?.catalog?.productsCount ?? null });
      } catch { add("worker.conexion", "error", "No se pudo leer el catalogo; revisar conexion, URL y clave."); }
    }
  } else add("worker.conexion", "missing", "No hay URL y clave para validar el worker.");
  const key = web.SUPABASE_SERVICE_ROLE_KEY || web.SUPABASE_SECRET_KEY;
  if (web.SUPABASE_URL && key) {
    const url = parseUrl(web.SUPABASE_URL);
    if (!url || url.protocol !== "https:") add("supabase.lectura", "error", "SUPABASE_URL debe usar HTTPS.");
    else try {
      const response = await fetch(new URL("/rest/v1/price_list_runs?select=id&limit=1", url), { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), redirect: "error" });
      add("supabase.lectura", response.ok ? "ok" : "error", { status: response.status });
    } catch { add("supabase.lectura", "error", "No se pudo leer el historial; revisar conexion, URL y permisos."); }
  } else add("supabase.lectura", "missing", "No hay configuracion local para validar persistencia remota.");
} else add("conexion.remota", "not_checked", "Usar --remote con conexiones configuradas. Solo lecturas.");
const report = { checkedAt: new Date().toISOString(), ready: !checks.some(c => ["missing", "error", "review", "not_checked"].includes(c.status)), checks };
const directory = new URL(".demo/", root);
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(new URL("readiness.json", directory), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
for (const check of checks) console.log(`[${check.status}] ${check.name}: ${typeof check.detail === "string" ? check.detail : JSON.stringify(check.detail)}`);
console.log("Informe sin secretos: .demo/readiness.json");
process.exitCode = report.ready ? 0 : 1;
