"use client";

import {
  AlertTriangle,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useMemo, useState } from "react";
import {
  evaluatePriceListInBatches,
  type PriceListBatchProgress,
} from "@/lib/price-list-batches";
import {
  analyzePriceListDecision,
  calculatePriceListGapRatio,
  getBestPriceListSourceByType,
  getOwnPriceSourceLabel,
  getPriceListComparablePrice,
  getPriceListExcelPrice,
  getPriceListOwnPrice,
  getPriceListSuggestedAction,
  getPriceListTokinPrice,
  sortPriceListResultPrices,
  type PriceListDecisionTone,
} from "@/lib/price-list-decision";
import type {
  PendingSourceStatus,
  PriceListInputItem,
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
  SourceSearchStatus,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("es-AR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const COMPARISON_SLOTS = 8;
const COMPARISON_FIELD_LABELS = [
  "Fuente",
  "Canal",
  "Precio unitario/equiv",
  "Precio bulto/lista",
  "Detalle precio",
  "Producto",
  "Link",
] as const;
type WorkbookCellValue = string | number;
type WorkbookRow = WorkbookCellValue[];
type ImportDecisionFilter =
  | "all"
  | "attention"
  | "above_wholesale"
  | "competitive"
  | "opportunity"
  | "missing_own"
  | "without_wholesale";

export default function ImportacionPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [response, setResponse] = useState<PriceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [persistForEvolution, setPersistForEvolution] = useState(false);
  const [batchProgress, setBatchProgress] =
    useState<PriceListBatchProgress | null>(null);

  const summary = useMemo(() => {
    if (!response) {
      return null;
    }

    return {
      total: response.itemsCount,
      withPrice: response.matchedCount,
      withoutPrice: response.unmatchedCount,
      sourcesWithData: new Set(
        response.results.flatMap((result) =>
          result.sourcePrices.map((sourcePrice) => sourcePrice.sourceId),
        ),
      ).size,
    };
  }, [response]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setFileName(file.name);
    setResponse(null);
    setError(null);
    setBatchProgress(null);
    setIsLoading(true);

    try {
      const items = await parsePriceListFile(file);

      if (items.length === 0) {
        throw new Error("No se encontraron artículos válidos en la planilla.");
      }

      setItemsCount(items.length);
      const payload = await evaluatePriceListInBatches({
        items,
        persist: persistForEvolution,
        onProgress: setBatchProgress,
      });

      setResponse(payload);
    } catch (caughtError) {
      setItemsCount(0);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo evaluar la lista.",
      );
    } finally {
      setIsLoading(false);
      setBatchProgress(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff8f2]">
      <section className="relative overflow-hidden bg-[#153d7b] text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-35"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1800&q=80')",
          }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[#143a78]/88" />
        <div className="relative mx-auto flex w-full max-w-[1800px] flex-col gap-2 px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl lg:text-4xl">
            Importación de lista
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/88 sm:text-base">
            Cargá el Excel semanal, compará precios y descargá el resultado
            operativo.
          </p>
        </div>
      </section>

      <section className="flex w-full flex-col gap-4 px-3 py-4 sm:px-4 md:py-5 lg:px-6">
        <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#17202a]">
                <FileSpreadsheet className="h-5 w-5 text-[#df2e38]" />
                Buscar por importación
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#667789]">
                El archivo debe incluir Rubro, Descripción, Código y EAN. Si
                trae Precio Aguiar, ese valor se usa para la comparación.
                Tokin/Arcor queda visible como control y se usa solo cuando el
                Excel no trae precio.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#df2e38] px-4 text-sm font-semibold text-white transition hover:bg-[#bd1f2a]">
                <Upload className="h-4 w-4" />
                Importar
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              <button
                type="button"
                disabled={!response}
                onClick={() => response && downloadPriceListXlsx(response)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-4 text-sm font-semibold text-[#17202a] transition hover:border-[#153d7b] hover:text-[#153d7b] disabled:cursor-not-allowed disabled:text-[#a99f99]"
              >
                <Download className="h-4 w-4" />
                Resultado XLSX
              </button>
              <button
                type="button"
                disabled={!response}
                onClick={() => response && downloadAguiarCsv(response)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#153d7b] bg-[#f5f8ff] px-4 text-sm font-semibold text-[#153d7b] transition hover:bg-[#eaf2ff] disabled:cursor-not-allowed disabled:border-[#dec8bd] disabled:bg-white disabled:text-[#a99f99]"
              >
                <Download className="h-4 w-4" />
                Aguiar
              </button>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3">
            <input
              type="checkbox"
              checked={persistForEvolution}
              onChange={(event) => setPersistForEvolution(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#df2e38]"
            />
            <span>
              <span className="block text-sm font-semibold text-[#17202a]">
                Guardar esta carga para evolución
              </span>
              <span className="mt-1 block text-sm text-[#667789]">
                Activá esto solo si querés dejar esta lista como referencia
                semanal.
              </span>
            </span>
          </label>

          {fileName ? (
            <div className="mt-4 rounded-md bg-[#fff8f2] px-4 py-3 text-sm text-[#6f625d]">
              {fileName} {itemsCount > 0 ? `· ${itemsCount} artículos` : ""}
            </div>
          ) : null}

          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-[#eadbd3] bg-[#fffdfa] px-4 py-3 text-sm text-[#6f625d]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {formatBatchProgress(batchProgress)}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
              {error}
            </div>
          ) : null}
        </section>

        {summary ? (
          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Artículos" value={summary.total} />
            <Metric label="Con precio" value={summary.withPrice} />
            <Metric label="Sin precio" value={summary.withoutPrice} />
            <Metric label="Fuentes con datos" value={summary.sourcesWithData} />
          </section>
        ) : null}

        {response ? <ImportResults response={response} /> : null}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: PriceListDecisionTone;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${metricToneClassName(tone)}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[#17202a]">{value}</div>
    </div>
  );
}

function metricToneClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "border-[#f1b3ad] bg-[#fff1ef]",
    warning: "border-[#f0d2a2] bg-[#fff8e8]",
    success: "border-[#bfe5cf] bg-[#f4fbf7]",
    info: "border-[#bed4f4] bg-[#f5f8ff]",
    neutral: "border-[#d9dee7] bg-white",
  };

  return classes[tone];
}

function decisionChipClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "bg-[#fff1ef] text-[#8f2d20]",
    warning: "bg-[#fff8e8] text-[#8a5a0a]",
    success: "bg-[#e4f6ed] text-[#16613c]",
    info: "bg-[#eef4ff] text-[#153d7b]",
    neutral: "bg-[#f1f5f9] text-[#526170]",
  };

  return classes[tone];
}

function decisionCardClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "border-[#f1b3ad] bg-[#fff1ef]",
    warning: "border-[#f0d2a2] bg-[#fff8e8]",
    success: "border-[#bfe5cf] bg-[#f4fbf7]",
    info: "border-[#bed4f4] bg-[#f5f8ff]",
    neutral: "border-[#d9dee7] bg-[#f8fafc]",
  };

  return classes[tone];
}

