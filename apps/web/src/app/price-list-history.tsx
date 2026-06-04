"use client";

import { Download, Eye, History, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  PriceListHistoryResponse,
  PriceListRunDetail,
  PriceListRunDetailResponse,
  PriceListRunSummary,
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

export function PriceListHistory() {
  const [runs, setRuns] = useState<PriceListRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PriceListRunDetail | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setIsLoadingRuns(true);
    setError(null);

    try {
      const response = await fetch("/api/price-list/history", {
        cache: "no-store",
      });
      const payload = (await response.json()) as PriceListHistoryResponse;

      if (!response.ok || payload.errorMessage) {
        throw new Error(payload.errorMessage ?? "No se pudo cargar el historial.");
      }

      setIsEnabled(payload.enabled);
      setRuns(payload.runs);

      if (payload.runs.length > 0) {
        const nextRunId =
          selectedRunId && payload.runs.some((run) => run.id === selectedRunId)
            ? selectedRunId
            : payload.runs[0].id;
        setSelectedRunId(nextRunId);
        await loadDetail(nextRunId);
      } else {
        setSelectedRunId(null);
        setDetail(null);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar el historial.",
      );
    } finally {
      setIsLoadingRuns(false);
    }
  }

  async function loadDetail(runId: string) {
    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await fetch(`/api/price-list/history/${runId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as PriceListRunDetailResponse;

      if (!response.ok || payload.errorMessage) {
        throw new Error(payload.errorMessage ?? "No se pudo cargar el detalle.");
      }

      if (!payload.detail) {
        setRuns((currentRuns) =>
          currentRuns.filter((run) => run.id !== runId),
        );
        setSelectedRunId(null);
        setDetail(null);
        return;
      }

      setSelectedRunId(runId);
      setDetail(payload.detail);
    } catch (caughtError) {
      setDetail(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar el detalle.",
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  return (
    <section
      id="historial"
      className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-[0_14px_40px_rgba(77,41,25,0.08)] sm:p-5"
    >
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-[#171717]">
            <History className="h-5 w-5 text-[#df2e38]" />
            Historial de evaluaciones
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={isLoadingRuns}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd] disabled:cursor-not-allowed disabled:text-[#a99f99] sm:w-fit"
        >
          {isLoadingRuns ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </button>
      </div>

      {!isEnabled ? (
        <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3 text-sm text-[#526170]">
          Historial disponible cuando Supabase esté configurado.
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
          {error}
        </div>
      ) : null}

      {isLoadingRuns ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-[#eadbd3] bg-[#fffdfa] px-4 py-3 text-sm text-[#6f625d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial...
        </div>
      ) : null}

      {!isLoadingRuns && isEnabled && runs.length === 0 ? (
        <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#526170]">
          Todavía no hay listas guardadas.
        </div>
      ) : null}

      {runs.length > 0 ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[320px_1fr]">
          <RunList
            runs={runs}
            selectedRunId={selectedRunId}
            onSelect={(runId) => void loadDetail(runId)}
          />

          <div className="min-w-0 rounded-md border border-[#d9dee7] bg-[#f8fafc]">
            {isLoadingDetail ? (
              <div className="flex items-center gap-2 px-4 py-5 text-sm text-[#526170]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando detalle...
              </div>
            ) : detail ? (
              <RunDetail detail={detail} />
            ) : selectedRun ? (
              <div className="px-4 py-5 text-sm text-[#526170]">
                Seleccioná una corrida para ver el detalle.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RunList({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: PriceListRunSummary[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-md border border-[#d9dee7] bg-white">
      {runs.map((run) => {
        const isSelected = selectedRunId === run.id;

        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            className={`flex w-full items-start justify-between gap-3 border-b border-[#e5e9ef] px-3 py-3 text-left last:border-b-0 ${
              isSelected ? "bg-[#edf3ff]" : "bg-white hover:bg-[#f8fafc]"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#17202a]">
                {formatRunTitle(run)}
              </span>
              <span className="mt-1 block text-xs text-[#667789]">
                {formatDate(run.createdAt)}
              </span>
              <span className="mt-2 block text-xs text-[#526170]">
                {run.matchedCount}/{run.itemsCount} con precio
              </span>
            </span>
            <Eye
              aria-hidden="true"
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                isSelected ? "text-[#275fbd]" : "text-[#9aa5b1]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function RunDetail({ detail }: { detail: PriceListRunDetail }) {
  const reviewItems = detail.items.filter(
    (item) => item.decisionStatus !== "ready",
  ).length;
  const sourcesWithResults = detail.sources.filter(
    (source) => source.resultsCount > 0,
  ).length;

  return (
    <div>
      <div className="border-b border-[#d9dee7] bg-white px-4 py-4">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
          <div>
            <h3 className="text-base font-bold text-[#17202a]">
              {formatRunTitle(detail.run)}
            </h3>
            <p className="mt-1 text-sm text-[#667789]">
              Guardada {formatDate(detail.run.createdAt)}
            </p>
          </div>
          <span className="rounded bg-[#e4f6ed] px-2 py-1 text-xs font-semibold text-[#16613c]">
            {detail.run.matchedCount}/{detail.run.itemsCount} con precio
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:flex">
          <button
            type="button"
            onClick={() => downloadRunResultCsv(detail)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd]"
          >
            <Download className="h-4 w-4" />
            Descargar resultado
          </button>
          <button
            type="button"
            onClick={() => downloadRunAraCsv(detail)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#275fbd] bg-[#f5f8ff] px-3 text-sm font-semibold text-[#173e83] transition hover:bg-[#eaf2ff]"
          >
            <Download className="h-4 w-4" />
            Exportar para Aguiar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
          <HistoryMetric label="A revisar" value={reviewItems} />
          <HistoryMetric label="Fuentes con datos" value={sourcesWithResults} />
          <HistoryMetric label="Sin precio" value={detail.run.unmatchedCount} />
        </div>
      </div>

      {detail.items.length > 0 ? (
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[920px] w-full border-collapse text-left text-xs">
            <thead className="bg-[#edf1f5] uppercase tracking-[0.04em] text-[#526170]">
              <tr>
                <th className="px-3 py-3">Artículo</th>
                <th className="px-3 py-3">Aguiar</th>
                <th className="px-3 py-3">Referencia</th>
                <th className="px-3 py-3">Sugerido</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9ef] bg-white">
              {detail.items.map((item) => (
                <tr key={item.id}>
                  <td className="max-w-[320px] px-3 py-3">
                    <div className="font-medium text-[#17202a]">
                      {item.description || "-"}
                    </div>
                    <div className="mt-1 text-[#667789]">
                      {item.rubro || "Sin rubro"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#526170]">
                    {formatCurrency(item.currentPrice)}
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#173d2f]">
                    {formatCurrency(item.bestPrice)}
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#1d5f8f]">
                    {formatCurrency(item.suggestedPrice)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={decisionClassName(item.decisionStatus)}>
                      {item.decisionLabel}
                    </span>
                    {item.gapPercent !== null ? (
                      <div className="mt-1 text-[#667789]">
                        {formatSignedPercent(item.gapPercent)}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-[#526170]">
                    {item.bestProductUrl ? (
                      <a
                        href={item.bestProductUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
                      >
                        {item.bestSourceName || "Ver fuente"}
                      </a>
                    ) : (
                      item.bestSourceName || "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail.items.length > 0 ? (
        <div className="grid gap-2 p-3 lg:hidden">
          {detail.items.map((item) => (
            <article
              key={`${item.id}-mobile`}
              className="rounded-md border border-[#d9dee7] bg-white p-3"
            >
              <div className="font-semibold text-[#17202a]">
                {item.description || "-"}
              </div>
              <div className="mt-1 text-sm text-[#667789]">
                {item.rubro || "Sin rubro"}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <HistoryValue
                  label="Ref."
                  value={formatCurrency(item.bestPrice)}
                />
                <HistoryValue
                  label="Sugerido"
                  value={formatCurrency(item.suggestedPrice)}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={decisionClassName(item.decisionStatus)}>
                  {item.decisionLabel}
                </span>
                <span className="text-sm text-[#526170]">
                  {item.bestSourceName || "-"}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HistoryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-[#17202a]">{value}</div>
    </div>
  );
}

function HistoryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-[#667789]">{label}</div>
      <div className="mt-1 font-semibold text-[#17202a]">{value}</div>
    </div>
  );
}

function formatRunTitle(run: PriceListRunSummary) {
  return run.weekStart ? `Semana ${formatShortDate(run.weekStart)}` : run.listName;
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

function formatCurrency(value: number | null) {
  return value === null ? "-" : currencyFormatter.format(value);
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(value)}%`;
}

function downloadRunResultCsv(detail: PriceListRunDetail) {
  const sourceHeaders = detail.sources.map((_, index) => `Comparacion ${index + 1}`);
  const headers = [
    "Rubro",
    "Descripcion Larga",
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Precio Aguiar",
    "Brecha %",
    "Precio sugerido",
    "Estado decision",
    "Mejor precio",
    "Mejor fuente",
    "Producto encontrado",
    "Link producto",
    ...sourceHeaders,
  ];
  const rows = detail.items.map((item) => {
    const comparisons = buildHistorySourceComparisons(item, detail.sources);

    return [
      item.rubro ?? "",
      item.description ?? "",
      item.code ?? "",
      item.ean13Di ?? "",
      item.ean13Bu ?? "",
      formatCsvAmount(item.currentPrice),
      item.gapPercent === null ? "" : item.gapPercent.toFixed(2),
      formatCsvAmount(item.suggestedPrice),
      item.decisionLabel,
      formatCsvAmount(item.bestPrice),
      item.bestSourceName ?? "",
      item.bestProductName ?? "",
      item.bestProductUrl ?? "",
      ...comparisons.map(({ source, sourcePrice }) =>
        sourcePrice
          ? `${sourcePrice.storeName}: ${sourcePrice.price.toFixed(2)}`
          : `${source.storeName}: Sin precio`,
      ),
    ];
  });

  downloadCsvFile(
    `resultado-${detail.run.weekStart ?? detail.run.id}.csv`,
    [headers, ...rows],
  );
}

function downloadRunAraCsv(detail: PriceListRunDetail) {
  const headers = [
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Descripcion",
    "Rubro",
    "Precio a cargar Aguiar",
    "Precio Aguiar actual",
    "Precio referencia",
    "Fuente referencia",
    "Estado decision",
  ];
  const rows = detail.items.map((item) => {
    const priceToLoad =
      item.suggestedPrice ?? item.currentPrice ?? item.bestPrice ?? null;

    return [
      item.code ?? "",
      item.ean13Di ?? "",
      item.ean13Bu ?? "",
      item.description ?? "",
      item.rubro ?? "",
      formatCsvAmount(priceToLoad),
      formatCsvAmount(item.currentPrice),
      formatCsvAmount(item.bestPrice),
      item.bestSourceName ?? "",
      item.decisionLabel,
    ];
  });

  downloadCsvFile(`aguiar-${detail.run.weekStart ?? detail.run.id}.csv`, [
    headers,
    ...rows,
  ]);
}

function buildHistorySourceComparisons(
  item: PriceListRunDetail["items"][number],
  sources: PriceListRunDetail["sources"],
) {
  const pricesBySource = new Map(
    item.sourcePrices.map((sourcePrice) => [
      sourcePrice.sourceId,
      sourcePrice,
    ]),
  );

  return sources
    .map((source) => ({
      source,
      sourcePrice: pricesBySource.get(source.sourceId) ?? null,
    }))
    .sort((first, second) => {
      if (first.sourcePrice && second.sourcePrice) {
        return first.sourcePrice.price - second.sourcePrice.price;
      }

      if (first.sourcePrice) {
        return -1;
      }

      if (second.sourcePrice) {
        return 1;
      }

      return first.source.storeName.localeCompare(second.source.storeName, "es");
    });
}

function downloadCsvFile(fileName: string, rows: Array<Array<string | number>>) {
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

function formatCsvAmount(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}

function decisionClassName(status: string) {
  const base = "inline-flex rounded px-2 py-1 text-[11px] font-semibold";

  if (status === "ready") {
    return `${base} bg-[#e4f6ed] text-[#16613c]`;
  }

  if (status === "opportunity") {
    return `${base} bg-[#eaf2ff] text-[#1d5f8f]`;
  }

  if (status === "no_reference" || status === "missing_own_price") {
    return `${base} bg-[#eef1f4] text-[#526170]`;
  }

  return `${base} bg-[#fff1ef] text-[#8f2d20]`;
}
