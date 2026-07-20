"use client";

import {
  Check,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPricingReviewDashboard,
  filterPricingReviewItems,
  type MatchReviewCandidate,
  type PricingReviewFilter,
  type PricingReviewItem,
} from "@/lib/price-list-review";
import { getHistoryComparablePrice } from "@/lib/price-list-history-analysis";
import type {
  PriceListReviewResponse,
  ProductMatchOverride,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function PricingReviewDashboard() {
  const [data, setData] = useState<PriceListReviewResponse | null>(null);
  const [filter, setFilter] = useState<PricingReviewFilter>("attention");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/price-list/review", {
        cache: "no-store",
      });
      const payload = (await response.json()) as PriceListReviewResponse;

      if (!response.ok || payload.errorMessage) {
        throw new Error(payload.errorMessage ?? "No se pudo cargar el tablero.");
      }

      setData(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar el tablero.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const dashboard = useMemo(() => {
    if (!data?.currentDetail) return null;
    return buildPricingReviewDashboard(
      data.currentDetail,
      data.previousDetail,
      data.overrides,
    );
  }, [data]);
  const visibleItems = useMemo(
    () =>
      dashboard
        ? filterPricingReviewItems(dashboard.items, filter, searchTerm)
        : [],
    [dashboard, filter, searchTerm],
  );

  async function saveOverride(
    candidate: MatchReviewCandidate,
    status: ProductMatchOverride["status"],
  ) {
    setSavingKey(candidate.key);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/match-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: {
            rowNumber: candidate.item.rowNumber,
            description: candidate.item.description,
            rubro: candidate.item.rubro,
            code: candidate.item.code,
            ean13Di: candidate.item.ean13Di,
            ean13Bu: candidate.item.ean13Bu,
          },
          candidate: {
            sourceId: candidate.sourceId,
            storeName: candidate.storeName,
            productName: candidate.productName,
            productUrl: candidate.productUrl,
          },
          status,
        }),
      });
      const payload = (await response.json()) as {
        saved?: boolean;
        errorMessage?: string;
      };

      if (!response.ok || !payload.saved) {
        throw new Error(
          payload.errorMessage ?? "No se pudo guardar la equivalencia.",
        );
      }

      setMessage(
        status === "confirmed"
          ? "Equivalencia confirmada. Se reutilizará en la próxima importación."
          : "Candidato rechazado. No se reutilizará para este artículo.",
      );
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la equivalencia.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!data?.enabled) {
    return <EmptyState text="El tablero estará disponible cuando Supabase esté configurado." />;
  }

  if (!dashboard || !data.currentDetail) {
    return (
      <EmptyState text="Guardá una carga nueva desde Importación para generar el tablero de decisiones." />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[#eadbd3] bg-white shadow-sm">
        <header className="flex flex-col justify-between gap-3 border-b border-[#eadbd3] px-4 py-4 sm:px-5 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase text-[#df2e38]">
              Última carga comparable
            </p>
            <h1 className="mt-1 text-xl font-extrabold text-[#171717] sm:text-2xl">
              Cosas para revisar
            </h1>
            <p className="mt-1 text-sm text-[#667789]">
              {formatRunDate(data.currentDetail.run.createdAt)}
              {data.previousDetail
                ? ` · comparada con ${formatRunDate(data.previousDetail.run.createdAt)}`
                : " · todavía sin una semana anterior comparable"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] hover:border-[#275fbd] hover:text-[#275fbd]"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </header>

        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <SummaryButton label="Revisar" value={dashboard.summary.attention} active={filter === "attention"} onClick={() => setFilter("attention")} tone="danger" />
          <SummaryButton label="Más caros que mayorista" value={dashboard.summary.aboveWholesale} active={filter === "above_wholesale"} onClick={() => setFilter("above_wholesale")} tone="warning" />
          <SummaryButton label="Competitivos" value={dashboard.summary.competitive} active={filter === "competitive"} onClick={() => setFilter("competitive")} tone="success" />
          <SummaryButton label="Oportunidad de margen" value={dashboard.summary.opportunities} active={filter === "opportunity"} onClick={() => setFilter("opportunity")} tone="info" />
          <SummaryButton label="Variación semanal" value={dashboard.summary.weeklyChanges} active={filter === "weekly_change"} onClick={() => setFilter("weekly_change")} tone="warning" />
          <SummaryButton label="Sin precio propio" value={dashboard.summary.missingOwn} active={filter === "missing_own"} onClick={() => setFilter("missing_own")} tone="neutral" />
          <SummaryButton label="Sin mayorista" value={dashboard.summary.withoutWholesale} active={filter === "without_wholesale"} onClick={() => setFilter("without_wholesale")} tone="neutral" />
          <SummaryButton label="Match dudoso" value={dashboard.summary.weakMatch} active={filter === "weak_match"} onClick={() => setFilter("weak_match")} tone="neutral" />
          <SummaryButton label="Todos" value={dashboard.summary.total} active={filter === "all"} onClick={() => setFilter("all")} tone="neutral" />
        </div>

        <div className="border-t border-[#e5e9ef] p-4">
          <label className="relative block max-w-xl">
            <span className="sr-only">Buscar artículo dentro del tablero</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a96a3]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por artículo, código o EAN"
              className="h-10 w-full rounded-md border border-[#d9dee7] pl-9 pr-3 text-sm outline-none focus:border-[#275fbd]"
            />
          </label>
        </div>

        <DecisionRows items={visibleItems} />
      </section>

      {message ? (
        <div role="status" className="rounded-md border border-[#bfe5cf] bg-[#f4fbf7] px-4 py-3 text-sm text-[#16613c]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-md border border-[#f1b3ad] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
          {error}
        </div>
      ) : null}

      <EquivalenceQueue
        candidates={dashboard.equivalences}
        migrationRequired={data.migrationRequired === true}
        savingKey={savingKey}
        onSave={saveOverride}
      />
    </div>
  );
}

function DecisionRows({ items }: { items: PricingReviewItem[] }) {
  if (items.length === 0) {
    return <EmptyState text="No hay artículos para este filtro." compact />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto border-t border-[#e5e9ef] md:block">
        <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
          <thead className="sticky top-[68px] z-10 bg-[#f8fafc] text-xs uppercase text-[#667789]">
            <tr>
              <th className="px-4 py-3">Artículo</th>
              <th className="px-3 py-3">Precio propio</th>
              <th className="px-3 py-3">Mejor mayorista</th>
              <th className="px-3 py-3">Dif. vs mayorista</th>
              <th className="px-3 py-3">Variación semanal</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.analysis.item.id} className="border-t border-[#e5e9ef] align-top">
                <td className="max-w-[320px] px-4 py-3">
                  <p className="font-semibold text-[#17202a]">{item.analysis.item.description ?? "Sin descripción"}</p>
                  <p className="mt-1 text-xs text-[#667789]">{item.analysis.item.code ?? item.analysis.item.ean13Di ?? "Sin código"}</p>
                </td>
                <td className="px-3 py-3 font-semibold text-[#17202a]">{formatPrice(item.analysis.selectedOwnPrice)}</td>
                <td className="px-3 py-3">
                  <p className="font-semibold text-[#17202a]">{formatPrice(getHistoryComparablePrice(item.analysis.bestWholesale))}</p>
                  <p className="mt-1 text-xs text-[#667789]">{item.analysis.bestWholesale?.storeName ?? "Sin referencia"}</p>
                </td>
                <td className="px-3 py-3">{formatPercent(item.analysis.gapRatio)}</td>
                <td className="px-3 py-3">{formatWeeklyVariation(item)}</td>
                <td className="px-4 py-3">
                  <span className={decisionClassName(item.analysis.tone)}>{item.analysis.action}</span>
                  <p className="mt-1 max-w-[280px] text-xs leading-5 text-[#667789]">{item.analysis.helper}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 border-t border-[#e5e9ef] p-3 md:hidden">
        {items.map((item) => (
          <article key={item.analysis.item.id} className="rounded-md border border-[#d9dee7] bg-white p-3">
            <h3 className="text-sm font-semibold text-[#17202a]">{item.analysis.item.description ?? "Sin descripción"}</h3>
            <p className="mt-1 text-xs text-[#667789]">{item.analysis.item.code ?? item.analysis.item.ean13Di ?? "Sin código"}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <PriceMetric label="Propio" value={formatPrice(item.analysis.selectedOwnPrice)} />
              <PriceMetric label="Mayorista" value={formatPrice(getHistoryComparablePrice(item.analysis.bestWholesale))} />
              <PriceMetric label="Diferencia" value={formatPercent(item.analysis.gapRatio)} />
              <PriceMetric label="Semana anterior" value={formatWeeklyVariation(item)} />
            </dl>
            <div className="mt-3 border-t border-[#e5e9ef] pt-3">
              <span className={decisionClassName(item.analysis.tone)}>{item.analysis.action}</span>
              <p className="mt-2 text-xs leading-5 text-[#667789]">{item.analysis.helper}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function EquivalenceQueue({
  candidates,
  migrationRequired,
  savingKey,
  onSave,
}: {
  candidates: MatchReviewCandidate[];
  migrationRequired: boolean;
  savingKey: string | null;
  onSave: (candidate: MatchReviewCandidate, status: "confirmed" | "rejected") => Promise<void>;
}) {
  const pending = candidates.filter((candidate) => candidate.overrideStatus === null).slice(0, 40);
  const confirmed = candidates.filter((candidate) => candidate.overrideStatus === "confirmed").length;

  return (
    <section className="rounded-md border border-[#eadbd3] bg-white shadow-sm">
      <header className="border-b border-[#eadbd3] px-4 py-4 sm:px-5">
        <h2 className="text-lg font-extrabold text-[#171717]">Equivalencias a revisar</h2>
        <p className="mt-1 text-sm text-[#667789]">
          {pending.length} pendientes · {confirmed} confirmadas en esta carga. Una confirmación se reutiliza en futuras importaciones.
        </p>
      </header>

      {migrationRequired ? (
        <div className="m-4 rounded-md border border-[#f0d2a2] bg-[#fff8e8] px-4 py-3 text-sm text-[#704907]">
          Falta aplicar la migración <code>20260720193000_product_match_overrides.sql</code> en Supabase. El tablero funciona, pero todavía no puede guardar equivalencias.
        </div>
      ) : null}

      {pending.length === 0 ? (
        <EmptyState text="No hay equivalencias dudosas pendientes en la última carga." compact />
      ) : (
        <div className="grid gap-2 p-3 lg:grid-cols-2">
          {pending.map((candidate) => {
            const isSaving = savingKey === candidate.key;
            return (
              <article key={candidate.key} className="rounded-md border border-[#d9dee7] bg-[#f8fafc] p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[#667789]">Lista propia</p>
                    <p className="mt-1 text-sm font-semibold text-[#17202a]">{candidate.item.description ?? "Sin descripción"}</p>
                  </div>
                  <span aria-hidden="true" className="hidden text-[#9aa5b1] sm:block">↔</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[#667789]">{candidate.storeName}</p>
                    <p className="mt-1 text-sm font-semibold text-[#17202a]">{candidate.productName}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#667789]">Confianza {candidate.confidenceScore}% · {candidate.reason}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={migrationRequired || isSaving}
                    onClick={() => void onSave(candidate, "confirmed")}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#16613c] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirmar
                  </button>
                  <button
                    type="button"
                    disabled={migrationRequired || isSaving}
                    onClick={() => void onSave(candidate, "rejected")}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#e4a79f] bg-white px-3 text-xs font-semibold text-[#8f2d20] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Rechazar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SummaryButton({ label, value, active, onClick, tone }: { label: string; value: number; active: boolean; onClick: () => void; tone: "danger" | "warning" | "success" | "info" | "neutral" }) {
  const tones = {
    danger: "border-[#f1b3ad] bg-[#fff1ef] text-[#8f2d20]",
    warning: "border-[#f0d2a2] bg-[#fff8e8] text-[#8a5a0a]",
    success: "border-[#bfe5cf] bg-[#f4fbf7] text-[#16613c]",
    info: "border-[#bed4f4] bg-[#f5f8ff] text-[#153d7b]",
    neutral: "border-[#d9dee7] bg-[#f8fafc] text-[#526170]",
  };
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-[72px] rounded-md border px-3 py-2 text-left transition ${tones[tone]} ${active ? "ring-2 ring-[#171717]/20" : "hover:border-[#8a96a3]"}`}>
      <span className="block text-xl font-extrabold">{value}</span>
      <span className="mt-1 block text-xs font-semibold">{label}</span>
    </button>
  );
}

function PriceMetric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-[#667789]">{label}</dt><dd className="mt-1 font-semibold text-[#17202a]">{value}</dd></div>;
}

function LoadingState() {
  return <div className="flex items-center gap-2 rounded-md border border-[#eadbd3] bg-white px-4 py-8 text-sm text-[#667789]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando revisiones...</div>;
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`m-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 text-center text-sm text-[#526170] ${compact ? "py-5" : "py-10"}`}>{text}</div>;
}

function formatPrice(value: number | null) {
  return value ? currencyFormatter.format(value) : "Sin precio";
}

function formatPercent(value: number | null) {
  if (value === null) return "Sin referencia";
  return `${value > 0 ? "+" : ""}${percentFormatter.format(value * 100)}%`;
}

function formatWeeklyVariation(item: PricingReviewItem) {
  if (item.weeklyVariationRatio === null) return "Sin semana anterior";
  return `${item.weeklyVariationRatio > 0 ? "+" : ""}${percentFormatter.format(item.weeklyVariationRatio * 100)}%`;
}

function decisionClassName(tone: PricingReviewItem["analysis"]["tone"]) {
  const tones = {
    danger: "inline-flex rounded px-2 py-1 text-xs font-semibold bg-[#fff1ef] text-[#8f2d20]",
    warning: "inline-flex rounded px-2 py-1 text-xs font-semibold bg-[#fff8e8] text-[#8a5a0a]",
    success: "inline-flex rounded px-2 py-1 text-xs font-semibold bg-[#f4fbf7] text-[#16613c]",
    info: "inline-flex rounded px-2 py-1 text-xs font-semibold bg-[#f5f8ff] text-[#153d7b]",
    neutral: "inline-flex rounded px-2 py-1 text-xs font-semibold bg-[#f1f3f5] text-[#526170]",
  };
  return tones[tone];
}

function formatRunDate(value: string) {
  return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}
