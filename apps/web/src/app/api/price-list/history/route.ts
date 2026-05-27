import { NextResponse } from "next/server";
import { getPriceListHistory } from "@/lib/price-list-history";

export async function GET() {
  const history = await getPriceListHistory();
  return NextResponse.json(history);
}
