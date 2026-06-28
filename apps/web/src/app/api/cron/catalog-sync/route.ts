import { NextResponse } from "next/server";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

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

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;
  const workerSecret = process.env.WORKER_CRON_SECRET ?? cronSecret;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/sync/background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
        },
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

    return NextResponse.json({
      ok: true,
      triggeredAt: new Date().toISOString(),
      worker: payload,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el worker para sincronizar catalogo." },
      { status: 502 },
    );
  }
}
