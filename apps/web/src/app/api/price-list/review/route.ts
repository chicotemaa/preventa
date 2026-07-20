import { NextResponse } from "next/server";
import { getPriceListReviewData } from "@/lib/price-list-review-data";

export async function GET() {
  return NextResponse.json(await getPriceListReviewData());
}
