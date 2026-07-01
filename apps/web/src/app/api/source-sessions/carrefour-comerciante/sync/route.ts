import { NextResponse } from "next/server";
import type {
  CarrefourComercianteCatalogSyncRequest,
  CarrefourComercianteCatalogSyncResponse,
} from "@/types/search";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

export async function POST(request: Request) {
  let body: Partial<CarrefourComercianteCatalogSyncRequest> = {};

  try {
    body = (await request.json()) as Partial<CarrefourComercianteCatalogSyncRequest>;
  } catch {
    body = {};
  }

  const queries = Array.isArray(body.queries)
    ? body.queries
        .filter((query): query is string => typeof query === "string")
        .map((query) => query.trim())
        .filter((query) => query.length >= 2)
        .slice(0, 60)
    : undefined;
  const maxPagesPerQuery =
    typeof body.maxPagesPerQuery === "number"
      ? Math.min(Math.max(Math.floor(body.maxPagesPerQuery), 1), 20)
      : undefined;
  const itemsPerPage =
    typeof body.itemsPerPage === "number"
      ? Math.min(Math.max(Math.floor(body.itemsPerPage), 1), 48)
      : undefined;
  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;
  const workerSecret = process.env.WORKER_CRON_SECRET ?? process.env.CRON_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (workerSecret) {
    headers.Authorization = `Bearer ${workerSecret}`;
  }

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/sources/carrefour-comerciante/catalog/sync`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ queries, maxPagesPerQuery, itemsPerPage }),
        cache: "no-store",
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

    return NextResponse.json(payload as CarrefourComercianteCatalogSyncResponse);
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker para sincronizar catálogo." },
      { status: 502 },
    );
  }
}
