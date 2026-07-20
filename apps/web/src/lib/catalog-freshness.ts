import type { CatalogMetadata } from "@/types/search";

const FRESH_LIMIT_MS = 36 * 60 * 60 * 1000;
const STALE_LIMIT_MS = 72 * 60 * 60 * 1000;

export type CatalogFreshnessTone = "success" | "warning" | "danger" | "info";

export type CatalogFreshness = {
  tone: CatalogFreshnessTone;
  label: string;
  detail: string;
  ageHours: number | null;
  storedSnapshotSources: number;
};

export function getCatalogFreshness(
  catalog: CatalogMetadata,
  now = Date.now(),
): CatalogFreshness {
  const storedSnapshotSources = catalog.sources.filter(
    (source) => source.usingStoredSnapshot,
  ).length;

  if (catalog.status === "syncing") {
    return {
      tone: "info",
      label: "Actualización en curso",
      detail:
        "La consulta usa el catálogo guardado mientras el worker actualiza las fuentes.",
      ageHours: calculateAgeHours(catalog.lastSyncedAt, now),
      storedSnapshotSources,
    };
  }

  const ageHours = calculateAgeHours(catalog.lastSyncedAt, now);

  if (ageHours === null) {
    return {
      tone: "danger",
      label: "Catálogo sin sincronizar",
      detail:
        "Todavía no existe una actualización diaria válida para comparar precios.",
      ageHours,
      storedSnapshotSources,
    };
  }

  if (catalog.usingLastGoodSnapshot) {
    return {
      tone: "warning",
      label: "Usando último catálogo válido",
      detail:
        "La actualización más reciente falló. Los precios visibles corresponden al último snapshot completo guardado.",
      ageHours,
      storedSnapshotSources,
    };
  }

  const ageMs = ageHours * 60 * 60 * 1000;

  if (ageMs <= FRESH_LIMIT_MS) {
    return {
      tone: storedSnapshotSources > 0 ? "warning" : "success",
      label:
        storedSnapshotSources > 0
          ? "Catálogo actualizado con datos conservados"
          : "Catálogo actualizado",
      detail:
        storedSnapshotSources > 0
          ? `${storedSnapshotSources} fuentes conservaron su último dato válido porque no entregaron una actualización nueva.`
          : "La consulta usa el catálogo offline generado por la sincronización diaria.",
      ageHours,
      storedSnapshotSources,
    };
  }

  if (ageMs <= STALE_LIMIT_MS) {
    return {
      tone: "warning",
      label: "Catálogo pendiente de actualización",
      detail:
        "La última actualización tiene más de 36 horas. Se puede consultar, pero conviene revisar el cron.",
      ageHours,
      storedSnapshotSources,
    };
  }

  return {
    tone: "danger",
    label: "Catálogo desactualizado",
    detail:
      "La última actualización tiene más de 72 horas. No conviene cerrar decisiones de precio sin sincronizar.",
    ageHours,
    storedSnapshotSources,
  };
}

function calculateAgeHours(value: string | null, now: number) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(now - timestamp, 0) / (60 * 60 * 1000);
}
