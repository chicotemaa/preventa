import { NextResponse } from "next/server";
import type { SearchRequest, SearchResponse } from "@/types/search";

const MAX_QUERY_LENGTH = 120;

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

  const workerUrl = process.env.WORKER_URL ?? "http://localhost:4000";

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/catalog/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });

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

    const data = (await response.json()) as SearchResponse;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker de busqueda." },
      { status: 502 },
    );
  }
}
