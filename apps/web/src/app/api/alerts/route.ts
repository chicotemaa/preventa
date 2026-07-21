import { NextResponse } from "next/server";
import { getPricingAlerts } from "@/lib/pricing-alert-store";

export async function GET() {
  return NextResponse.json(await getPricingAlerts());
}