function formatDecisionGap(
  gapRatio: number | null,
  referenceChannelLabel: "mayorista" | "minorista" | "mercado",
) {
  if (gapRatio === null) {
    return `sin diferencia vs ${referenceChannelLabel}`;
  }

  const prefix = gapRatio > 0 ? "+" : "";
  return `${prefix}${percentFormatter.format(gapRatio)} vs ${referenceChannelLabel}`;
}

function formatOwnPriceDifference(gapRatio: number | null | undefined) {
  if (gapRatio === null || gapRatio === undefined) {
    return "Sin ambos precios para comparar";
  }

  if (Math.abs(gapRatio) < 0.001) {
    return "Coincide con el Excel";
  }

  const prefix = gapRatio > 0 ? "+" : "";
  return `Excel ${prefix}${percentFormatter.format(gapRatio)} vs Tokin`;
}

function ImportResults({ response }: { response: PriceListResponse }) {
  const [filter, setFilter] = useState<ImportDecisionFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const analyzedResults = useMemo(
    () =>
      response.results.map((result) => {
        const sortedResult = sortPriceListResultPrices(result);

        return {
          result: sortedResult,
          decision: analyzePriceListDecision(sortedResult),
        };
      }),
    [response.results],
  );
  const counts = useMemo(
    () => ({
      total: analyzedResults.length,
      attention: analyzedResults.filter(({ decision }) =>
        isImportDecisionAttention(decision.kind),
      ).length,
      aboveWholesale: analyzedResults.filter(({ decision }) =>
        decision.kind.startsWith("above_wholesale"),
      ).length,
      competitive: analyzedResults.filter(
        ({ decision }) => decision.kind === "competitive",
      ).length,
      opportunities: analyzedResults.filter(
        ({ decision }) => decision.kind === "margin_opportunity",
      ).length,
      missingOwn: analyzedResults.filter(
        ({ decision }) => decision.kind === "missing_own_price",
      ).length,
      withoutWholesale: analyzedResults.filter(
        ({ decision }) => !decision.hasWholesaleReference,
      ).length,
    }),
    [analyzedResults],
  );
  const visibleResults = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return analyzedResults
      .filter(({ decision }) => matchesImportFilter(decision, filter))
      .filter(({ result }) => {
        if (!normalizedSearch) {
          return true;
        }

        return [
          result.input.description,
          result.input.code,
          result.input.ean13Di,
          result.input.ean13Bu,
          result.input.rubro,
          result.input.subrubro,
          result.input.segment,
        ]
          .filter(Boolean)
          .some((value) => normalizeText(String(value)).includes(normalizedSearch));
      })
      .sort(compareImportDecisionRows);
  }, [analyzedResults, filter, searchTerm]);

  return (
    <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-[#17202a]">
          Resultado de importación
        </h2>
        <p className="text-sm text-[#667789]">
          Artículos en el orden del Excel. La referencia prioritaria usa
          mayoristas primero y minoristas solo si no hay mayorista comparable.
        </p>
      </div>

      <section aria-label="Semáforo de la importación" className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#17202a]">Cosas para ver</h3>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-xs font-semibold text-[#153d7b] hover:underline"
          >
            Ver todos ({counts.total})
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <ImportSignalButton
            label="Revisar"
            value={counts.attention}
            tone="danger"
            active={filter === "attention"}
            onClick={() => setFilter("attention")}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <ImportSignalButton
            label="Mayorista más barato"
            value={counts.aboveWholesale}
            tone="warning"
            active={filter === "above_wholesale"}
            onClick={() => setFilter("above_wholesale")}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <ImportSignalButton
            label="Competitivos"
            value={counts.competitive}
            tone="success"
            active={filter === "competitive"}
            onClick={() => setFilter("competitive")}
            icon={<CircleCheck className="h-4 w-4" />}
          />
          <ImportSignalButton
            label="Precio propio mejor"
            value={counts.opportunities}
            tone="info"
            active={filter === "opportunity"}
            onClick={() => setFilter("opportunity")}
            icon={<TrendingDown className="h-4 w-4" />}
          />
          <ImportSignalButton
            label="Falta propio"
            value={counts.missingOwn}
            tone="neutral"
            active={filter === "missing_own"}
            onClick={() => setFilter("missing_own")}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <ImportSignalButton
            label="Sin mayorista"
            value={counts.withoutWholesale}
            tone="neutral"
            active={filter === "without_wholesale"}
            onClick={() => setFilter("without_wholesale")}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>
      </section>

      <div className="mt-4 grid gap-2 border-y border-[#e5e9ef] bg-[#f8fafc] py-3 md:grid-cols-[minmax(240px,1fr)_auto] md:items-center">
        <label className="relative">
          <span className="sr-only">Buscar dentro de la importación</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a96a3]" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar artículo, código, EAN o rubro"
            className="h-10 w-full rounded-md border border-[#cfd8e3] bg-white pl-9 pr-3 text-sm text-[#17202a] outline-none focus:border-[#153d7b]"
          />
        </label>
        <div className="text-sm font-semibold text-[#526170]">
          {visibleResults.length} artículos visibles
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {visibleResults.map(({ result }) => (
          <ImportResultCard
            key={`${result.input.rowNumber}-${result.input.code ?? ""}`}
            result={result}
          />
        ))}
      </div>

      {visibleResults.length === 0 ? (
        <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#667789]">
          No hay artículos para los filtros seleccionados.
        </div>
      ) : null}
    </section>
  );
}

