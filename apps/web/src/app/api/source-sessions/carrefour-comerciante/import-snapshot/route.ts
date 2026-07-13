import { NextResponse } from "next/server";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const workerSecret = process.env.WORKER_CRON_SECRET ?? process.env.CRON_SECRET;

  if (!workerSecret) {
    return NextResponse.json(
      {
        error:
          "WORKER_CRON_SECRET o CRON_SECRET no esta configurado en el frontend.",
      },
      { status: 500 },
    );
  }

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/sources/carrefour-comerciante/catalog/import-snapshot`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo conectar con el worker para importar el snapshot Carrefour Comerciante.",
      },
      { status: 502 },
    );
  }
}
