import { createHash, timingSafeEqual } from "node:crypto";

const cronPaths = new Set(["/catalog/sync", "/catalog/sync/background", "/catalog/sync/source", "/catalog/rebuild"]);

export function workerAccessStatus(method: string, pathname: string, authorization: string | undefined,
  env: { NODE_ENV?: string; WORKER_API_SECRET?: string; CATALOG_SYNC_SECRET?: string; CRON_SECRET?: string } = process.env) {
  if (method === "GET" && pathname === "/health") return 200;
  const cron = method === "POST" && cronPaths.has(pathname);
  const secret = cron ? (env.CATALOG_SYNC_SECRET || env.CRON_SECRET) : env.WORKER_API_SECRET;
  if (!secret) return ["development", "test"].includes(env.NODE_ENV ?? "") ? 200 : 503;
  if (!cron && secret.length < 32) return 503;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`)) ? 200 : 401;
}
