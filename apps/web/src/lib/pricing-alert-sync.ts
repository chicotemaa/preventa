import {
  buildPricingAlertCandidates,
  getAlertCategoryQueries,
  type PricingAlertCandidate,
} from "@/lib/pricing-alerts";
import {
  persistPricingAlerts,
  type PricingAlertSyncResult,
} from "@/lib/pricing-alert-store";
import type {
  CatalogMetadata,
  CategorySearchResponse,
} from "@/types/search";

type CategoryFetchResult =
  | { ok: true; query: string; response: CategorySearchResponse }
  | { ok: false; query: string; error: string };

export type AlertRefreshResult = {
  requestedCategories: number;
  successfulCategories: number;
  failedCategories: Array<{ query: string; error: string }>;
  persistence: PricingAlertSyncResult;
  email: AlertEmailResult;
};

export type AlertEmailResult = {
  enabled: boolean;
  sent: boolean;
  messageId?: string;
  errorMessage?: string;
};

const CATEGORY_FETCH_CONCURRENCY = 4;
const DEFAULT_CATEGORY_FETCH_TIMEOUT_MS = 20_000;

export async function refreshPricingAlertsAfterCatalogSync({
  workerUrl,
  catalog,
}: {
  workerUrl: string;
  catalog: CatalogMetadata | null;
}): Promise<AlertRefreshResult> {
  const queries = getAlertCategoryQueries();
  const categoryResults = await mapWithConcurrency(
    queries,
    CATEGORY_FETCH_CONCURRENCY,
    (query) => fetchCategory(workerUrl, query),
  );
  const successfulResponses = categoryResults
    .filter(
      (result): result is Extract<CategoryFetchResult, { ok: true }> => result.ok,
    )
    .map((result) => result.response);
  const failedCategories = categoryResults
    .filter(
      (result): result is Extract<CategoryFetchResult, { ok: false }> => !result.ok,
    )
    .map(({ query, error }) => ({ query, error }));
  const candidates = buildPricingAlertCandidates({
    catalog,
    categoryResponses: successfulResponses,
  });
  const persistence = await persistPricingAlerts(candidates, {
    resolveMissing: failedCategories.length === 0,
  });
  const email =
    persistence.enabled && !persistence.errorMessage
      ? await sendAlertDigest(candidates, persistence)
      : { enabled: false, sent: false };

  return {
    requestedCategories: queries.length,
    successfulCategories: successfulResponses.length,
    failedCategories,
    persistence,
    email,
  };
}

async function fetchCategory(
  workerUrl: string,
  query: string,
): Promise<CategoryFetchResult> {
  const timeoutMs = getCategoryFetchTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${workerUrl.replace(/\/$/, "")}/catalog/category-search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode: "catalog" }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      return {
        ok: false,
        query,
        error:
          payload?.error ?? `El worker respondió con estado ${response.status}.`,
      };
    }

    return { ok: true, query, response: payload as CategorySearchResponse };
  } catch (error) {
    return {
      ok: false,
      query,
      error:
        error instanceof Error && error.name === "AbortError"
          ? `La categoría excedió ${Math.round(timeoutMs / 1000)} segundos.`
          : "No se pudo consultar la categoría.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendAlertDigest(
  candidates: PricingAlertCandidate[],
  sync: PricingAlertSyncResult,
): Promise<AlertEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipients = process.env.ALERT_EMAIL_TO?.split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (!apiKey || !recipients?.length || candidates.length === 0) {
    return { enabled: Boolean(apiKey && recipients?.length), sent: false };
  }

  const from =
    process.env.ALERT_EMAIL_FROM?.trim() ??
    "Aguiar Alertas <onboarding@resend.dev>";
  const topAlerts = candidates.slice(0, 20);
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date());

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `aguiar-pricing-alerts-${dateKey}`,
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: `Aguiar: ${sync.critical} críticas y ${sync.warning} alertas para revisar`,
        html: buildDigestHtml(topAlerts, sync),
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        enabled: true,
        sent: false,
        errorMessage:
          payload?.message ?? `Resend respondió con estado ${response.status}.`,
      };
    }

    return {
      enabled: true,
      sent: true,
      messageId: typeof payload?.id === "string" ? payload.id : undefined,
    };
  } catch (error) {
    return {
      enabled: true,
      sent: false,
      errorMessage:
        error instanceof Error
          ? error.message
          : "No se pudo enviar el resumen de alertas.",
    };
  }
}

function buildDigestHtml(
  alerts: PricingAlertCandidate[],
  sync: PricingAlertSyncResult,
) {
  const rows = alerts
    .map(
      (alert) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:600">${escapeHtml(alert.title)}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(alert.category ?? "Cobertura")}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb">${escapeHtml(formatSeverity(alert.severity))}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#171717;max-width:760px;margin:auto">
      <h1 style="font-size:22px;margin-bottom:8px">Resumen diario de pricing</h1>
      <p style="color:#5f6b7a">${sync.generated} alertas activas: ${sync.critical} críticas, ${sync.warning} para revisar y ${sync.info} oportunidades.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f8fafc"><th style="padding:10px;text-align:left">Alerta</th><th style="padding:10px;text-align:left">Categoría</th><th style="padding:10px;text-align:left">Nivel</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:18px;color:#5f6b7a">Abrí la sección Alertas de Aguiar Gestión de precios para revisar el detalle.</p>
    </div>`;
}

function formatSeverity(severity: PricingAlertCandidate["severity"]) {
  return severity === "critical"
    ? "Crítica"
    : severity === "warning"
      ? "Revisar"
      : "Oportunidad";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function getCategoryFetchTimeoutMs() {
  const configured = Number(process.env.ALERT_CATEGORY_TIMEOUT_MS);

  return Number.isFinite(configured) && configured >= 5_000
    ? Math.min(configured, 30_000)
    : DEFAULT_CATEGORY_FETCH_TIMEOUT_MS;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}
