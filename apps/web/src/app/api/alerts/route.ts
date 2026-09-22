import { requireAppAccess } from "@/lib/app-access";
import { NextResponse } from "next/server";
import { getPricingAlerts } from "@/lib/pricing-alert-store";

export async function GET(request: Request) {
  const accessDenied = await requireAppAccess(request);
  if (accessDenied) return accessDenied;
  return NextResponse.json(await getPricingAlerts());
}
