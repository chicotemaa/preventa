import { NextResponse } from "next/server";
import {
  CATALOG_REBUILD_TIMEOUT_MS,
  CATALOG_SOURCE_SYNC_TIMEOUT_MS,
  CATALOG_SYNC_MAX_TERMS,
  CATALOG_SYNC_SOURCE_IDS,
  getDailyCatalogSyncOffset,
} from "@/lib/catalog-sync-sources";

export const maxDuration = 300;

type SourceSyncSummary = {
  sourceId: string;
  ok: boolean;
  updated: boolean;
  httpStatus: number;
  productsCount: number | null;
  progress: unknown;
  error?: string;
};

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

  const workerUrl = process.env.WORKER_URL?.trim();

  if (!workerUrl) {
    return NextResponse.json(
      {
        error:
          "WORKER_URL no esta configurado. El cron necesita apuntar al worker persistente.",
      },
      { status: 500 },
    );
  }

  const startedAt = Date.now();
  const workerSecret = process.env.WORKER_CRON_SECRET ?? cronSecret;
  const baseWorkerUrl = workerUrl.replace(/\/$/, "");
  const offset = getDailyCatalogSyncOffset();
  console.info("[catalog-cron] started", {
    triggeredAt: new Date(startedAt).toISOString(),
    sourceCount: CATALOG_SYNC_SOURCE_IDS.length,
    maxTerms: CATALOG_SYNC_MAX_TERMS,
    offset,
  });
  const sources = await Promise.all(
    CATALOG_SYNC_SOURCE_IDS.map((sourceId) =>
      syncSource({
        baseWorkerUrl,
        workerSecret,
        sourceId,
        offset,
      }),
    ),
  );
  const successfulSources = sources.filter((source) => source.ok).length;
  const updatedSources = sources.filter((source) => source.updated).length;
  console.info("[catalog-cron] sources-complete", {
    durationMs: Date.now() - startedAt,
    successfulSources,
    updatedSources,
    failedSources: sources.length - successfulSources,
    sources: sources.map((source) => ({
      sourceId: source.sourceId,
      ok: source.ok,
      updated: source.updated,
      httpStatus: source.httpStatus,
      processedTerms: getProcessedTerms(source.progress),
      error: source.error,
    })),
  });

  if (updatedSources === 0) {
    console.error("[catalog-cron] no-valid-source-updates", {
      durationMs: Date.now() - startedAt,
      sources,
    });
    return NextResponse.json(
      {
        error:
          "Ninguna fuente entrego una actualizacion valida; se conserva el catalogo anterior.",
        triggeredAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        successfulSources,
        updatedSources,
        failedSources: sources.length - successfulSources,
        sources,
      },
      { status: 502 },
    );
  }

  const consolidation = await rebuildCatalog(baseWorkerUrl, workerSecret);

  if (!consolidation.ok) {
    console.error("[catalog-cron] rebuild-failed", {
      durationMs: Date.now() - startedAt,
      error: consolidation.error,
    });
    return NextResponse.json(
      {
        error:
          consolidation.error ??
          "Las fuentes guardaron avances, pero no se pudo consolidar el catalogo.",
        triggeredAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        successfulSources,
        updatedSources,
        failedSources: sources.length - successfulSources,
        sources,
      },
      { status: 502 },
    );
  }

  console.info("[catalog-cron] completed", {
    durationMs: Date.now() - startedAt,
    successfulSources,
    updatedSources,
    productsCount: consolidation.catalog?.productsCount ?? null,
    lastSyncedAt: consolidation.catalog?.lastSyncedAt ?? null,
  });

  return NextResponse.json({
    ok: true,
    triggeredAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    block: {
      offset,
      maxTerms: CATALOG_SYNC_MAX_TERMS,
    },
    successfulSources,
    updatedSources,
    failedSources: sources.length - successfulSources,
    sources,
    catalog: consolidation.catalog,
  });
}

async function syncSource({
  baseWorkerUrl,
  workerSecret,
  sourceId,
  offset,
}: {
  baseWorkerUrl: string;
  workerSecret: string;
  sourceId: string;
  offset: number;
}): Promise<SourceSyncSummary> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CATALOG_SOURCE_SYNC_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${baseWorkerUrl}/catalog/sync/source`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceId,
        maxTerms: CATALOG_SYNC_MAX_TERMS,
        offset,
        deferCatalogRebuild: true,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    const processedTerms =
      typeof payload?.progress?.processedTerms === "number"
        ? payload.progress.processedTerms
        : 0;
    const usingStoredSnapshot =
      payload?.status?.usingStoredSnapshot === true;

    return {
      sourceId,
      ok: response.ok,
      updated: response.ok && processedTerms > 0 && !usingStoredSnapshot,
      httpStatus: response.status,
      productsCount:
        typeof payload?.productsCount === "number"
          ? payload.productsCount
          : null,
      progress: payload?.progress ?? null,
      ...(response.ok
        ? {}
        : {
            error:
              payload?.error ??
              `El worker respondio con estado ${response.status}.`,
          }),
    };
  } catch (error) {
    return {
      sourceId,
      ok: false,
      updated: false,
      httpStatus: 0,
      productsCount: null,
      progress: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "La fuente excedio el tiempo maximo de sincronizacion."
          : "No se pudo conectar con el worker.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function rebuildCatalog(baseWorkerUrl: string, workerSecret: string) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CATALOG_REBUILD_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${baseWorkerUrl}/catalog/rebuild`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    return {
      ok: response.ok,
      catalog: payload?.catalog ?? null,
      error:
        response.ok
          ? undefined
          : payload?.error ??
            `El worker respondio con estado ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      catalog: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? `El worker no consolido el catalogo dentro de ${Math.round(
              CATALOG_REBUILD_TIMEOUT_MS / 1000,
            )} segundos.`
          : "No se pudo conectar con el worker para consolidar el catalogo.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getProcessedTerms(progress: unknown) {
  if (!progress || typeof progress !== "object") {
    return 0;
  }

  const processedTerms = (progress as { processedTerms?: unknown }).processedTerms;
  return typeof processedTerms === "number" ? processedTerms : 0;
}