function ImportSignalButton({
  label,
  value,
  tone,
  active,
  onClick,
  icon,
}: {
  label: string;
  value: number;
  tone: PriceListDecisionTone;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-16 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition ${metricToneClassName(
        tone,
      )} ${active ? "ring-2 ring-[#153d7b] ring-offset-1" : "hover:border-[#153d7b]"}`}
    >
      <span>
        <span className="block text-[11px] font-bold uppercase text-[#667789]">
          {label}
        </span>
        <span className="mt-1 block text-xl font-extrabold text-[#17202a]">
          {value}
        </span>
      </span>
      {icon}
    </button>
  );
}

function matchesImportFilter(
  decision: ReturnType<typeof analyzePriceListDecision>,
  filter: ImportDecisionFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "attention") {
    return isImportDecisionAttention(decision.kind);
  }

  if (filter === "above_wholesale") {
    return decision.kind.startsWith("above_wholesale");
  }

  if (filter === "competitive") {
    return decision.kind === "competitive";
  }

  if (filter === "opportunity") {
    return decision.kind === "margin_opportunity";
  }

  if (filter === "missing_own") {
    return decision.kind === "missing_own_price";
  }

  return !decision.hasWholesaleReference;
}

function isImportDecisionAttention(
  kind: ReturnType<typeof analyzePriceListDecision>["kind"],
) {
  return kind !== "competitive" && kind !== "margin_opportunity";
}

function compareImportDecisionRows(
  first: {
    result: PriceListItemResult;
    decision: ReturnType<typeof analyzePriceListDecision>;
  },
  second: {
    result: PriceListItemResult;
    decision: ReturnType<typeof analyzePriceListDecision>;
  },
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
  const rankDifference =
    rank[first.decision.kind] - rank[second.decision.kind];

  if (rankDifference !== 0) {
    return rankDifference;
  }

  return first.result.input.rowNumber - second.result.input.rowNumber;
}

function formatBatchProgress(progress: PriceListBatchProgress | null) {
  if (!progress) {
    return "Preparando evaluacion por lotes...";
  }

  return `Evaluando lote ${progress.completedBatches}/${progress.totalBatches} · ${progress.processedItems}/${progress.totalItems} articulos`;
}

function ImportResultCard({ result }: { result: PriceListItemResult }) {
  const comparisons = result.sourcePrices.slice(0, 5);
  const decision = analyzePriceListDecision(result);
  const ownPriceLabel = getOwnPriceSourceLabel(result);
  const excelPrice = getPriceListExcelPrice(result);
  const tokinPrice = getPriceListTokinPrice(result);
  const selectedOwnPrice = getPriceListOwnPrice(result);

  return (
    <article className="rounded-md border border-[#d9dee7] bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#17202a]">
            {result.input.description || "Artículo sin descripción"}
          </h3>
          <div className="mt-1 text-xs text-[#667789]">
            {result.input.rubro || "-"} · {result.input.code || "-"} ·{" "}
            {result.input.ean13Di || result.input.ean13Bu || "sin EAN"}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span
            className={`rounded px-2 py-1 text-xs font-semibold ${
              result.status === "matched"
                ? "bg-[#e4f6ed] text-[#16613c]"
                : "bg-[#fff1ef] text-[#8f2d20]"
            }`}
          >
            {result.status === "matched" ? "Con precio" : "Sin precio"}
          </span>
          <span
            className={`rounded px-2 py-1 text-xs font-semibold ${decisionChipClassName(
              decision.tone,
            )}`}
          >
            {decision.label}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-md border border-[#dbe7df] bg-[#f4fbf7] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Referencia prioritaria
          </div>
          <div className="mt-1 text-lg font-extrabold text-[#173d2f]">
            {formatCurrency(result.bestPrice)}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            {result.bestSource?.storeName ?? "sin fuente"}{" "}
            {result.bestSource ? `· ${formatStoreType(result.bestSource.storeType)}` : ""}
          </div>
        </div>
        <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Precio Excel
          </div>
          <div className="mt-1 text-lg font-extrabold text-[#17202a]">
            {formatCurrency(excelPrice)}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            Valor recibido en la planilla
          </div>
        </div>
        <div className="rounded-md border border-[#cddcf2] bg-[#f5f8ff] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Precio Tokin/Arcor
          </div>
          <div className="mt-1 text-lg font-extrabold text-[#153d7b]">
            {formatCurrency(tokinPrice)}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            {formatOwnPriceDifference(result.ownPrice?.excelVsTokinGapRatio)}
          </div>
        </div>
        <div className="rounded-md border border-[#eadbd3] bg-[#fff8f2] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Precio usado
          </div>
          <div className="mt-1 text-lg font-extrabold text-[#7a4a16]">
            {formatCurrency(selectedOwnPrice)}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            Origen: {ownPriceLabel}
          </div>
        </div>
        <div className={`rounded-md border px-3 py-2 ${decisionCardClassName(decision.tone)}`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Lectura comercial
          </div>
          <div className="mt-1 text-sm font-extrabold text-[#17202a]">
            {decision.action}
          </div>
          <div className="mt-1 text-xs font-semibold text-[#526170]">
            {formatDecisionGap(decision.gapRatio, decision.referenceChannelLabel)}
          </div>
          <div className="mt-1 text-xs leading-4 text-[#667789]">
            {decision.helper}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {comparisons.length === 0 ? (
          <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-3 text-sm text-[#667789] sm:col-span-2">
            No hay comparaciones para este artículo.
          </div>
        ) : (
          comparisons.map((sourcePrice) => (
            <SourcePriceCard
              key={`${sourcePrice.sourceId}-${sourcePrice.productName}`}
              sourcePrice={sourcePrice}
            />
          ))
        )}
      </div>
    </article>
  );
}

function SourcePriceCard({
  sourcePrice,
}: {
  sourcePrice: PriceListSourcePrice;
}) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-[#17202a]">
          {sourcePrice.storeName}
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            sourcePrice.storeType === "mayorista"
              ? "bg-[#e4f6ed] text-[#16613c]"
              : "bg-[#eef4ff] text-[#153d7b]"
          }`}
        >
          {formatStoreType(sourcePrice.storeType)}
        </span>
      </div>
      <div className="mt-1 text-base font-bold text-[#173d2f]">
        {formatCurrency(getPriceListComparablePrice(sourcePrice))}
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-[#667789]">
        {sourcePrice.productName}
      </div>
      {sourcePrice.priceCondition ||
      sourcePrice.packageQuantity ||
      sourcePrice.alternatePrices?.length ? (
        <div className="mt-2 text-xs leading-4 text-[#667789]">
          {sourcePrice.priceCondition ? <div>{sourcePrice.priceCondition}</div> : null}
          {sourcePrice.packageQuantity && sourcePrice.packageQuantity > 1 ? (
            <div>
              Bulto: {sourcePrice.packageLabel ?? `pack x ${sourcePrice.packageQuantity}`} ·{" "}
              {formatCurrency(sourcePrice.price)}
            </div>
          ) : null}
          {sourcePrice.alternatePrices?.map((alternatePrice) => (
            <div key={`${alternatePrice.label}-${alternatePrice.price}`}>
              {alternatePrice.label}: {formatCurrency(alternatePrice.price)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function parsePriceListFile(file: File): Promise<PriceListInputItem[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  }) as Array<Array<string | number | null>>;
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map((cell) => normalizeColumnName(cell));
    return (
      headers.includes("rubro") &&
      headers.some((header) => header.includes("descripcion")) &&
      headers.some((header) =>
        ["codigo", "code", "articulo"].includes(header),
      )
    );
  });

  if (headerIndex === -1) {
    throw new Error(
      "No se encontraron columnas Rubro, Descripción Larga y Código.",
    );
  }

  const headers = rows[headerIndex].map((cell) => normalizeColumnName(cell));
  const businessIndex = findColumn(headers, ["negocio"]);
  const rubroIndex = findColumn(headers, ["rubro"]);
  const segmentIndex = findColumn(headers, ["segmento"]);
  const subrubroIndex = findColumn(headers, ["subrubro"]);
  const lineIndex = findColumn(headers, ["linea", "línea"]);
  const descriptionIndex = findColumn(headers, [
    "descripcion larga",
    "descripcion articulos",
    "descripcion articulo",
    "descripcion",
    "description",
  ]);
  const codeIndex = findColumn(headers, ["codigo", "code", "articulo"]);
  const uxbIndex = findColumn(headers, [
    "uxb",
    "u x b",
    "unidades por bulto",
    "unidades x bulto",
  ]);
  const eanDiIndex = findColumn(headers, [
    "ean 13 di",
    "ean13 di",
    "ean di",
    "ean 13 unidad",
    "ean13 unidad",
  ]);
  const eanBuIndex = findColumn(headers, [
    "ean 13 bu",
    "ean13 bu",
    "ean bu",
    "ean 13 display",
    "ean 13 dispaly",
    "ean13 display",
    "ean13 dispaly",
  ]);
  const currentPriceIndex = findColumn(headers, [
    "precio aguiar",
    "precio ara",
    "precio x unid",
    "precio por unidad",
    "precio actual",
    "precio lista",
    "precio venta",
    "precio publico",
    "precio final",
  ]);

  return rows
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      business: readCell(row, businessIndex),
      rubro: readCell(row, rubroIndex),
      segment: readCell(row, segmentIndex),
      subrubro: readCell(row, subrubroIndex),
      line: readCell(row, lineIndex),
      description: readCell(row, descriptionIndex),
      code: readCell(row, codeIndex),
      uxb: readCell(row, uxbIndex),
      ean13Di: cleanSpreadsheetIdentifier(readCell(row, eanDiIndex)),
      ean13Bu: cleanSpreadsheetIdentifier(readCell(row, eanBuIndex)),
      currentPrice: parseSpreadsheetAmount(readCell(row, currentPriceIndex)),
    }))
    .filter(
      (item) =>
        Boolean(item.description) ||
        Boolean(item.code) ||
        Boolean(item.ean13Di) ||
        Boolean(item.ean13Bu),
    );
}

async function downloadPriceListXlsx(response: PriceListResponse) {
  const XLSX = await import("xlsx");
  const sortedResults = response.results.map(sortPriceListResultPrices);
  const headers = [
    "Negocio",
    "Rubro",
    "Segmento",
    "Subrubro",
    "Linea",
    "Articulo",
    "Descripcion ARTICULOS",
    "UxB",
    "Precio Excel",
    "Precio Tokin/Arcor",
    "Precio propio usado",
    "Origen precio propio",
    "Diferencia Excel vs Tokin %",
    "Ean 13 Unidad",
    "Ean 13 Dispaly",
    "Estado",
    "Accion sugerida",
    "Referencia prioritaria",
    "Fuente referencia",
    "Canal referencia",
    "Mejor mayorista",
    "Fuente mayorista",
    "Mejor minorista",
    "Fuente minorista",
    "Brecha vs referencia %",
    "Producto encontrado",
    "Link producto",
    "Confianza",
    ...buildComparisonHeaders(),
  ];
  const rows = sortedResults.map((sortedResult) => {
    const currentPrice = getPriceListOwnPrice(sortedResult);
    const excelPrice = getPriceListExcelPrice(sortedResult);
    const tokinPrice = getPriceListTokinPrice(sortedResult);
    const decision = analyzePriceListDecision(sortedResult);
    const bestMayorista = getBestPriceListSourceByType(sortedResult, "mayorista");
    const bestMinorista = getBestPriceListSourceByType(sortedResult, "minorista");
    const gap = calculatePriceListGapRatio(
      currentPrice,
      decision.referencePrice,
    );
    const comparisons = sortedResult.sourcePrices
      .slice(0, COMPARISON_SLOTS)
      .flatMap(formatSourceXlsxComparisonCells);
    const comparisonCells = [
      ...comparisons,
      ...Array.from(
        {
          length:
            COMPARISON_SLOTS * COMPARISON_FIELD_LABELS.length -
            comparisons.length,
        },
        () => "",
      ),
    ];

    return [
      sortedResult.input.business ?? "",
      sortedResult.input.rubro ?? "",
      sortedResult.input.segment ?? "",
      sortedResult.input.subrubro ?? "",
      sortedResult.input.line ?? "",
      sortedResult.input.code ?? "",
      sortedResult.input.description ?? "",
      parseNumberOrText(sortedResult.input.uxb),
      excelPrice ?? "",
      tokinPrice ?? "",
      currentPrice ?? "",
      getOwnPriceSourceLabel(sortedResult),
      sortedResult.ownPrice?.excelVsTokinGapRatio ?? "",
      sortedResult.input.ean13Di ?? "",
      sortedResult.input.ean13Bu ?? "",
      sortedResult.status === "matched" ? "Con precio" : "Sin precio",
      getPriceListSuggestedAction(sortedResult),
      sortedResult.bestPrice ?? "",
      sortedResult.bestSource?.storeName ?? "",
      sortedResult.bestSource ? formatStoreType(sortedResult.bestSource.storeType) : "",
      bestMayorista ? getPriceListComparablePrice(bestMayorista) : "",
      bestMayorista?.storeName ?? "",
      bestMinorista ? getPriceListComparablePrice(bestMinorista) : "",
      bestMinorista?.storeName ?? "",
      gap ?? "",
      sortedResult.bestSource?.productName ?? "",
      sortedResult.bestSource?.productUrl ?? "",
      sortedResult.bestSource?.confidenceScore ?? "",
      ...comparisonCells,
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = buildHumanOutputColumnWidths(headers.length);
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: headers.length - 1 },
    }),
  };

  applyHumanOutputFormats(worksheet as Record<string, unknown>, rows.length);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Comparacion precios");

  const diagnosticRows = buildDiagnosticRows(response, sortedResults);
  const diagnosticWorksheet = XLSX.utils.aoa_to_sheet(diagnosticRows);
  diagnosticWorksheet["!cols"] = [
    { wch: 24 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 42 },
    { wch: 32 },
    { wch: 42 },
    { wch: 54 },
  ];
  XLSX.utils.book_append_sheet(workbook, diagnosticWorksheet, "Diagnostico");

  const noMatchRows = buildNoMatchRows(sortedResults);
  const noMatchWorksheet = XLSX.utils.aoa_to_sheet(noMatchRows);
  noMatchWorksheet["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 34 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 26 },
    { wch: 42 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(workbook, noMatchWorksheet, "Sin match");

  XLSX.writeFile(
    workbook,
    `lista-human-comparada-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function downloadAguiarCsv(response: PriceListResponse) {
  const headers = [
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Descripcion",
    "Rubro",
    "Precio Aguiar",
  ];
  const rows = response.results.map((result) => [
    result.input.code ?? "",
    result.input.ean13Di ?? "",
    result.input.ean13Bu ?? "",
    result.input.description ?? "",
    result.input.rubro ?? "",
    formatCsvAmount(getPriceListOwnPrice(result)),
  ]);

  downloadCsv("aguiar-precios", [headers, ...rows]);
}

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildComparisonHeaders() {
  return Array.from({ length: COMPARISON_SLOTS }, (_, index) =>
    COMPARISON_FIELD_LABELS.map((label) => `Comp ${index + 1} ${label}`),
  ).flat();
}

function formatSourceXlsxComparisonCells(
  sourcePrice: PriceListSourcePrice,
): WorkbookRow {
  return [
    sourcePrice.storeName,
    formatStoreType(sourcePrice.storeType),
    getPriceListComparablePrice(sourcePrice),
    getPackageOrListPrice(sourcePrice) ?? "",
    buildPriceDetail(sourcePrice),
    sourcePrice.productName,
    sourcePrice.productUrl ?? "",
  ];
}

function getPackageOrListPrice(sourcePrice: PriceListSourcePrice) {
  const comparablePrice = getPriceListComparablePrice(sourcePrice);
  const packageLikePrice =
    sourcePrice.packageQuantity && sourcePrice.packageQuantity > 1;
  const hasDifferentComparablePrice =
    Math.abs(sourcePrice.price - comparablePrice) > 0.01;

  return packageLikePrice || hasDifferentComparablePrice
    ? sourcePrice.price
    : null;
}

function buildPriceDetail(sourcePrice: PriceListSourcePrice) {
  const details = [
    sourcePrice.priceCondition,
    sourcePrice.packageQuantity && sourcePrice.packageQuantity > 1
      ? sourcePrice.packageLabel ?? `bulto x ${sourcePrice.packageQuantity}`
      : null,
    ...(sourcePrice.alternatePrices ?? []).map((alternatePrice) => {
      const comparablePrice =
        normalizeOptionalNumber(alternatePrice.comparisonPrice) ??
        alternatePrice.price;
      return `${alternatePrice.label}: ${currencyFormatter.format(comparablePrice)}`;
    }),
  ].filter(Boolean);

  return details.join(" | ");
}

function formatStoreType(storeType: PriceListSourcePrice["storeType"]) {
  return storeType === "mayorista" ? "Mayorista" : "Minorista";
}

function buildHumanOutputColumnWidths(columnsCount: number) {
  const widths = [
    16, 18, 22, 22, 30, 10, 34, 10, 14, 14, 14, 16, 18, 16, 16, 14, 20, 16,
    22, 14, 16, 22, 16, 22, 18, 34, 28, 11,
  ];

  return Array.from({ length: columnsCount }, (_, index) => ({
    wch: widths[index] ?? 42,
  }));
}

function applyHumanOutputFormats(
  worksheet: Record<string, unknown>,
  rowsCount: number,
) {
  const comparisonStartColumn = 29;
  const comparisonCurrencyColumns = Array.from(
    { length: COMPARISON_SLOTS },
    (_, index) => comparisonStartColumn + index * COMPARISON_FIELD_LABELS.length,
  ).flatMap((startColumn) => [startColumn + 2, startColumn + 3]);
  const currencyColumns = [9, 10, 11, 18, 21, 23, ...comparisonCurrencyColumns];
  const percentColumns = [13, 25];
  const integerColumns = [8, 28];

  for (let rowIndex = 2; rowIndex <= rowsCount + 1; rowIndex += 1) {
    for (const columnIndex of currencyColumns) {
      setCellFormat(worksheet, rowIndex, columnIndex, '"$"#,##0.00');
    }

    for (const columnIndex of percentColumns) {
      setCellFormat(worksheet, rowIndex, columnIndex, '0.0%');
    }

    for (const columnIndex of integerColumns) {
      setCellFormat(worksheet, rowIndex, columnIndex, '0');
    }
  }
}

function setCellFormat(
  worksheet: Record<string, unknown>,
  rowIndex: number,
  columnIndex: number,
  format: string,
) {
  const cellAddress = `${columnLetter(columnIndex)}${rowIndex}`;
  const cell = worksheet[cellAddress] as { z?: string } | undefined;

  if (cell) {
    cell.z = format;
  }
}

function columnLetter(columnIndex: number) {
  let remaining = columnIndex;
  let label = "";

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    label = String.fromCharCode(65 + modulo) + label;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return label;
}

function buildDiagnosticRows(
  response: PriceListResponse,
  results: PriceListItemResult[],
): WorkbookRow[] {
  const sourcesWithData = response.sources.filter(
    (source) => source.resultsCount > 0,
  ).length;
  const mayoristaSourcesWithData = response.sources.filter(
    (source) => source.storeType === "mayorista" && source.resultsCount > 0,
  ).length;
  const noMatchCount = results.filter((result) => shouldSendToNoMatch(result)).length;

  return [
    ["Resumen"],
    ["Fecha busqueda", formatDateTime(response.searchedAt)],
    ["Duracion ms", response.durationMs],
    ["Articulos", response.itemsCount],
    ["Con precio", response.matchedCount],
    ["Sin precio", response.unmatchedCount],
    ["A revisar", noMatchCount],
    ["Fuentes consultadas", response.sources.length],
    ["Fuentes con datos", sourcesWithData],
    ["Mayoristas con datos", mayoristaSourcesWithData],
    ["Catalogo estado", response.catalog.status],
    ["Catalogo actualizado", response.catalog.lastSyncedAt ? formatDateTime(response.catalog.lastSyncedAt) : ""],
    ["Productos en catalogo", response.catalog.productsCount],
    [],
    [
      "Fuentes consultadas",
      "Canal",
      "Estado",
      "Resultados",
      "Duracion ms",
      "Origen",
      "Alcance",
      "URL",
      "Mensaje",
    ],
    ...response.sources.map(formatSourceStatusRow),
    [],
    [
      "Fuentes esperadas / pendientes",
      "Canal",
      "Estado",
      "Resultados",
      "Duracion ms",
      "Origen",
      "Alcance",
      "URL",
      "Mensaje",
    ],
    ...response.catalog.pendingSources.map(formatPendingSourceRow),
  ];
}

function formatSourceStatusRow(source: SourceSearchStatus): WorkbookRow {
  return [
    source.storeName,
    formatStoreType(source.storeType),
    formatSourceStatus(source.status),
    source.resultsCount,
    source.durationMs,
    source.dataOrigin ?? "",
    source.sourceScope ?? "",
    source.sourceUrl ?? "",
    source.errorMessage ?? "",
  ];
}

function formatPendingSourceRow(source: PendingSourceStatus): WorkbookRow {
  return [
    source.storeName,
    formatStoreType(source.storeType),
    formatPendingStatus(source.status),
    0,
    0,
    "",
    "",
    "",
    source.message,
  ];
}

function buildNoMatchRows(results: PriceListItemResult[]): WorkbookRow[] {
  const headers = [
    "Rubro",
    "Segmento",
    "Codigo",
    "Descripcion",
    "EAN unidad",
    "EAN display",
    "Estado",
    "Motivo",
    "Queries probadas",
    "Candidatos rechazados",
  ];
  const rows = results.filter(shouldSendToNoMatch).map((result) => [
    result.input.rubro ?? "",
    result.input.segment ?? "",
    result.input.code ?? "",
    result.input.description ?? "",
    result.input.ean13Di ?? "",
    result.input.ean13Bu ?? "",
    result.status === "matched" ? "Con precio/revisar" : "Sin precio",
    getNoMatchReason(result),
    (result.diagnostics?.queriesTried ?? []).slice(0, 20).join(" | "),
    formatRejectedCandidates(result),
  ]);

  return rows.length > 0
    ? [headers, ...rows]
    : [headers, ["", "", "", "", "", "", "OK", "No quedaron productos para revisar", "", ""]];
}

function shouldSendToNoMatch(result: PriceListItemResult) {
  if (result.sourcePrices.length === 0) {
    return true;
  }

  if (!getPriceListOwnPrice(result)) {
    return true;
  }

  const bestConfidence = result.bestSource?.confidenceScore ?? 0;
  return bestConfidence > 0 && bestConfidence < 70;
}

function getNoMatchReason(result: PriceListItemResult) {
  if (result.sourcePrices.length === 0) {
    return "No se encontraron precios comparables";
  }

  if (!getPriceListOwnPrice(result)) {
    return "Falta precio Aguiar en la lista";
  }

  const bestConfidence = result.bestSource?.confidenceScore ?? 0;
  if (bestConfidence > 0 && bestConfidence < 70) {
    return "Match débil: revisar equivalencia antes de decidir";
  }

  return "Revisar manualmente";
}

function formatRejectedCandidates(result: PriceListItemResult) {
  return (result.diagnostics?.queryDiagnostics ?? [])
    .flatMap((diagnostic) => diagnostic.topRejected)
    .slice(0, 8)
    .map(
      (candidate) =>
        `${candidate.storeName}: ${candidate.productName} (${formatRejectReason(candidate.reason)}, score ${candidate.finalScore})`,
    )
    .join(" | ");
}

function formatRejectReason(reason: string) {
  const labels: Record<string, string> = {
    brand_mismatch: "marca distinta",
    score_below_threshold: "score bajo",
    presentation_or_flavor_mismatch: "presentacion/sabor distinto",
    no_candidates: "sin candidatos",
  };

  return labels[reason] ?? reason;
}

function formatSourceStatus(status: SourceSearchStatus["status"]) {
  const labels: Record<SourceSearchStatus["status"], string> = {
    success: "OK",
    failed: "Error",
    timeout: "Timeout",
    no_results: "Sin datos",
  };

  return labels[status];
}

function formatPendingStatus(status: PendingSourceStatus["status"]) {
  const labels: Record<PendingSourceStatus["status"], string> = {
    pending: "Pendiente",
    requires_login: "Requiere login",
    not_configured: "No configurada",
    no_public_catalog: "Sin catalogo publico",
    no_public_prices: "Sin precios publicos",
    out_of_scope: "Fuera de alcance",
  };

  return labels[status];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeColumnName(value: string | number | null) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumn(headers: string[], candidates: string[]) {
  return headers.findIndex((header) =>
    candidates.some(
      (candidate) => header === candidate || header.includes(candidate),
    ),
  );
}

function readCell(row: Array<string | number | null>, columnIndex: number) {
  if (columnIndex < 0) {
    return "";
  }

  return String(row[columnIndex] ?? "").trim();
}

function cleanSpreadsheetIdentifier(value: string) {
  const cleaned = value.replace(/\D/g, "");
  return cleaned === "0" ? "" : cleaned;
}

function parseSpreadsheetAmount(value: string) {
  const cleaned = value
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/(?!^)-/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") {
    return undefined;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator =
    lastComma > lastDot && cleaned.length - lastComma <= 3
      ? ","
      : lastDot > lastComma && cleaned.length - lastDot <= 3
        ? "."
        : null;
  let normalized = cleaned;

  if (decimalSeparator === ",") {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (decimalSeparator === ".") {
    normalized = cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned.replace(/[.,]/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function formatCurrency(value: number | null | undefined) {
  return normalizeOptionalNumber(value) === null
    ? "-"
    : currencyFormatter.format(value as number);
}

function formatCsvAmount(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}

function parseNumberOrText(value: string | undefined) {
  if (!value) {
    return "";
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : value;
}

function csvEscape(value: string | number) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
