import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let access;
try { access = JSON.parse(await readFile(new URL("../.demo/access.json", import.meta.url), "utf8")); }
catch { console.error("Ejecutar npm run demo:access primero."); process.exit(1); }
const { APP_ACCESS_USERNAME, APP_ACCESS_PASSWORD, WORKER_API_SECRET } = access;
if (typeof APP_ACCESS_USERNAME !== "string" || !APP_ACCESS_USERNAME ||
    typeof APP_ACCESS_PASSWORD !== "string" || APP_ACCESS_PASSWORD.length < 24 ||
    typeof WORKER_API_SECRET !== "string" || WORKER_API_SECRET.length < 32) {
  console.error("El archivo de acceso no contiene credenciales completas."); process.exit(1);
}
const localWorker = process.argv.includes("--local-worker");
const webPort = process.env.DEMO_PORT || "3010";
const workerPort = process.env.DEMO_WORKER_PORT || "4041";
const env = { ...process.env, NODE_ENV: "production", APP_ACCESS_USERNAME, APP_ACCESS_PASSWORD, WORKER_API_SECRET };
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
function start(args, cwd, overrides = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...env, ...overrides }, stdio: "inherit" });
  children.push(child);
  child.on("error", () => { console.error("No se pudo iniciar un proceso de demo."); stop(1); });
  child.on("exit", code => { if (!stopping) stop(code || 1); });
}
if (localWorker) {
  // Local snapshot only: never start supplier searches or configure production secrets here.
  const blocked = Object.fromEntries(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY",
    "CRON_SECRET", "CATALOG_SYNC_SECRET"].map(key => [key, ""]));
  start(["dist/server.js"], `${root}worker`, { ...blocked, PORT: workerPort, AUTO_SYNC_ON_STARTUP: "false",
    ENABLE_LIVE_SEARCH: "false", CATEGORY_SEARCH_MODE: "catalog", PRICE_LIST_DIRECT_AGUIAR_LOOKUP: "false" });
  env.WORKER_URL = `http://127.0.0.1:${workerPort}`;
  Object.assign(env, blocked);
  console.log("Worker local: datos historicos del disco; sin sincronizacion automatica.");
}
start([`${root}node_modules/next/dist/bin/next`, "start", "-H", "127.0.0.1", "-p", webPort], `${root}apps/web`);
console.log(`Vista privada: http://127.0.0.1:${webPort}. Credenciales en .demo/access.json`);
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => stop());
