import { NextResponse } from "next/server";

const WORKER_TRIGGER_TIMEOUT_MS = 15_000;

export const maxDuration = 30;

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

  const workerUrl = process.env.WORKER_URL?.trim();

  if (!workerUrl) {
    return NextResponse.json(
      {
        error:
          "WORKER_URL no esta configurado. El cron necesita apuntar al worker persistente.",
      },
      { status: 500 },
    );
  }

  const workerSecret = process.env.WORKER_CRON_SECRET ?? cronSecret;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WORKER_TRIGGER_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/sync/background`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
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
        { status: 502 },
      );
    }

    const started = payload?.started === true;

    return NextResponse.json(
      {
        ok: true,
        triggeredAt: new Date().toISOString(),
        started,
        alreadyRunning: payload?.alreadyRunning === true,
        catalog: payload?.catalog ?? null,
      },
      { status: started ? 202 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "El worker no confirmo el inicio de la sincronizacion dentro de 15 segundos."
            : "No se pudo conectar con el worker para iniciar la sincronizacion.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
