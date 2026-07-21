import {
  buildCategoryPricingDashboard,
  buildSourceHealthSummary,
  type CategoryDecisionRow,
} from "@/lib/category-pricing";
import type {
  CatalogMetadata,
  CategorySearchResponse,
  SourceSearchStatus,
} from "@/types/search";

export const DEFAULT_ALERT_CATEGORY_QUERIES = [
  "alfajores",
  "jugos en polvo",
  "galletitas",
  "mermeladas",
  "chocolates",
  "salsas y aderezos",
  "cereales y barritas",
  "golosinas",
] as const;

export type PricingAlertType =
  | "source_unavailable"
  | "catalog_stale"
  | "price_above_wholesale"
  | "margin_opportunity"
  | "missing_own_price"
  | "retail_below_wholesale";

export type PricingAlertSeverity = "critical" | "warning" | "info";
export type PricingAlertStatus = "new" | "reviewed" | "resolved";

export type PricingAlertCandidate = {
  fingerprint: string;
  type: PricingAlertType;
  severity: PricingAlertSeverity;
  title: string;
  message: string;
  sourceId: string | null;
  productKey: string | null;
  productName: string | null;
  category: string | null;
  ownPrice: number | null;
  referencePrice: number | null;
  gapPercent: number | null;
  metadata: Record<string, unknown>;
};

