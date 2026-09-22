import type { CatalogMetadata } from "@/types/search";
import { formatPriceObservation, getPriceFreshness } from "./price-freshness";

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

  const observations = catalog.priceObservations;
  const oldestPrice = getPriceFreshness(observations?.oldestObservedAt, now);
  const ageHours = oldestPrice.ageHours;
  const undated = observations
    ? Math.max(0, observations.totalProducts - observations.datedProducts)
    : catalog.productsCount;

  if (ageHours === null) {
    return {
      tone: "danger",
      label: "Vigencia de precios sin verificar",
      detail:
        "No hay fechas de consulta verificables por precio. Ejecutar el cron no acredita la vigencia de los datos conservados.",
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

  if (undated > 0) {
    return {
      tone: "warning", label: "Catálogo con fechas incompletas",
      detail: `${undated} precios sin fecha verificable. Precio fechado mas antiguo: ${formatPriceObservation(observations?.oldestObservedAt)}. No se usan referencias sin vigencia para decidir.`,
      ageHours, storedSnapshotSources,
    };
  }

  if (ageMs <= FRESH_LIMIT_MS) {
    return {
      tone: storedSnapshotSources > 0 ? "warning" : "success",
      label:
        storedSnapshotSources > 0
          ? "Precios vigentes con datos conservados"
          : "Precios con fecha vigente",
      detail:
        storedSnapshotSources > 0
          ? `${storedSnapshotSources} fuentes conservaron su último dato válido porque no entregaron una actualización nueva.`
          : "Todos los precios fechados fueron consultados en las ultimas 36 horas.",
      ageHours,
      storedSnapshotSources,
    };
  }

  if (ageMs <= STALE_LIMIT_MS) {
    return {
      tone: "warning",
      label: "Catálogo pendiente de actualización",
      detail:
        "Hay precios consultados hace mas de 36 horas. Una consolidacion reciente no renueva las fechas de los productos conservados.",
      ageHours,
      storedSnapshotSources,
    };
  }

  return {
    tone: "danger",
    label: "Catálogo desactualizado",
    detail:
      "Hay precios de mas de 72 horas. Siguen disponibles en el detalle, pero no justifican recomendaciones de precio.",
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
