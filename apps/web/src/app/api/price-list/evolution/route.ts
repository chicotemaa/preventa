import { NextResponse } from "next/server";
import { getPriceEvolution } from "@/lib/price-list-evolution";

export async function GET() {
  const evolution = await getPriceEvolution();
  return NextResponse.json(evolution);
}
