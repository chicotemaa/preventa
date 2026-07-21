"use client";

import {
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PersistedPricingAlert,
  PricingAlertsResponse,
  PricingAlertStatus,
} from "@/lib/pricing-alerts";

type AlertViewFilter =
  | "active"
  | "new"
  | "critical"
  | "pricing"
  | "sources"
  | "opportunities"
  | "resolved";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function PricingAlertsDashboard() {
  const [data, setData] = useState<PricingAlertsResponse | null>(null);
  const [filter, setFilter] = useState<AlertViewFilter>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
      const payload = (await response.json()) as PricingAlertsResponse;

      if (!response.ok || payload.errorMessage) {
        setData(payload);
        setError(payload.errorMessage ?? "No se pudieron cargar las alertas.");
        return;
      }

      setData(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudieron cargar las alertas.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const summary = useMemo(() => buildSummary(data?.alerts ?? []), [data]);
  const visibleAlerts = useMemo(
    () => filterAlerts(data?.alerts ?? [], filter, searchTerm),
    [data, filter, searchTerm],
  );

  async function updateStatus(alertId: string, status: PricingAlertStatus) {
    setUpdatingId(alertId);
    setError(null);

    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as {
        updated?: boolean;
        errorMessage?: string;
      };

      if (!response.ok || !payload.updated) {
        throw new Error(payload.errorMessage ?? "No se pudo actualizar la alerta.");
      }

      setData((current) =>
        current
          ? {
              ...current,
              alerts: current.alerts.map((alert) =>
                alert.id === alertId
                  ? {
                      ...alert,
                      status,
                      resolvedAt:
                        status === "resolved" ? new Date().toISOString() : null,
                    }
                  : alert,
              ),
            }
          : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo actualizar la alerta.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#667789]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando alertas
      </div>
    );
  }

  if (!data?.enabled) {
    return <EmptyState text="Las alertas estarán disponibles cuando Supabase esté configurado." />;
  }

  if (data.migrationRequired) {
    return (
      <EmptyState text="Falta aplicar la migración pricing_alerts en Supabase. El catálogo diario sigue funcionando, pero todavía no puede guardar alertas." />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[#eadbd3] bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-[#eadbd3] px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#df2e38]">
              Actualización diaria
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-[#171717] sm:text-2xl">
              Alertas para decidir
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#667789]">
              Señales del último catálogo. Una alerta no aplica cambios de precio automáticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAlerts()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] hover:border-[#275fbd] hover:text-[#275fbd]"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar vista
          </button>
        </header>

        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <SummaryButton label="Activas" value={summary.active} active={filter === "active"} tone="neutral" onClick={() => setFilter("active")} />
          <SummaryButton label="Nuevas" value={summary.new} active={filter === "new"} tone="warning" onClick={() => setFilter("new")} />
          <SummaryButton label="Críticas" value={summary.critical} active={filter === "critical"} tone="danger" onClick={() => setFilter("critical")} />
          <SummaryButton label="Precios" value={summary.pricing} active={filter === "pricing"} tone="warning" onClick={() => setFilter("pricing")} />
          <SummaryButton label="Fuentes" value={summary.sources} active={filter === "sources"} tone="neutral" onClick={() => setFilter("sources")} />
          <SummaryButton label="Oportunidades" value={summary.opportunities} active={filter === "opportunities"} tone="info" onClick={() => setFilter("opportunities")} />
          <SummaryButton label="Resueltas" value={summary.resolved} active={filter === "resolved"} tone="success" onClick={() => setFilter("resolved")} />
        </div>

        <div className="border-t border-[#e5e9ef] p-4">
          <label className="relative block max-w-2xl">
            <span className="sr-only">Buscar dentro de las alertas</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a96a3]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar producto, categoría o fuente"
              className="h-10 w-full rounded-md border border-[#d9dee7] pl-9 pr-3 text-sm outline-none focus:border-[#275fbd]"
            />
          </label>
        </div>

        <AlertRows
          alerts={visibleAlerts}
          updatingId={updatingId}
          onUpdateStatus={updateStatus}
        />
      </section>

      {error ? (
        <div role="alert" className="rounded-md border border-[#f1b3ad] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function AlertRows({
  alerts,
  updatingId,
  onUpdateStatus,
}: {
  alerts: PersistedPricingAlert[];
  updatingId: string | null;
  onUpdateStatus: (id: string, status: PricingAlertStatus) => Promise<void>;
}) {
  if (alerts.length === 0) {
    return <EmptyState text="No hay alertas para este filtro." compact />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-t border-[#e5e9ef] md:block">
        <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
          <thead className="sticky top-[68px] z-10 bg-[#f8fafc] text-xs uppercase text-[#667789]">
            <tr>
              <th className="px-4 py-3">Alerta</th>
              <th className="px-3 py-3">Categoría / fuente</th>
              <th className="px-3 py-3">Precio Aguiar</th>
              <th className="px-3 py-3">Referencia</th>
              <th className="px-3 py-3">Diferencia</th>
              <th className="px-3 py-3">Última detección</th>
              <th className="px-4 py-3 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-t border-[#e5e9ef] align-top">
                <td className="max-w-[360px] px-4 py-3">
                  <SeverityChip severity={alert.severity} />
                  <p className="mt-2 font-semibold text-[#171717]">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#667789]">{alert.message}</p>
                </td>
                <td className="px-3 py-3 text-[#46576a]">
                  <p className="font-medium text-[#171717]">{alert.category ?? formatAlertType(alert.type)}</p>
                  <p className="mt-1 text-xs">{getAlertSourceLabel(alert)}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatPrice(alert.ownPrice)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatPrice(alert.referencePrice)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatGap(alert.gapPercent)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-[#667789]">{formatDate(alert.lastSeenAt)}</td>
                <td className="px-4 py-3">
                  <AlertActions alert={alert} updating={updatingId === alert.id} onUpdateStatus={onUpdateStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[#e5e9ef] border-t border-[#e5e9ef] md:hidden">
        {alerts.map((alert) => (
          <article key={alert.id} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SeverityChip severity={alert.severity} />
                <h3 className="mt-2 text-sm font-bold leading-5 text-[#171717]">{alert.title}</h3>
              </div>
              <StatusChip status={alert.status} />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#667789]">{alert.message}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Metric label="Aguiar" value={formatPrice(alert.ownPrice)} />
              <Metric label="Referencia" value={formatPrice(alert.referencePrice)} />
              <Metric label="Diferencia" value={formatGap(alert.gapPercent)} />
              <Metric label="Detectada" value={formatDate(alert.lastSeenAt)} />
            </dl>
            <div className="mt-3">
              <AlertActions alert={alert} updating={updatingId === alert.id} onUpdateStatus={onUpdateStatus} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function AlertActions({
  alert,
  updating,
  onUpdateStatus,
}: {
  alert: PersistedPricingAlert;
  updating: boolean;
  onUpdateStatus: (id: string, status: PricingAlertStatus) => Promise<void>;
}) {
  if (updating) {
    return <Loader2 className="ml-auto h-4 w-4 animate-spin text-[#667789]" />;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {alert.status === "new" ? (
        <button type="button" onClick={() => void onUpdateStatus(alert.id, "reviewed")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d9dee7] px-2.5 text-xs font-semibold text-[#46576a] hover:border-[#275fbd] hover:text-[#275fbd]">
          <Check className="h-3.5 w-3.5" /> Revisada
        </button>
      ) : null}
      {alert.status !== "resolved" ? (
        <button type="button" onClick={() => void onUpdateStatus(alert.id, "resolved")} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#171717] px-2.5 text-xs font-semibold text-white hover:bg-[#343434]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
        </button>
      ) : (
        <button type="button" onClick={() => void onUpdateStatus(alert.id, "new")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d9dee7] px-2.5 text-xs font-semibold text-[#46576a] hover:border-[#275fbd] hover:text-[#275fbd]">
          <RotateCcw className="h-3.5 w-3.5" /> Reabrir
        </button>
      )}
    </div>
  );
}

function SummaryButton({ label, value, active, tone, onClick }: { label: string; value: number; active: boolean; tone: "danger" | "warning" | "success" | "info" | "neutral"; onClick: () => void }) {
  const toneClass = {
    danger: "text-[#a52920]",
    warning: "text-[#9a5b00]",
    success: "text-[#16613c]",
    info: "text-[#1f5aa6]",
    neutral: "text-[#171717]",
  }[tone];

  return (
    <button type="button" onClick={onClick} className={`min-h-16 rounded-md border px-3 py-2 text-left transition ${active ? "border-[#275fbd] bg-[#eef5ff]" : "border-[#e1e6ed] bg-white hover:border-[#aebbd0]"}`}>
      <span className="block text-xs font-semibold text-[#667789]">{label}</span>
      <span className={`mt-1 block text-xl font-extrabold ${toneClass}`}>{value}</span>
    </button>
  );
}

function SeverityChip({ severity }: { severity: PersistedPricingAlert["severity"] }) {
  const config = severity === "critical"
    ? { label: "Crítica", className: "bg-[#fff0ee] text-[#a52920]", Icon: CircleAlert }
    : severity === "warning"
      ? { label: "Revisar", className: "bg-[#fff6df] text-[#8a5500]", Icon: Clock3 }
      : { label: "Oportunidad", className: "bg-[#eef5ff] text-[#1f5aa6]", Icon: TrendingUp };

  return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold uppercase ${config.className}`}><config.Icon className="h-3.5 w-3.5" />{config.label}</span>;
}

function StatusChip({ status }: { status: PricingAlertStatus }) {
  const label = status === "new" ? "Nueva" : status === "reviewed" ? "Revisada" : "Resuelta";
  return <span className="shrink-0 rounded bg-[#f1f4f8] px-2 py-1 text-[10px] font-bold uppercase text-[#5f6b7a]">{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[#7a8795]">{label}</dt><dd className="mt-0.5 font-semibold text-[#171717]">{value}</dd></div>;
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center px-4 text-center text-sm text-[#667789] ${compact ? "min-h-36 border-t border-[#e5e9ef]" : "min-h-56 rounded-md border border-dashed border-[#ccd5e2] bg-white"}`}><Store className="mb-2 h-6 w-6 text-[#8a96a3]" />{text}</div>;
}

function buildSummary(alerts: PersistedPricingAlert[]) {
  const active = alerts.filter((alert) => alert.status !== "resolved");
  return {
    active: active.length,
    new: active.filter((alert) => alert.status === "new").length,
    critical: active.filter((alert) => alert.severity === "critical").length,
    pricing: active.filter((alert) => alert.type === "price_above_wholesale" || alert.type === "retail_below_wholesale").length,
    sources: active.filter((alert) => alert.type === "source_unavailable" || alert.type === "catalog_stale").length,
    opportunities: active.filter((alert) => alert.type === "margin_opportunity").length,
    resolved: alerts.filter((alert) => alert.status === "resolved").length,
  };
}

function filterAlerts(alerts: PersistedPricingAlert[], filter: AlertViewFilter, searchTerm: string) {
  const normalizedSearch = normalizeText(searchTerm);
  return alerts
    .filter((alert) => {
      if (filter === "active") return alert.status !== "resolved";
      if (filter === "new") return alert.status === "new";
      if (filter === "critical") return alert.status !== "resolved" && alert.severity === "critical";
      if (filter === "pricing") return alert.status !== "resolved" && ["price_above_wholesale", "retail_below_wholesale"].includes(alert.type);
      if (filter === "sources") return alert.status !== "resolved" && ["source_unavailable", "catalog_stale"].includes(alert.type);
      if (filter === "opportunities") return alert.status !== "resolved" && alert.type === "margin_opportunity";
      return alert.status === "resolved";
    })
    .filter((alert) => !normalizedSearch || normalizeText([alert.title, alert.message, alert.category, getAlertSourceLabel(alert)].join(" ")).includes(normalizedSearch))
    .sort((first, second) => getSeverityRank(first) - getSeverityRank(second) || new Date(second.lastSeenAt).getTime() - new Date(first.lastSeenAt).getTime());
}

function getSeverityRank(alert: PersistedPricingAlert) {
  return alert.severity === "critical" ? 0 : alert.severity === "warning" ? 1 : 2;
}

function getAlertSourceLabel(alert: PersistedPricingAlert) {
  const winner = alert.metadata.winner;
  return typeof winner === "string" ? winner : alert.sourceId ?? "Catálogo";
}

function formatAlertType(type: PersistedPricingAlert["type"]) {
  if (type === "source_unavailable") return "Cobertura de fuentes";
  if (type === "catalog_stale") return "Vigencia del catálogo";
  if (type === "missing_own_price") return "Sin precio propio";
  return "Comparación de precios";
}

function formatPrice(value: number | null) {
  return value === null ? "-" : currencyFormatter.format(value);
}

function formatGap(value: number | null) {
  if (value === null) return "-";
  return value > 0 ? `Aguiar +${percentFormatter.format(value)}%` : `Aguiar ${percentFormatter.format(value)}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
