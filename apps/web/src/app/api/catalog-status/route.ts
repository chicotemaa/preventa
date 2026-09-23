import { NextResponse } from "next/server";
import { requireAppAccess } from "@/lib/app-access";
import { workerFetch } from "@/lib/worker-request";
import { getLatestImportIds } from "@/lib/commercial-reference-data";
import { isSupabaseConfigured, selectSupabaseRows } from "@/lib/supabase-admin";
import type { ActiveExcelStatus, CatalogOperationalStatus } from "@/lib/catalog-readiness";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  const data: CatalogOperationalStatus = {
    checkedAt: new Date().toISOString(), catalog: null, observationsBySource: {},
    excel: { status: "unavailable" },
    cronConfigured: Boolean(process.env.CRON_SECRET && process.env.WORKER_URL),
  };
  const workerUrl = process.env.WORKER_URL ?? "http://127.0.0.1:4000";
  try {
    const response = await workerFetch(`${workerUrl.replace(/\/$/, "")}/catalog/status`, {
      cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Worker no disponible");
    const payload = await response.json();
    if (!payload.catalog || !Array.isArray(payload.catalog.sources) || !Array.isArray(payload.catalog.pendingSources) || !Number.isFinite(payload.catalog.productsCount)) {
      throw new Error("Estado invalido");
    }
    data.catalog = payload.catalog;
    data.observationsBySource = payload.observationsBySource ?? {};
  } catch {
    data.errorMessage = "No se pudo verificar el catalogo guardado. No se muestran ceros como si fueran una consulta exitosa.";
  }
  data.excel = await getActiveExcelStatus();
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}

async function getActiveExcelStatus(): Promise<ActiveExcelStatus> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const [active] = await getLatestImportIds(1);
    if (!active) return { status: "missing" };
    const [run] = await selectSupabaseRows<Array<{
      list_name: string; created_at: string; items_count: number;
      metadata: { excelPriceCount?: number } | null;
    }>>("price_list_runs", { select: "list_name,created_at,items_count,metadata", filters: { id: `eq.${active.id}` }, limit: 1 });
    if (!run) return { status: "unavailable" };
    return { status: "available", name: run.list_name, savedAt: run.created_at,
      itemsCount: run.items_count, pricesCount: run.metadata?.excelPriceCount };
  } catch {
    return { status: "unavailable" };
  }
}
