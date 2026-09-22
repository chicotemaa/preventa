import { requireAppAccess } from "@/lib/app-access";
import { NextResponse } from "next/server";
import { getPriceListHistory } from "@/lib/price-list-history";

export async function GET(request: Request) {
  const accessDenied = await requireAppAccess(request);
  if (accessDenied) return accessDenied;
  const history = await getPriceListHistory();
  return NextResponse.json(history);
}
