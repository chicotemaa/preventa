import { NextResponse } from "next/server";
import {
  archivePriceListRun,
  getPriceListRunDetail,
} from "@/lib/price-list-history";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  if (!UUID_PATTERN.test(runId)) {
    return NextResponse.json(
      { enabled: true, archived: false, errorMessage: "ID de corrida invalido." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
  } | null;

  if (body?.action !== "archive") {
    return NextResponse.json(
      { enabled: true, archived: false, errorMessage: "Accion invalida." },
      { status: 400 },
    );
  }

  const result = await archivePriceListRun(runId);
  return NextResponse.json(result, {
    status: result.archived ? 200 : result.enabled ? 500 : 503,
  });
}
