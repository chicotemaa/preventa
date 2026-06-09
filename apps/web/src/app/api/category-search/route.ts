import { NextResponse } from "next/server";
import type { CategorySearchResponse, SearchRequest } from "@/types/search";

const MAX_QUERY_LENGTH = 120;
const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

export async function POST(request: Request) {
  let body: Partial<SearchRequest>;

  try {
    body = (await request.json()) as Partial<SearchRequest>;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (query.length < 2) {
    return NextResponse.json(
      { error: "La busqueda debe tener al menos 2 caracteres." },
      { status: 400 },
    );
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `La busqueda no puede superar ${MAX_QUERY_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/category-search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
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

    const data = (await response.json()) as CategorySearchResponse;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker de rubros." },
      { status: 502 },
    );
  }
}
