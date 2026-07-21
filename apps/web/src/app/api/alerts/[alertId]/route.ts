import { NextResponse } from "next/server";
import { updatePricingAlertStatus } from "@/lib/pricing-alert-store";
import type { PricingAlertStatus } from "@/lib/pricing-alerts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ alertId: string }> },
) {
  const { alertId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: PricingAlertStatus;
  } | null;

  if (!UUID_PATTERN.test(alertId)) {
    return NextResponse.json(
      { enabled: true, updated: false, errorMessage: "ID de alerta inválido." },
      { status: 400 },
    );
  }

  if (!body?.status || !["new", "reviewed", "resolved"].includes(body.status)) {
    return NextResponse.json(
      { enabled: true, updated: false, errorMessage: "Estado inválido." },
      { status: 400 },
    );
  }

  const result = await updatePricingAlertStatus(alertId, body.status);
  return NextResponse.json(result, {
    status: result.updated ? 200 : result.enabled ? 500 : 503,
  });
}
