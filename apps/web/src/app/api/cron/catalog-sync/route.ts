import { NextResponse } from "next/server";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

const DEFAULT_SYNC_SOURCE_IDS = [
  "aguiar-arcor-resistencia",
  "maxiconsumo-chaco-auth",
  "maxiconsumo-web-moreno",
  "yaguar-chaco-tienda-auth",
  "carrefour-comerciante-maxi",
  "cucher-mercados-ofertas",
  "carrefour-argentina-vtex",
  "vea-argentina-vtex",
  "masonline-changomas-vtex",
  "jumbo-argentina-vtex",
  "disco-argentina-vtex",
  "dia-argentina-vtex",
  "cordiez-argentina-vtex",
  "laanonima-argentina-html",
  "depot-express-argentina",
];
const DEFAULT_SOURCE_SYNC_TIMEOUT_MS = 240_000;
const DEFAULT_SOURCE_MAX_TERMS = 3;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET no esta configurado." },
      { status: 500 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;
  const workerSecret = process.env.WORKER_CRON_SECRET ?? cronSecret;
  const sourceIds = getCatalogSyncSourceIds();

  try {
    const startedAt = Date.now();
    const sourceResults = await Promise.all(
      sourceIds.map((sourceId) =>
        syncSource(workerUrl, workerSecret, sourceId),
      ),
    );
    const failedSources = sourceResults.filter((result) => !result.ok);

    if (sourceResults.every((result) => !result.ok)) {
      return NextResponse.json(
        {
          error: "No se pudo sincronizar ninguna fuente.",
          sources: sourceResults,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      triggeredAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      sourcesRequested: sourceIds.length,
      sourcesSynced: sourceResults.length - failedSources.length,
      sourcesFailed: failedSources.length,
      sources: sourceResults,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker para sincronizar catalogo." },
      { status: 502 },
    );
  }
}

function getCatalogSyncSourceIds() {
  const configured = process.env.CATALOG_SYNC_SOURCE_IDS?.trim();

  if (!configured) {
    return DEFAULT_SYNC_SOURCE_IDS;
  }

  return configured
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

async function syncSource(
  workerUrl: string,
  workerSecret: string,
  sourceId: string,
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getSourceSyncTimeoutMs(),
  );

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/sync/source`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sourceId, maxTerms: getSourceMaxTerms() }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => null);

    return {
      ok: response.ok,
      sourceId,
      status: response.status,
      durationMs: Date.now() - startedAt,
      productsCount: payload?.productsCount ?? payload?.status?.resultsCount ?? 0,
      sourceStatus: payload?.status?.status ?? null,
      error: response.ok
        ? payload?.status?.errorMessage ?? null
        : payload?.error ?? `El worker respondio con estado ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      sourceId,
      status: 0,
      durationMs: Date.now() - startedAt,
      productsCount: 0,
      sourceStatus: "failed",
      error:
        error instanceof Error && error.name === "AbortError"
          ? `Timeout sincronizando fuente despues de ${Math.round(
              getSourceSyncTimeoutMs() / 1000,
            )} segundos.`
          : error instanceof Error
            ? error.message
            : "No se pudo conectar con el worker.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getSourceSyncTimeoutMs() {
  const configured = Number(process.env.CATALOG_SYNC_SOURCE_TIMEOUT_MS);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SOURCE_SYNC_TIMEOUT_MS;
}

function getSourceMaxTerms() {
  const configured = Number(process.env.CATALOG_SYNC_SOURCE_MAX_TERMS);

  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_SOURCE_MAX_TERMS;
}
