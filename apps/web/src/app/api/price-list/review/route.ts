import { requireAppAccess } from "@/lib/app-access";
import { NextResponse } from "next/server";
import { getPriceListReviewData } from "@/lib/price-list-review-data";

export async function GET(request: Request) {
  const accessDenied = await requireAppAccess(request);
  if (accessDenied) return accessDenied;
  return NextResponse.json(await getPriceListReviewData());
}
