import { getPriceListRunDetail } from "./price-list-history";
import { isSupabaseConfigured, selectSupabaseRows } from "./supabase-admin";
import { toCommercialReference, type CommercialReference } from "./commercial-reference";

export async function getCommercialReference(): Promise<CommercialReference> {
  const empty: CommercialReference = { enabled: isSupabaseConfigured(), runId: null, listName: null, evaluatedAt: null, results: [] };
  if (!empty.enabled) return empty;
  try {
    // Only daily evaluations linked to the active Excel may supersede its initial evaluation.
    const runs = await getActiveEvaluationIds(1);
    if (!runs.length) return empty;
    const response = await getPriceListRunDetail(runs[0].id);
    if (response.errorMessage || !response.detail) throw new Error("La ultima carga no se pudo leer completa.");
    return toCommercialReference(response.detail);
  } catch {
    return { ...empty, errorMessage: "No se pudo cargar la evaluacion Excel guardada. Reintentar; no se reemplaza por Tokin." };
  }
}

export function getLatestImportIds(limit = 2) {
  return selectSupabaseRows<Array<{ id: string }>>("price_list_runs", {
    select: "id", filters: { status: "neq.archived", "metadata->>origin": "eq.manual_import" },
    order: "created_at.desc,id.desc", limit,
  });
}

export async function getActiveEvaluationIds(limit = 2) {
  const [base] = await getLatestImportIds(1);
  if (!base) return [];
  return selectSupabaseRows<Array<{ id: string }>>("price_list_runs", {
    select: "id", filters: { status: "neq.archived",
      or: `(id.eq.${base.id},and(metadata->>origin.eq.scheduled_catalog,metadata->>sourceRunId.eq.${base.id}))` },
    order: "created_at.desc,id.desc", limit,
  });
}