export type PersistedPricingAlert = PricingAlertCandidate & {
  id: string;
  status: PricingAlertStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PricingAlertsResponse = {
  enabled: boolean;
  alerts: PersistedPricingAlert[];
  errorMessage?: string;
  migrationRequired?: boolean;
};

const MAX_ALERTS_PER_CATEGORY = 20;
const MAX_TOTAL_ALERTS = 160;
const STALE_CATALOG_MS = 24 * 60 * 60 * 1000;

export function buildPricingAlertCandidates({
  catalog,
  categoryResponses,
  now = new Date(),
}: {
  catalog: CatalogMetadata | null;
  categoryResponses: CategorySearchResponse[];
  now?: Date;
}) {
  const candidates = [
    ...buildCatalogAlerts(catalog, categoryResponses, now),
    ...categoryResponses.flatMap(buildCategoryAlerts),
  ];
  const unique = new Map<string, PricingAlertCandidate>();

  for (const candidate of candidates) {
    const current = unique.get(candidate.fingerprint);

    if (!current || getSeverityRank(candidate.severity) < getSeverityRank(current.severity)) {
      unique.set(candidate.fingerprint, candidate);
    }
  }

  return Array.from(unique.values())
    .sort(compareAlertCandidates)
    .slice(0, MAX_TOTAL_ALERTS);
}

export function getAlertCategoryQueries(rawValue = process.env.ALERT_CATEGORY_QUERIES) {
  const configured = rawValue
    ?.split(",")
    .map((query) => query.trim())
    .filter((query) => query.length >= 2);

  return configured?.length
    ? Array.from(new Set(configured)).slice(0, 16)
    : [...DEFAULT_ALERT_CATEGORY_QUERIES];
}

function buildCatalogAlerts(
  catalog: CatalogMetadata | null,
  categoryResponses: CategorySearchResponse[],
  now: Date,
) {
  const alerts: PricingAlertCandidate[] = [];
  const sources = mergeSourceStatuses([
    ...(catalog?.sources ?? []),
    ...categoryResponses.flatMap((response) => response.sources),
  ]);
  const sourceHealth = buildSourceHealthSummary(sources);

  for (const source of sourceHealth.criticalMissing) {
    alerts.push({
      fingerprint: buildFingerprint("source_unavailable", source.sourceId),
      type: "source_unavailable",
      severity: source.primaryReference || source.channel === "own" ? "critical" : "warning",
      title: `${source.displayName}: ${source.statusLabel}`,
      message: source.message,
      sourceId: source.sourceId,
      productKey: null,
      productName: null,
      category: null,
      ownPrice: null,
      referencePrice: null,
      gapPercent: null,
      metadata: {
        channel: source.channel,
        status: source.status,
        criticalForDecision: source.criticalForDecision,
        resultsCount: source.resultsCount,
      },
    });
  }

  const lastSyncedAt = catalog?.lastSyncedAt
    ? new Date(catalog.lastSyncedAt).getTime()
    : Number.NaN;
  const ageMs = now.getTime() - lastSyncedAt;

  if (!Number.isFinite(lastSyncedAt) || ageMs > STALE_CATALOG_MS) {
    alerts.push({
      fingerprint: buildFingerprint("catalog_stale", "catalog"),
      type: "catalog_stale",
      severity: "critical",
      title: "Catálogo competitivo desactualizado",
      message: Number.isFinite(lastSyncedAt)
        ? `La última actualización válida tiene ${Math.floor(ageMs / 3_600_000)} horas.`
        : "No hay una actualización válida registrada para el catálogo.",
      sourceId: null,
      productKey: null,
      productName: null,
      category: null,
      ownPrice: null,
      referencePrice: null,
      gapPercent: null,
      metadata: { lastSyncedAt: catalog?.lastSyncedAt ?? null, ageMs },
    });
  }

  return alerts;
}

function buildCategoryAlerts(response: CategorySearchResponse) {
  const alerts: PricingAlertCandidate[] = [];

  for (const group of response.groups) {
    const dashboard = buildCategoryPricingDashboard({
      group,
      sources: response.sources,
      searchedAt: response.searchedAt,
    });
    const categoryAlerts = dashboard.rows.flatMap((row) =>
      buildRowAlerts(row, dashboard.sourceHealth.criticalMissing.length > 0),
    );
    const missingOwnAlerts = dashboard.rows
      .filter(
        (row) =>
          !row.aguiarPrice &&
          Boolean(row.bestWholesale) &&
          row.sourcesWithPrice >= 2,
      )
      .sort((first, second) => second.sourcesWithPrice - first.sourcesWithPrice)
      .slice(0, 5)
      .map((row) => buildMissingOwnAlert(row));

    alerts.push(
      ...[...categoryAlerts, ...missingOwnAlerts]
        .sort(compareAlertCandidates)
        .slice(0, MAX_ALERTS_PER_CATEGORY),
    );
  }

  return alerts;
}

function buildRowAlerts(row: CategoryDecisionRow, hasCriticalCoverageGap: boolean) {
  const alerts: PricingAlertCandidate[] = [];
  const comparable =
    row.matchQuality === "match_exact" || row.matchQuality === "match_probable";
  const wholesaleGap =
    row.aguiarPrice && row.bestWholesale
      ? calculateGapPercent(row.aguiarPrice.price, row.bestWholesale.price)
      : null;

  if (
    comparable &&
    row.aguiarPrice &&
    row.bestWholesale &&
    wholesaleGap !== null &&
    wholesaleGap > 10
  ) {
    alerts.push({
      ...buildRowAlertBase(row),
      fingerprint: buildFingerprint(
        "price_above_wholesale",
        row.categoryName,
        row.id,
      ),
      type: "price_above_wholesale",
      severity: hasCriticalCoverageGap ? "warning" : "critical",
      title: `${row.clusterName}: Aguiar está arriba del mayorista`,
      message: hasCriticalCoverageGap
        ? `${formatPercent(wholesaleGap)} por encima de ${row.bestWholesale.sourceName}. Validar cobertura antes de ajustar.`
        : `${formatPercent(wholesaleGap)} por encima de ${row.bestWholesale.sourceName}. Revisar precio o promoción.`,
      gapPercent: wholesaleGap,
      metadata: {
        ...buildRowAlertBase(row).metadata,
        action: row.recommendation.label,
        limitedByCoverage: hasCriticalCoverageGap,
      },
    });
  }

  if (
    comparable &&
    row.aguiarPrice &&
    row.bestWholesale &&
    wholesaleGap !== null &&
    wholesaleGap < -8
  ) {
    alerts.push({
      ...buildRowAlertBase(row),
      fingerprint: buildFingerprint(
        "margin_opportunity",
        row.categoryName,
        row.id,
      ),
      type: "margin_opportunity",
      severity: "info",
      title: `${row.clusterName}: oportunidad de margen`,
      message: `Aguiar está ${formatPercent(Math.abs(wholesaleGap))} debajo de ${row.bestWholesale.sourceName}. Revisar margen sin perder competitividad.`,
      gapPercent: wholesaleGap,
      metadata: {
        ...buildRowAlertBase(row).metadata,
        action: row.recommendation.label,
      },
    });
  }

  const retailBelowWholesale = row.alerts.some(
    (alert) => alert.label === "Minorista bajo mayorista",
  );

  if (comparable && retailBelowWholesale && row.bestRetail && row.bestWholesale) {
    alerts.push({
      ...buildRowAlertBase(row),
      fingerprint: buildFingerprint(
        "retail_below_wholesale",
        row.categoryName,
        row.id,
      ),
      type: "retail_below_wholesale",
      severity: "warning",
      title: `${row.clusterName}: minorista debajo del mayorista`,
      message: `${row.bestRetail.sourceName} está por debajo de ${row.bestWholesale.sourceName}. Validar promoción y presentación.`,
      referencePrice: row.bestRetail.price,
      sourceId: row.bestRetail.sourceId,
      gapPercent: null,
      metadata: {
        ...buildRowAlertBase(row).metadata,
        wholesaleSource: row.bestWholesale.sourceName,
        wholesalePrice: row.bestWholesale.price,
      },
    });
  }

  return alerts;
}

function buildMissingOwnAlert(row: CategoryDecisionRow): PricingAlertCandidate {
  const base = buildRowAlertBase(row);

  return {
    ...base,
    fingerprint: buildFingerprint("missing_own_price", row.categoryName, row.id),
    type: "missing_own_price",
    severity: "warning",
    title: `${row.clusterName}: sin equivalente Aguiar`,
    message: `Hay precios en ${row.sourcesWithPrice} fuentes, incluido ${row.bestWholesale?.sourceName ?? "un mayorista"}, pero no un equivalente propio confirmado.`,
    metadata: {
      ...base.metadata,
      action: "Revisar catálogo o equivalencia",
    },
  };
}

function buildRowAlertBase(row: CategoryDecisionRow) {
  return {
    sourceId: row.bestWholesale?.sourceId ?? row.bestOverall?.sourceId ?? null,
    productKey: row.id,
    productName: row.clusterName,
    category: row.categoryName,
    ownPrice: row.aguiarPrice?.price ?? null,
    referencePrice: row.bestWholesale?.price ?? row.bestOverall?.price ?? null,
    gapPercent: row.gapVsAguiarPercent,
    metadata: {
      brand: row.brand,
      presentation: row.presentationLabel,
      matchQuality: row.matchQuality,
      confidenceScore: row.confidenceScore,
      sourcesWithPrice: row.sourcesWithPrice,
      winner: row.winningSourceName,
      hasPromo: row.hasPromo,
    },
  };
}

function mergeSourceStatuses(sources: SourceSearchStatus[]) {
  const bestBySource = new Map<string, SourceSearchStatus>();

  for (const source of sources) {
    const current = bestBySource.get(source.sourceId);

    if (!current || source.resultsCount > current.resultsCount) {
      bestBySource.set(source.sourceId, source);
    }
  }

  return Array.from(bestBySource.values());
}

function buildFingerprint(...parts: string[]) {
  return parts.map(normalizeFingerprintPart).filter(Boolean).join(":");
}

function normalizeFingerprintPart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function compareAlertCandidates(
  first: PricingAlertCandidate,
  second: PricingAlertCandidate,
) {
  const severityDifference =
    getSeverityRank(first.severity) - getSeverityRank(second.severity);

  if (severityDifference !== 0) {
    return severityDifference;
  }

  return Math.abs(second.gapPercent ?? 0) - Math.abs(first.gapPercent ?? 0);
}

function getSeverityRank(severity: PricingAlertSeverity) {
  return severity === "critical" ? 0 : severity === "warning" ? 1 : 2;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)}%`;
}

function calculateGapPercent(ownPrice: number, referencePrice: number) {
  if (referencePrice <= 0) {
    return null;
  }

  return ((ownPrice - referencePrice) / referencePrice) * 100;
}
