import {
  isSupabaseConfigured,
  selectSupabaseRows,
  updateSupabaseRows,
  upsertSupabaseRows,
} from "@/lib/supabase-admin";
import type {
  PersistedPricingAlert,
  PricingAlertCandidate,
  PricingAlertsResponse,
  PricingAlertStatus,
} from "@/lib/pricing-alerts";

type PricingAlertRow = {
  id: string;
  fingerprint: string;
  type: PricingAlertCandidate["type"];
  severity: PricingAlertCandidate["severity"];
  status: PricingAlertStatus;
  title: string;
  message: string;
  source_id: string | null;
  product_key: string | null;
  product_name: string | null;
  category: string | null;
  own_price: number | string | null;
  reference_price: number | string | null;
  gap_percent: number | string | null;
  metadata: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PricingAlertSyncResult = {
  enabled: boolean;
  generated: number;
  created: number;
  reactivated: number;
  resolved: number;
  critical: number;
  warning: number;
  info: number;
  errorMessage?: string;
  migrationRequired?: boolean;
};

const ALERT_SELECT =
  "id,fingerprint,type,severity,status,title,message,source_id,product_key,product_name,category,own_price,reference_price,gap_percent,metadata,first_seen_at,last_seen_at,resolved_at,created_at,updated_at";

export async function getPricingAlerts(): Promise<PricingAlertsResponse> {
  if (!isSupabaseConfigured()) {
    return { enabled: false, alerts: [] };
  }

  try {
    const rows = await selectSupabaseRows<PricingAlertRow[]>("pricing_alerts", {
      select: ALERT_SELECT,
      order: "last_seen_at.desc",
      limit: 500,
    });

    return { enabled: true, alerts: rows.map(mapPricingAlertRow) };
  } catch (error) {
    return {
      enabled: true,
      alerts: [],
      errorMessage: getErrorMessage(error),
      migrationRequired: isMissingPricingAlertsTable(error),
    };
  }
}

export async function updatePricingAlertStatus(
  alertId: string,
  status: PricingAlertStatus,
) {
  if (!isSupabaseConfigured()) {
    return { enabled: false, updated: false };
  }

  try {
    const now = new Date().toISOString();
    await updateSupabaseRows(
      "pricing_alerts",
      {
        status,
        resolved_at: status === "resolved" ? now : null,
        updated_at: now,
      },
      { filters: { id: `eq.${alertId}` } },
    );

    return { enabled: true, updated: true };
  } catch (error) {
    return {
      enabled: true,
      updated: false,
      errorMessage: getErrorMessage(error),
      migrationRequired: isMissingPricingAlertsTable(error),
    };
  }
}

export async function persistPricingAlerts(
  candidates: PricingAlertCandidate[],
  options: { resolveMissing?: boolean; seenAt?: string } = {},
): Promise<PricingAlertSyncResult> {
  const baseResult = summarizeCandidates(candidates);

  if (!isSupabaseConfigured()) {
    return { ...baseResult, enabled: false };
  }

  const seenAt = options.seenAt ?? new Date().toISOString();

  try {
    const existingRows = await selectSupabaseRows<PricingAlertRow[]>(
      "pricing_alerts",
      {
        select: ALERT_SELECT,
        order: "last_seen_at.desc",
        limit: 1_000,
      },
    );
    const existingByFingerprint = new Map(
      existingRows.map((row) => [row.fingerprint, row]),
    );
    const activeFingerprints = new Set(
      candidates.map((candidate) => candidate.fingerprint),
    );
    const reactivatedRows = candidates
      .map((candidate) => existingByFingerprint.get(candidate.fingerprint))
      .filter(
        (row): row is PricingAlertRow => row?.status === "resolved",
      );
    const rowsToResolve = options.resolveMissing
      ? existingRows.filter(
          (row) =>
            row.status !== "resolved" &&
            !activeFingerprints.has(row.fingerprint),
        )
      : [];

    if (candidates.length > 0) {
      await upsertSupabaseRows(
        "pricing_alerts",
        candidates.map((candidate) => mapPricingAlertCandidate(candidate, seenAt)),
        { onConflict: "fingerprint" },
      );
    }

    await Promise.all([
      ...reactivatedRows.map((row) =>
        updateSupabaseRows(
          "pricing_alerts",
          { status: "new", resolved_at: null, updated_at: seenAt },
          { filters: { id: `eq.${row.id}` } },
        ),
      ),
      ...rowsToResolve.map((row) =>
        updateSupabaseRows(
          "pricing_alerts",
          { status: "resolved", resolved_at: seenAt, updated_at: seenAt },
          { filters: { id: `eq.${row.id}` } },
        ),
      ),
    ]);

    return {
      ...baseResult,
      enabled: true,
      created: candidates.filter(
        (candidate) => !existingByFingerprint.has(candidate.fingerprint),
      ).length,
      reactivated: reactivatedRows.length,
      resolved: rowsToResolve.length,
    };
  } catch (error) {
    return {
      ...baseResult,
      enabled: true,
      errorMessage: getErrorMessage(error),
      migrationRequired: isMissingPricingAlertsTable(error),
    };
  }
}

function summarizeCandidates(
  candidates: PricingAlertCandidate[],
): PricingAlertSyncResult {
  return {
    enabled: true,
    generated: candidates.length,
    created: 0,
    reactivated: 0,
    resolved: 0,
    critical: candidates.filter((candidate) => candidate.severity === "critical")
      .length,
    warning: candidates.filter((candidate) => candidate.severity === "warning")
      .length,
    info: candidates.filter((candidate) => candidate.severity === "info").length,
  };
}

function mapPricingAlertCandidate(
  candidate: PricingAlertCandidate,
  seenAt: string,
) {
  return {
    fingerprint: candidate.fingerprint,
    type: candidate.type,
    severity: candidate.severity,
    title: candidate.title,
    message: candidate.message,
    source_id: candidate.sourceId,
    product_key: candidate.productKey,
    product_name: candidate.productName,
    category: candidate.category,
    own_price: candidate.ownPrice,
    reference_price: candidate.referencePrice,
    gap_percent: candidate.gapPercent,
    metadata: candidate.metadata,
    last_seen_at: seenAt,
    updated_at: seenAt,
  };
}

function mapPricingAlertRow(row: PricingAlertRow): PersistedPricingAlert {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    message: row.message,
    sourceId: row.source_id,
    productKey: row.product_key,
    productName: row.product_name,
    category: row.category,
    ownPrice: parseNullableNumber(row.own_price),
    referencePrice: parseNullableNumber(row.reference_price),
    gapPercent: parseNullableNumber(row.gap_percent),
    metadata: row.metadata ?? {},
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseNullableNumber(value: number | string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo acceder a las alertas.";
}

function isMissingPricingAlertsTable(error: unknown) {
  return /pricing_alerts|PGRST205|schema cache|does not exist/i.test(
    getErrorMessage(error),
  );
}
