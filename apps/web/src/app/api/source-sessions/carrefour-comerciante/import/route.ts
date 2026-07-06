import { NextResponse } from "next/server";

const DEFAULT_WORKER_URL =
  process.env.NODE_ENV === "production"
    ? "https://preventa-worker.vercel.app"
    : "http://127.0.0.1:4000";

type ImportProduct = {
  name: string;
  price: number | string;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  priceCondition?: string | null;
  alternatePrices?: Array<{
    label: string;
    price: number;
    comparisonPrice?: number | null;
  }>;
};

type ImportBody = {
  mode?: "replace" | "append";
  query?: string;
  page?: number;
  sourceUrl?: string | null;
  errors?: string[];
  products?: ImportProduct[];
};

export async function POST(request: Request) {
  let body: ImportBody;

  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const products = Array.isArray(body.products) ? body.products : [];
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

  if (query.length < 2 || query.length > 120) {
    return NextResponse.json(
      { error: "La consulta debe tener entre 2 y 120 caracteres." },
      { status: 400 },
    );
  }

  if (products.length < 1 || products.length > 120) {
    return NextResponse.json(
      { error: "Enviar entre 1 y 120 productos por lote." },
      { status: 400 },
    );
  }

  const workerUrl = process.env.WORKER_URL ?? DEFAULT_WORKER_URL;

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/sources/carrefour-comerciante/catalog/import`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: body.mode === "replace" ? "replace" : "append",
          query,
          page: body.page,
          sourceUrl: body.sourceUrl ?? null,
          errors: body.errors,
          products,
        }),
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
          "No se pudo conectar con el worker para importar Carrefour Comerciante.",
      },
      { status: 502 },
    );
  }
}
