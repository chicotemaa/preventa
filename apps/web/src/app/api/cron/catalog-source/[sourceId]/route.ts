import { NextResponse } from "next/server";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";
const WORKER_TIMEOUT_MS = 280_000;

export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    sourceId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const { sourceId } = await context.params;
  const requestUrl = new URL(request.url);
  const maxTerms = parseOptionalInteger(requestUrl.searchParams.get("maxTerms"));
  const offset = parseOptionalInteger(requestUrl.searchParams.get("offset"));
  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;
  const workerSecret = process.env.WORKER_CRON_SECRET ?? cronSecret;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/sync/source`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId,
          ...(maxTerms ? { maxTerms } : {}),
          ...(offset !== undefined ? { offset } : {}),
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error ??
            `El worker respondio con estado ${response.status}.`,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      ok: true,
      sourceId,
      triggeredAt: new Date().toISOString(),
      worker: payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "La fuente excedio el tiempo maximo de sincronizacion."
            : "No se pudo conectar con el worker para sincronizar la fuente.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseOptionalInteger(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }

  return Number.parseInt(value, 10);
}
