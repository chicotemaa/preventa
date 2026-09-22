import { requireAppAccess } from "@/lib/app-access";
import { NextResponse } from "next/server";
import { getPriceEvolution } from "@/lib/price-list-evolution";

export async function GET(request: Request) {
  const accessDenied = await requireAppAccess(request);
  if (accessDenied) return accessDenied;
  const evolution = await getPriceEvolution();
  return NextResponse.json(evolution);
}
