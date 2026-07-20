"use client";

import {
  AlertTriangle,
  CircleCheck,
  Download,
  Archive,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  analyzeHistoryItem,
  filterHistoryAnalyses,
  getHistoryComparablePrice,
  historyDecisionToneClassName,
  summarizeHistoryItems,
  type HistoryDecisionFilter,
  type HistoryItemAnalysis,
} from "@/lib/price-list-history-analysis";
import {
  compareSourcePriority,
  getSourceDisplayName,
} from "@/lib/source-priority";
import type {
  PriceListRunDetail,
  PriceListSourcePrice,
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

export function PriceHistoryDecisionPanel({
  detail,
  isArchiving = false,
  onArchive,
}: {
  detail: PriceListRunDetail;
  isArchiving?: boolean;
  onArchive?: () => void;
}) {
  const [filter, setFilter] = useState<HistoryDecisionFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rubro, setRubro] = useState("all");
  const [subrubro, setSubrubro] = useState("all");
  const analyses = useMemo(
    () => detail.items.map(analyzeHistoryItem),
    [detail.items],
  );
  const summary = useMemo(() => summarizeHistoryItems(analyses), [analyses]);
  const isLegacyWithoutOwnPrices = useMemo(
    () =>
      detail.items.length > 0 &&
      detail.items.every(
        (item) => item.ownPriceSnapshotStatus === "not_stored_legacy",
      ),
    [detail.items],
  );
  const rubros = useMemo(
    () => uniqueValues(detail.items.map((item) => item.rubro)),
    [detail.items],
  );
  const subrubros = useMemo(
    () =>
      uniqueValues(
        detail.items
          .filter((item) => rubro === "all" || item.rubro === rubro)
          .map((item) => item.subrubro ?? item.segment),
      ),
    [detail.items, rubro],
  );
  const visibleAnalyses = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return filterHistoryAnalyses(analyses, filter)
      .filter(
        (analysis) => rubro === "all" || analysis.item.rubro === rubro,
      )
      .filter(
        (analysis) =>
          subrubro === "all" ||
          analysis.item.subrubro === subrubro ||
          analysis.item.segment === subrubro,
      )
      .filter((analysis) => {
        if (!normalizedSearch) {
          return true;
        }

        return [
          analysis.item.description,
          analysis.item.code,
          analysis.item.ean13Di,
          analysis.item.ean13Bu,
          analysis.item.rubro,
          analysis.item.subrubro,
          analysis.item.segment,
        ]
          .filter(Boolean)
          .some((value) => normalizeText(String(value)).includes(normalizedSearch));
      })
      .sort(compareHistoryAnalyses);
  }, [analyses, filter, rubro, searchTerm, subrubro]);

  function handleRubroChange(value: string) {
    setRubro(value);
    setSubrubro("all");
  }

  return (
    <div className="min-w-0">
      <header className="border-b border-[#d9dee7] bg-white px-4 py-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-extrabold text-[#17202a]">
              {formatRunTitle(detail)}
            </h3>
            <p className="mt-1 text-sm text-[#667789]">
              Guardada {formatDate(detail.run.createdAt)} · {isLegacyWithoutOwnPrices
                ? "Carga anterior sin detalle propio almacenado."
                : "Excel y Tokin se conservan como referencias separadas."}
            </p>
          </div>
          <div className={`grid gap-2 ${isLegacyWithoutOwnPrices ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <button
              type="button"
              onClick={() => downloadRunResultCsv(detail, analyses)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd]"
            >
              <Download className="h-4 w-4" />
              Resultado
            </button>
            <button
              type="button"
              onClick={() => downloadRunAguiarCsv(detail, analyses)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#275fbd] bg-[#f5f8ff] px-3 text-sm font-semibold text-[#173e83] transition hover:bg-[#eaf2ff]"
            >
              <Download className="h-4 w-4" />
              Aguiar
            </button>
            {isLegacyWithoutOwnPrices && onArchive ? (
              <button
                type="button"
                disabled={isArchiving}
                onClick={onArchive}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#e4a79f] bg-[#fff8f6] px-3 text-sm font-semibold text-[#8f2d20] transition hover:bg-[#fff1ef] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isArchiving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Archivar anterior
              </button>
            ) : null}
          </div>
        </div>

        {isLegacyWithoutOwnPrices ? (
          <div
            role="status"
            className="mt-4 rounded-md border border-[#f0d2a2] bg-[#fff8e8] px-3 py-3 text-sm text-[#704907]"
          >
            Esta carga se guardó con el formato anterior: conserva las
            comparaciones de mercado, pero no los precios Excel/Tokin. Para
            comparar datos propios, generá y guardá una nueva carga desde
            Importación.
          </div>
        ) : null}

        <section aria-label="Semáforo de precios" className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-[#17202a]">Cosas para ver</h4>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-xs font-semibold text-[#153d7b] hover:underline"
            >
              Ver todos ({summary.total})
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <SignalButton
              label="Revisar"
              value={summary.attention}
              helper="Decisión pendiente"
              tone="danger"
              isActive={filter === "attention"}
              onClick={() => setFilter("attention")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <SignalButton
              label="Mayorista más barato"
              value={summary.aboveWholesale}
              helper="Precio propio arriba"
              tone="warning"
              isActive={filter === "above_wholesale"}
              onClick={() => setFilter("above_wholesale")}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <SignalButton
              label="Competitivos"
              value={summary.competitive}
              helper="En rango mayorista"
              tone="success"
              isActive={filter === "competitive"}
              onClick={() => setFilter("competitive")}
              icon={<CircleCheck className="h-4 w-4" />}
            />
            <SignalButton
              label="Precio propio mejor"
              value={summary.opportunities}
              helper="Posible margen"
              tone="info"
              isActive={filter === "opportunity"}
              onClick={() => setFilter("opportunity")}
              icon={<TrendingDown className="h-4 w-4" />}
            />
            <SignalButton
              label={
                isLegacyWithoutOwnPrices ? "Propio no guardado" : "Falta propio"
              }
              value={summary.missingOwn}
              helper={
                isLegacyWithoutOwnPrices
                  ? "Carga con formato anterior"
                  : "Excel y Tokin vacíos"
              }
              tone="neutral"
              isActive={filter === "missing_own"}
              onClick={() => setFilter("missing_own")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <SignalButton
              label="Sin mayorista"
              value={summary.withoutWholesale}
              helper="Referencia insuficiente"
              tone="neutral"
              isActive={filter === "without_wholesale"}
              onClick={() => setFilter("without_wholesale")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>
        </section>
      </header>

      <section className="border-b border-[#d9dee7] bg-[#f8fafc] px-4 py-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
          <label className="relative">
            <span className="sr-only">Buscar dentro de la carga</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a96a3]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar artículo, código o EAN"
              className="h-10 w-full rounded-md border border-[#cfd8e3] bg-white pl-9 pr-3 text-sm text-[#17202a] outline-none focus:border-[#153d7b]"
            />
          </label>
          <FilterSelect
            label="Rubro"
            value={rubro}
            onChange={handleRubroChange}
            options={rubros}
          />
          <FilterSelect
            label="Subrubro"
            value={subrubro}
            onChange={setSubrubro}
            options={subrubros}
          />
          <div className="flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-white px-3 text-sm font-semibold text-[#526170]">
            {visibleAnalyses.length} artículos
          </div>
        </div>
      </section>

      {visibleAnalyses.length === 0 ? (
        <div className="bg-white px-4 py-10 text-center text-sm text-[#667789]">
          No hay artículos para los filtros seleccionados.
        </div>
      ) : (
        <>
          <HistoryDecisionTable analyses={visibleAnalyses} />
          <HistoryDecisionCards analyses={visibleAnalyses} />
        </>
      )}

      <SourceCoverage detail={detail} />
    </div>
  );
}

function SignalButton({
  label,
  value,
  helper,
  tone,
  isActive,
  onClick,
  icon,
}: {
  label: string;
  value: number;
  helper: string;
  tone: "danger" | "warning" | "success" | "info" | "neutral";
  isActive: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  const toneClasses = {
    danger: "border-[#f1b3ad] bg-[#fff1ef] text-[#8f2d20]",
    warning: "border-[#f0d2a2] bg-[#fff8e8] text-[#8a5a0a]",
    success: "border-[#bfe5cf] bg-[#f4fbf7] text-[#16613c]",
    info: "border-[#bed4f4] bg-[#f5f8ff] text-[#153d7b]",
    neutral: "border-[#d9dee7] bg-[#f8fafc] text-[#526170]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`rounded-md border px-3 py-3 text-left transition ${toneClasses[tone]} ${
        isActive ? "ring-2 ring-[#153d7b] ring-offset-1" : "hover:border-[#153d7b]"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.04em]">
          {label}
        </span>
        {icon}
      </span>
      <span className="mt-1 block text-2xl font-extrabold text-[#17202a]">
        {value}
      </span>
      <span className="mt-1 block text-xs text-[#667789]">{helper}</span>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md border border-[#cfd8e3] bg-white px-3 text-xs font-semibold text-[#667789]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#17202a] outline-none"
      >
        <option value="all">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function HistoryDecisionTable({
  analyses,
}: {
  analyses: HistoryItemAnalysis[];
}) {
  return (
    <div className="hidden max-h-[720px] overflow-auto bg-white xl:block">
      <table className="w-full min-w-[1380px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#edf1f5] uppercase tracking-[0.04em] text-[#526170]">
          <tr>
            <th className="px-3 py-3">Artículo</th>
            <th className="px-3 py-3">Excel</th>
            <th className="px-3 py-3">Tokin</th>
            <th className="px-3 py-3">Precio usado</th>
            <th className="px-3 py-3">Mejor mayorista</th>
            <th className="px-3 py-3">Mejor minorista</th>
            <th className="px-3 py-3">Dif. vs mayorista</th>
            <th className="px-3 py-3">Lectura</th>
            <th className="px-3 py-3">Fuentes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e9ef]">
          {analyses.map((analysis) => (
            <tr key={analysis.item.id} className="align-top hover:bg-[#fffdfa]">
              <td className="max-w-[300px] px-3 py-3">
                <div className="font-semibold leading-5 text-[#17202a]">
                  {analysis.item.description || "Sin descripción"}
                </div>
                <div className="mt-1 text-[#667789]">
                  {formatHierarchy(analysis)}
                </div>
                <div className="mt-1 text-[#8a96a3]">
                  {analysis.item.code || analysis.item.ean13Di || "Sin código"}
                </div>
              </td>
              <PriceValue
                value={analysis.excelPrice}
                missingLabel={
                  analysis.ownPriceWasStored ? "-" : "No guardado"
                }
              />
              <PriceValue
                value={analysis.tokinPrice}
                emphasize
                missingLabel={
                  analysis.ownPriceWasStored ? "-" : "No guardado"
                }
              />
              <td className="px-3 py-3">
                <div className="font-bold text-[#17202a]">
                  {formatCurrency(analysis.selectedOwnPrice)}
                </div>
                <div className="mt-1 text-[#667789]">
                  {analysis.selectedOwnPriceLabel}
                </div>
              </td>
              <MarketPriceCell price={analysis.bestWholesale} />
              <MarketPriceCell price={analysis.bestRetail} />
              <td className="px-3 py-3">
                <span className={gapClassName(analysis)}>
                  {formatGap(analysis.gapRatio)}
                </span>
              </td>
              <td className="max-w-[230px] px-3 py-3">
                <span
                  className={`inline-flex rounded border px-2 py-1 text-[11px] font-bold ${historyDecisionToneClassName(
                    analysis.tone,
                  )}`}
                >
                  {analysis.label}
                </span>
                <div className="mt-2 font-semibold text-[#17202a]">
                  {analysis.action}
                </div>
                <div className="mt-1 leading-4 text-[#667789]">
                  {analysis.helper}
                </div>
              </td>
              <td className="max-w-[260px] px-3 py-3">
                <SourcePriceDetails analysis={analysis} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryDecisionCards({
  analyses,
}: {
  analyses: HistoryItemAnalysis[];
}) {
  return (
    <div className="grid gap-3 bg-white p-3 xl:hidden">
      {analyses.map((analysis) => (
        <article
          key={`${analysis.item.id}-card`}
          className="rounded-md border border-[#d9dee7] bg-white p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="font-bold leading-5 text-[#17202a]">
                {analysis.item.description || "Sin descripción"}
              </h4>
              <p className="mt-1 text-xs text-[#667789]">
                {formatHierarchy(analysis)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded border px-2 py-1 text-[10px] font-bold ${historyDecisionToneClassName(
                analysis.tone,
              )}`}
            >
              {analysis.label}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MobilePrice
              label="Excel"
              value={analysis.excelPrice}
              missingLabel={analysis.ownPriceWasStored ? "-" : "No guardado"}
            />
            <MobilePrice
              label="Tokin"
              value={analysis.tokinPrice}
              missingLabel={analysis.ownPriceWasStored ? "-" : "No guardado"}
            />
            <MobilePrice
              label={`Usado · ${analysis.selectedOwnPriceLabel}`}
              value={analysis.selectedOwnPrice}
            />
            <MobilePrice
              label={`Mayorista · ${analysis.bestWholesale?.storeName ?? "-"}`}
              value={getHistoryComparablePrice(analysis.bestWholesale)}
            />
            <MobilePrice
              label={`Minorista · ${analysis.bestRetail?.storeName ?? "-"}`}
              value={getHistoryComparablePrice(analysis.bestRetail)}
            />
            <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2">
              <div className="text-[10px] font-bold uppercase text-[#667789]">
                Diferencia
              </div>
              <div className="mt-1 font-extrabold text-[#17202a]">
                {formatGap(analysis.gapRatio)}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-md bg-[#f8fafc] px-3 py-2 text-sm">
            <div className="font-bold text-[#17202a]">{analysis.action}</div>
            <div className="mt-1 text-xs leading-4 text-[#667789]">
              {analysis.helper}
            </div>
          </div>
          <div className="mt-3">
            <SourcePriceDetails analysis={analysis} />
          </div>
        </article>
      ))}
    </div>
  );
}

function PriceValue({
  value,
  emphasize = false,
  missingLabel = "-",
}: {
  value: number | null;
  emphasize?: boolean;
  missingLabel?: string;
}) {
  return (
    <td className={`px-3 py-3 font-semibold ${emphasize ? "text-[#153d7b]" : "text-[#526170]"}`}>
      {value === null ? missingLabel : formatCurrency(value)}
    </td>
  );
}

function MarketPriceCell({ price }: { price: PriceListSourcePrice | null }) {
  return (
    <td className="max-w-[200px] px-3 py-3">
      <div className="font-bold text-[#173d2f]">
        {formatCurrency(getHistoryComparablePrice(price))}
      </div>
      <div className="mt-1 line-clamp-2 text-[#667789]">
        {price?.storeName ?? "Sin referencia"}
      </div>
    </td>
  );
}

function MobilePrice({
  label,
  value,
  missingLabel = "-",
}: {
  label: string;
  value: number | null;
  missingLabel?: string;
}) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2">
      <div className="line-clamp-2 text-[10px] font-bold uppercase text-[#667789]">
        {label}
      </div>
      <div className="mt-1 font-extrabold text-[#17202a]">
        {value === null ? missingLabel : formatCurrency(value)}
      </div>
    </div>
  );
}

function SourcePriceDetails({ analysis }: { analysis: HistoryItemAnalysis }) {
  const prices = [...analysis.item.sourcePrices].sort((first, second) => {
    if (first.storeType !== second.storeType) {
      return first.storeType === "mayorista" ? -1 : 1;
    }

    return (
      (getHistoryComparablePrice(first) ?? Infinity) -
      (getHistoryComparablePrice(second) ?? Infinity)
    );
  });

  return (
    <details className="rounded-md border border-[#d9dee7] bg-white px-2 py-2">
      <summary className="cursor-pointer text-xs font-bold text-[#153d7b]">
        Ver {prices.length} precios
      </summary>
      <div className="mt-2 max-h-56 space-y-2 overflow-auto">
        {prices.length === 0 ? (
          <div className="text-xs text-[#667789]">Sin comparaciones guardadas.</div>
        ) : (
          prices.map((price) => (
            <div
              key={`${price.sourceId}-${price.productName}`}
              className="border-b border-[#e5e9ef] pb-2 text-xs last:border-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-[#17202a]">
                  {price.storeName}
                </div>
                <span className="shrink-0 text-[#667789]">{price.storeType}</span>
              </div>
              <div className="mt-1 font-bold text-[#173d2f]">
                {formatCurrency(getHistoryComparablePrice(price))}
              </div>
              <div className="mt-1 line-clamp-2 text-[#667789]">
                {price.productName}
              </div>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function SourceCoverage({ detail }: { detail: PriceListRunDetail }) {
  const sortedSources = [...detail.sources].sort((first, second) => {
    if (first.storeType !== second.storeType) {
      return first.storeType === "mayorista" ? -1 : 1;
    }

    if (Boolean(first.resultsCount) !== Boolean(second.resultsCount)) {
      return first.resultsCount > 0 ? -1 : 1;
    }

    return compareSourcePriority(first, second);
  });

  return (
    <details className="border-t border-[#d9dee7] bg-[#f8fafc] px-4 py-3">
      <summary className="cursor-pointer text-sm font-bold text-[#17202a]">
        Fuentes de esta carga ({detail.sources.length})
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {sortedSources.map((source) => (
          <div
            key={source.sourceId}
            className="rounded-md border border-[#d9dee7] bg-white px-3 py-2 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-[#17202a]">
                {getSourceDisplayName(source)}
              </span>
              <span className="text-xs text-[#667789]">{source.storeType}</span>
            </div>
            <div className="mt-1 text-xs text-[#667789]">
              {source.resultsCount} resultados · {source.status}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function compareHistoryAnalyses(
  first: HistoryItemAnalysis,
  second: HistoryItemAnalysis,
) {
  const rank = {
    above_wholesale_critical: 0,
    above_wholesale_warning: 1,
    weak_match: 2,
    missing_own_price: 3,
    no_reference: 4,
    retail_only: 5,
    competitive: 6,
    margin_opportunity: 7,
  } as const;
  const rankDifference = rank[first.kind] - rank[second.kind];

  if (rankDifference !== 0) {
    return rankDifference;
  }

  return (second.gapRatio ?? -Infinity) - (first.gapRatio ?? -Infinity);
}

function formatHierarchy(analysis: HistoryItemAnalysis) {
  return [
    analysis.item.rubro,
    analysis.item.subrubro ?? analysis.item.segment,
    analysis.item.line,
  ]
    .filter(Boolean)
    .join(" · ") || "Sin clasificación";
}

function gapClassName(analysis: HistoryItemAnalysis) {
  const base = "inline-flex rounded px-2 py-1 text-[11px] font-bold";

  if (analysis.gapRatio === null) {
    return `${base} bg-[#eef1f4] text-[#526170]`;
  }

  if (analysis.gapRatio > 0.1) {
    return `${base} bg-[#fff1ef] text-[#8f2d20]`;
  }

  if (analysis.gapRatio > 0.05) {
    return `${base} bg-[#fff8e8] text-[#8a5a0a]`;
  }

  if (analysis.gapRatio < -0.08) {
    return `${base} bg-[#eef4ff] text-[#153d7b]`;
  }

  return `${base} bg-[#e4f6ed] text-[#16613c]`;
}

function formatGap(value: number | null) {
  if (value === null) {
    return "Sin dato";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(value * 100)}% vs mayorista`;
}

function formatCurrency(value: number | null) {
  return value === null ? "-" : currencyFormatter.format(value);
}

function formatRunTitle(detail: PriceListRunDetail) {
  return detail.run.weekStart
    ? `Semana ${formatShortDate(detail.run.weekStart)}`
    : detail.run.listName;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  ).sort((first, second) => first.localeCompare(second, "es"));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function downloadRunResultCsv(
  detail: PriceListRunDetail,
  analyses: HistoryItemAnalysis[],
) {
  const headers = [
    "Rubro",
    "Subrubro",
    "Linea",
    "Descripcion",
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Precio Excel",
    "Precio Tokin/Arcor",
    "Precio propio usado",
    "Origen precio propio",
    "Mejor mayorista",
    "Fuente mayorista",
    "Mejor minorista",
    "Fuente minorista",
    "Diferencia vs mayorista %",
    "Estado",
    "Accion",
  ];
  const rows = analyses.map((analysis) => [
    analysis.item.rubro ?? "",
    analysis.item.subrubro ?? analysis.item.segment ?? "",
    analysis.item.line ?? "",
    analysis.item.description ?? "",
    analysis.item.code ?? "",
    analysis.item.ean13Di ?? "",
    analysis.item.ean13Bu ?? "",
    csvAmount(analysis.excelPrice),
    csvAmount(analysis.tokinPrice),
    csvAmount(analysis.selectedOwnPrice),
    analysis.selectedOwnPriceLabel,
    csvAmount(getHistoryComparablePrice(analysis.bestWholesale)),
    analysis.bestWholesale?.storeName ?? "",
    csvAmount(getHistoryComparablePrice(analysis.bestRetail)),
    analysis.bestRetail?.storeName ?? "",
    analysis.gapRatio === null ? "" : (analysis.gapRatio * 100).toFixed(2),
    analysis.label,
    analysis.action,
  ]);

  downloadCsv(
    `historial-${detail.run.weekStart ?? detail.run.id}.csv`,
    [headers, ...rows],
  );
}

function downloadRunAguiarCsv(
  detail: PriceListRunDetail,
  analyses: HistoryItemAnalysis[],
) {
  const headers = [
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Descripcion",
    "Precio Tokin/Arcor",
    "Precio Excel",
    "Precio sugerido",
    "Accion",
  ];
  const rows = analyses.map((analysis) => [
    analysis.item.code ?? "",
    analysis.item.ean13Di ?? "",
    analysis.item.ean13Bu ?? "",
    analysis.item.description ?? "",
    csvAmount(analysis.tokinPrice),
    csvAmount(analysis.excelPrice),
    csvAmount(analysis.item.suggestedPrice),
    analysis.action,
  ]);

  downloadCsv(`aguiar-${detail.run.weekStart ?? detail.run.id}.csv`, [
    headers,
    ...rows,
  ]);
}

function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number) {
  const stringValue = String(value);

  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function csvAmount(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}
