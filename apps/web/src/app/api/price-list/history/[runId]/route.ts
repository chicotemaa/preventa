import { NextResponse } from "next/server";
import { getPriceListRunDetail } from "@/lib/price-list-history";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  if (!UUID_PATTERN.test(runId)) {
    return NextResponse.json(
      { enabled: true, detail: null, errorMessage: "ID de corrida invalido." },
      { status: 400 },
    );
  }

  const detail = await getPriceListRunDetail(runId);
  return NextResponse.json(detail, {
    status: !detail.enabled || detail.detail ? 200 : 404,
  });
}
