import type { CatalogMetadata, PriceObservationSummary } from "@/types/search";
import { compareSourcePriority, getSourceChannel, getSourceConfig, getSourceDisplayName, sourcePriorityConfig } from "./source-priority";

export type ActiveExcelStatus = {
  status: "available" | "missing" | "unavailable";
  name?: string;
  savedAt?: string;
  itemsCount?: number;
  pricesCount?: number;
};

export type CatalogOperationalStatus = {
  checkedAt: string;
  catalog: CatalogMetadata | null;
  observationsBySource: Record<string, PriceObservationSummary>;
  excel: ActiveExcelStatus;
  cronConfigured: boolean;
  errorMessage?: string;
};

export function buildCatalogReadiness(data: CatalogOperationalStatus) {
  const actual = new Map(data.catalog?.sources.map(source => [source.sourceId, source]) ?? []);
  const pending = new Map(data.catalog?.pendingSources.map(source => [source.sourceId, source]) ?? []);
  const ids = new Set([
    ...sourcePriorityConfig.filter(source => source.expectedInDashboard).map(source => source.sourceId),
    ...actual.keys(),
  ]);
  const sources = [...ids].map(sourceId => {
    const source = actual.get(sourceId);
    const config = getSourceConfig(sourceId);
    const observation = data.observationsBySource[sourceId];
    const channel = getSourceChannel(source ?? { sourceId });
    const total = observation?.totalProducts ?? source?.resultsCount ?? 0;
    const current = observation?.currentProducts ?? 0;
    const unavailable = !data.catalog;
    const state = unavailable ? "Sin verificar" : total === 0 ? "Sin datos" : current === total ? "Vigente" : current > 0 ? "Parcial" : "Revisar vigencia";
    return {
      sourceId, channel,
      name: channel === "own" ? "Tokin / Arcor (proveedor)" : getSourceDisplayName(source ?? { sourceId }),
      critical: config?.criticalForDecision ?? false,
      total, current, state,
      outdated: observation?.outdatedProducts ?? 0,
      undated: observation?.undatedProducts ?? Math.max(0, total - (observation?.datedProducts ?? 0)),
      latestPriceAt: observation?.newestObservedAt ?? null,
      note: source?.errorMessage ?? pending.get(sourceId)?.message ?? (total === 0 ? config?.fallbackMessage : undefined),
    };
  }).sort((a, b) => compareSourcePriority({ sourceId: a.sourceId, storeType: a.channel === "minorista" ? "minorista" : "mayorista" }, { sourceId: b.sourceId, storeType: b.channel === "minorista" ? "minorista" : "mayorista" }));

  return {
    sources,
    criticalWholesalersWithoutCurrentPrices: sources.filter(source => source.channel === "mayorista" && source.critical && source.current === 0).length,
  };
}
