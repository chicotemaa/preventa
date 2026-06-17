import { NextResponse } from "next/server";
import type {
  CarrefourComercianteSessionLoginRequest,
  CarrefourComercianteSessionSaveResponse,
} from "@/types/search";

const MAX_QUERY_LENGTH = 120;
const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

export async function POST(request: Request) {
  let body: Partial<CarrefourComercianteSessionLoginRequest>;

  try {
    body = (await request.json()) as Partial<CarrefourComercianteSessionLoginRequest>;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const query =
    typeof body.query === "string" && body.query.trim().length > 0
      ? body.query.trim()
      : "alfajor";

  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "La consulta de prueba debe tener entre 2 y 120 caracteres." },
      { status: 400 },
    );
  }

  const payload: CarrefourComercianteSessionLoginRequest = {
    name: normalizeOptionalText(body.name),
    document: normalizeOptionalText(body.document),
    phone: normalizeOptionalText(body.phone),
    email: normalizeOptionalText(body.email),
    query,
  };
  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/sources/carrefour-comerciante/session/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
    const responsePayload = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            responsePayload?.error ??
            `El worker respondio con estado ${response.status}.`,
          validation: responsePayload?.validation,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(
      responsePayload as CarrefourComercianteSessionSaveResponse,
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker para iniciar sesión." },
      { status: 502 },
    );
  }
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
