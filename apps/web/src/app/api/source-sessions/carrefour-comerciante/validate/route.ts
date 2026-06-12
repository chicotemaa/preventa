import { NextResponse } from "next/server";
import type {
  CarrefourComercianteSessionValidationRequest,
  CarrefourComercianteSessionValidationResponse,
} from "@/types/search";

const MAX_COOKIE_LENGTH = 12_000;
const MAX_USER_AGENT_LENGTH = 600;
const MAX_QUERY_LENGTH = 120;
const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

export async function POST(request: Request) {
  let body: Partial<CarrefourComercianteSessionValidationRequest>;

  try {
    body = (await request.json()) as Partial<CarrefourComercianteSessionValidationRequest>;
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

  if (cookie.length > MAX_COOKIE_LENGTH) {
    return NextResponse.json(
      { error: "La cookie es demasiado larga para validar." },
      { status: 400 },
    );
  }

  if (userAgent.length > MAX_USER_AGENT_LENGTH) {
    return NextResponse.json(
      { error: "El User-Agent es demasiado largo para validar." },
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
      `${workerUrl.replace(/\/$/, "")}/sources/carrefour-comerciante/session/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cookie: cookie || undefined,
          userAgent: userAgent || undefined,
          query,
        }),
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

    const data =
      (await response.json()) as CarrefourComercianteSessionValidationResponse;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker para validar la fuente." },
      { status: 502 },
    );
  }
}
