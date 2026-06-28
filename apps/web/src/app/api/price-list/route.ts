import { NextResponse } from "next/server";
import { savePriceListRun } from "@/lib/price-list-persistence";
import type {
  PriceListRequest,
  PriceListResponse,
} from "@/types/search";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";
const MAX_ITEMS = 1500;

export async function POST(request: Request) {
  let body: Partial<PriceListRequest>;

  try {
    body = (await request.json()) as Partial<PriceListRequest>;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) {
    return NextResponse.json(
      { error: "La lista debe incluir al menos un articulo." },
      { status: 400 },
    );
  }

  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `La lista no puede superar ${MAX_ITEMS} articulos.` },
      { status: 400 },
    );
  }

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/price-list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      return NextResponse.json(
        {
          error:
            errorPayload?.error ??
            `El worker respondio con estado ${response.status}.`,
        },
        { status: response.status },
      );
    }

    const data = (await response.json()) as PriceListResponse;
    const persistence =
      body.persist === true
        ? await savePriceListRun(data)
        : { enabled: false, requested: false, saved: false };
    return NextResponse.json({ ...data, persistence });
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker de busqueda." },
      { status: 502 },
    );
  }
}
