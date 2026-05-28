import { NextResponse } from "next/server";
import { savePriceListRun } from "@/lib/price-list-persistence";
import type { PriceListResponse } from "@/types/search";

export async function POST(request: Request) {
  let body: { response?: PriceListResponse };

  try {
    body = (await request.json()) as { response?: PriceListResponse };
  } catch {
    return NextResponse.json({ error: "Body JSON invalido." }, { status: 400 });
  }

  if (!isPriceListResponse(body.response)) {
    return NextResponse.json(
      { error: "La evaluacion enviada no es valida." },
      { status: 400 },
    );
  }

  const persistence = await savePriceListRun(body.response);
  return NextResponse.json({ persistence });
}

function isPriceListResponse(value: unknown): value is PriceListResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<PriceListResponse>;
  return (
    typeof response.searchedAt === "string" &&
    typeof response.durationMs === "number" &&
    typeof response.itemsCount === "number" &&
    typeof response.matchedCount === "number" &&
    typeof response.unmatchedCount === "number" &&
    Array.isArray(response.sources) &&
    Array.isArray(response.results) &&
    Boolean(response.catalog)
  );
}
