import { NextResponse } from "next/server";
import type {
  CarrefourComercianteSessionSaveRequest,
  CarrefourComercianteSessionSaveResponse,
} from "@/types/search";

const MAX_COOKIE_LENGTH = 20_000;
const MAX_USER_AGENT_LENGTH = 800;
const MAX_QUERY_LENGTH = 120;
const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

export async function POST(request: Request) {
  let body: Partial<CarrefourComercianteSessionSaveRequest>;

  try {
    body = (await request.json()) as Partial<CarrefourComercianteSessionSaveRequest>;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const cookie = typeof body.cookie === "string" ? body.cookie.trim() : "";
  const userAgent =
    typeof body.userAgent === "string" ? body.userAgent.trim() : "";
  const query =
    typeof body.query === "string" && body.query.trim().length > 0
      ? body.query.trim()
      : "alfajor";

  if (cookie.length < 10 || cookie.length > MAX_COOKIE_LENGTH) {
    return NextResponse.json(
      { error: "La cookie no parece completa o es demasiado larga." },
      { status: 400 },
    );
  }

  if (userAgent.length < 20 || userAgent.length > MAX_USER_AGENT_LENGTH) {
    return NextResponse.json(
      { error: "El User-Agent no parece completo o es demasiado largo." },
      { status: 400 },
    );
  }

  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "La consulta de prueba debe tener entre 2 y 120 caracteres." },
      { status: 400 },
    );
  }

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/sources/carrefour-comerciante/session/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cookie, userAgent, query }),
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
          validation: payload?.validation,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(payload as CarrefourComercianteSessionSaveResponse);
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker para guardar la sesión." },
      { status: 502 },
    );
  }
}
