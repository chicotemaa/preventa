import { requireAppAccess } from "@/lib/app-access";
import { NextResponse } from "next/server";
import { getCommercialReference } from "@/lib/commercial-reference-data";
import { selectCommercialReference, type ReferenceProductIdentity } from "@/lib/commercial-reference";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessDenied = await requireAppAccess(request);
  if (accessDenied) return accessDenied;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.products) || body.products.length > 3000 || !body.products.every(isIdentity)) {
    return NextResponse.json({ error: "Identidades de producto invalidas." }, { status: 400 });
  }
  const data = await getCommercialReference();
  const selected = selectCommercialReference(body.products, data);
  const results = selected.results.map(row => ({ ...row, diagnostics: row.diagnostics ? {
    expectedBrand: row.diagnostics.expectedBrand, matchedQuery: row.diagnostics.matchedQuery,
    queriesTried: [], queryDiagnostics: [], aguiarPriceNormalization: row.diagnostics.aguiarPriceNormalization,
  } : undefined }));
  return NextResponse.json({ ...data, results, ambiguousMatches: selected.ambiguous },
    { status: data.errorMessage ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}

function isIdentity(value: unknown): value is ReferenceProductIdentity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.sourceId === "string" && v.sourceId.length <= 150 && typeof v.storeName === "string" && v.storeName.length <= 200 &&
    (v.storeType === "mayorista" || v.storeType === "minorista") &&
    (v.sku == null || typeof v.sku === "string" && v.sku.length <= 100) &&
    (v.barcodes == null || Array.isArray(v.barcodes) && v.barcodes.length <= 20 && v.barcodes.every(code => typeof code === "string" && code.length <= 100));
}
