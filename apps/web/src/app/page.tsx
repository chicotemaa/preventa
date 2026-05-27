"use client";

import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type {
  PriceListInputItem,
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
  ProductSearchResult,
  SearchResponse,
  SourceSearchStatus,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

type SourceTypeFilter = "all" | ProductSearchResult["storeType"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchSourceFilter, setSearchSourceFilter] =
    useState<SourceTypeFilter>("all");

  const failedSources = useMemo(
    () =>
      response?.sources.filter(
        (source) => source.status === "failed" || source.status === "timeout",
      ) ?? [],
    [response],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setError("Ingresá al menos 2 caracteres para buscar.");
      setResponse(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetch("/api/live-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: trimmedQuery }),
      });
      const payload = await result.json();

      if (!result.ok) {
        throw new Error(payload.error ?? "No se pudo completar la busqueda.");
      }

      setResponse(payload as SearchResponse);
    } catch (caughtError) {
      setResponse(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo completar la busqueda.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fff8f2]">
      <BrandHeader />

      <section className="relative overflow-hidden bg-[#153d7b] text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-35"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1800&q=80')",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[#143a78]/88"
        />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-7 px-5 py-10 md:grid-cols-[0.88fr_1.12fr] md:px-8 md:py-14">
          <div className="flex flex-col justify-center">
            <h1 className="max-w-xl text-4xl font-extrabold leading-[1.05] text-white md:text-5xl">
              Compará precios por lista
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-white/88">
              Importá una planilla y obtené el mejor precio disponible por
              artículo.
            </p>
          </div>

          <PriceListImport />
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 md:px-8">
        <section
          id="buscar"
          className="rounded-md border border-[#eadbd3] bg-white p-5 shadow-[0_14px_40px_rgba(77,41,25,0.08)]"
        >
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-base font-bold text-[#171717]">
                Buscar producto puntual
              </h2>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-4 flex flex-col gap-3 md:flex-row"
          >
            <label className="relative flex-1">
              <span className="sr-only">Buscar producto</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#df2e38]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Producto, codigo o EAN"
                className="h-12 w-full rounded-md border border-[#dec8bd] bg-[#fffdfa] pl-12 pr-4 text-base text-[#171717] outline-none transition focus:border-[#df2e38] focus:ring-4 focus:ring-[#df2e38]/15"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#275fbd] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(39,95,189,0.22)] transition hover:bg-[#173e83] disabled:cursor-not-allowed disabled:bg-[#9ba8bf]"
            >
              {isLoading ? (
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              ) : (
                <Search aria-hidden="true" className="h-5 w-5" />
              )}
              {isLoading ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {error ? (
            <div className="mt-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
              {error}
            </div>
          ) : null}

          {failedSources.length > 0 ? (
            <div className="mt-4 flex gap-3 rounded-md border border-[#f0d898] bg-[#fff8e6] px-4 py-3 text-sm text-[#73510b]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Algunas fuentes no respondieron. Los precios visibles son los
                disponibles en este momento.
              </span>
            </div>
          ) : null}

          {response ? (
            <SearchResults
              response={response}
              sourceFilter={searchSourceFilter}
              onSourceFilterChange={setSearchSourceFilter}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function BrandHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#f0e1da] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[76px] w-full max-w-6xl items-center justify-between gap-5 px-5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-[#df2e38] text-xl font-extrabold text-white shadow-[0_10px_24px_rgba(223,46,56,0.18)]">
            A
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-1/2 h-1 w-4 -translate-x-1/2 rounded bg-white"
            />
          </div>
          <div>
            <div className="text-xl font-extrabold leading-none text-[#171717]">
              ARA
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#df2e38]">
              Distribuidora RAP
            </div>
          </div>
        </div>

        <a
          href="#lista"
          className="hidden rounded-md bg-[#df2e38] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#bd1f2a] md:inline-flex"
        >
          Importar lista
        </a>
      </div>
    </header>
  );
}

function PriceListImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [response, setResponse] = useState<PriceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceTypeFilter>("all");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setFileName(file.name);
    setResponse(null);
    setError(null);
    setIsLoading(true);

    try {
      const items = await parsePriceListFile(file);

      if (items.length === 0) {
        throw new Error("No se encontraron articulos validos en la planilla.");
      }

      setItemsCount(items.length);
      const result = await fetch("/api/price-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });
      const payload = await result.json();

      if (!result.ok) {
        throw new Error(payload.error ?? "No se pudo evaluar la lista.");
      }

      setResponse(payload as PriceListResponse);
    } catch (caughtError) {
      setItemsCount(0);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo evaluar la lista.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section
      id="lista"
      className={`rounded-md border border-white/75 bg-white p-5 text-[#171717] shadow-[0_22px_60px_rgba(18,40,73,0.22)] ${
        response ? "md:col-span-2" : ""
      }`}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#171717]">
            <FileSpreadsheet className="h-5 w-5 text-[#df2e38]" />
            Importar lista de artículos
          </h2>
          <p className="mt-1 text-sm text-[#6f625d]">
            Excel o CSV con Rubro, Descripción Larga, Código y EAN.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#df2e38] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(223,46,56,0.22)] transition hover:bg-[#bd1f2a]">
            <Upload className="h-4 w-4" />
            Importar archivo
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
            onClick={() => response && downloadPriceListCsv(response, sourceFilter)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-4 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd] disabled:cursor-not-allowed disabled:text-[#a99f99]"
          >
            <Download className="h-4 w-4" />
            Descargar resultado
          </button>
        </div>
      </div>

      {fileName ? (
        <div className="mt-4 rounded-md bg-[#fff8f2] px-4 py-3 text-sm text-[#6f625d]">
          {fileName} {itemsCount > 0 ? `· ${itemsCount} articulos` : ""}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-[#eadbd3] bg-[#fffdfa] px-4 py-3 text-sm text-[#6f625d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Evaluando precios...
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
          {error}
        </div>
      ) : null}

      {response ? (
        <PriceListResults
          response={response}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
        />
      ) : null}
    </section>
  );
}

function PriceListResults({
  response,
  sourceFilter,
  onSourceFilterChange,
}: {
  response: PriceListResponse;
  sourceFilter: SourceTypeFilter;
  onSourceFilterChange: (filter: SourceTypeFilter) => void;
}) {
  const visibleSources = filterSourcesByType(response.sources, sourceFilter);
  const visibleResults = response.results.map((result) =>
    filterPriceListResultBySourceType(result, sourceFilter),
  );
  const matchedCount = visibleResults.filter(
    (result) => result.bestSource !== null,
  ).length;
  const reviewCount = visibleResults.filter(
    (result) =>
      result.bestSource !== null && result.bestSource.confidenceScore < 70,
  ).length;
  const updatedAt = formatDate(response.catalog.lastSyncedAt);

  return (
    <div className="mt-5 flex flex-col gap-4">
      <SourceTypeFilterControl
        value={sourceFilter}
        onChange={onSourceFilterChange}
      />

      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Artículos" value={response.itemsCount} />
        <Metric label="Con precio" value={matchedCount} />
        <Metric label="Sin precio" value={response.itemsCount - matchedCount} />
        <Metric label="A revisar" value={reviewCount} />
      </div>

      {updatedAt ? (
        <p className="text-sm text-[#5d6b7a]">Datos actualizados: {updatedAt}</p>
      ) : null}

      <div className="hidden overflow-x-auto rounded-md border border-[#d9dee7] bg-white md:block">
        <table className="min-w-[1120px] border-collapse text-left text-xs">
          <thead className="bg-[#edf1f5] uppercase tracking-[0.04em] text-[#526170]">
            <tr>
              <th className="px-3 py-3">Artículo</th>
              <th className="px-3 py-3">Código / EAN</th>
              <th className="px-3 py-3">Mejor precio</th>
              <th className="px-3 py-3">Comercio</th>
              <th className="px-3 py-3">Producto encontrado</th>
              {visibleSources.map((source, index) => (
                <th key={source.sourceId} className="px-3 py-3">
                  Comparación {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9ef]">
            {visibleResults.map((result) => (
              <PriceListRow
                key={`${result.input.rowNumber}-${result.input.code ?? ""}`}
                result={result}
                sources={visibleSources}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PriceListCards results={visibleResults} sources={visibleSources} />

      <SourcesDetails sources={visibleSources} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-[#17202a]">{value}</div>
    </div>
  );
}

function PriceListRow({
  result,
  sources,
}: {
  result: PriceListItemResult;
  sources: SourceSearchStatus[];
}) {
  const sourceComparisons = buildSortedSourceComparisons(result, sources);
  const shouldReview =
    result.bestSource !== null && result.bestSource.confidenceScore < 70;

  return (
    <tr className={result.bestSource ? "align-top" : "align-top bg-[#fff8f7]"}>
      <td className="max-w-[300px] px-3 py-3">
        <div className="font-medium text-[#17202a]">
          {result.input.description || "-"}
        </div>
        {result.input.rubro ? (
          <div className="mt-1 text-[#667789]">{result.input.rubro}</div>
        ) : null}
      </td>
      <td className="px-3 py-3 text-[#526170]">
        <div>{result.input.code || "-"}</div>
        <div className="mt-1">
          {result.input.ean13Di || result.input.ean13Bu || "-"}
        </div>
      </td>
      <td className="px-3 py-3 text-sm font-semibold text-[#173d2f]">
        {result.bestPrice === null
          ? "-"
          : currencyFormatter.format(result.bestPrice)}
      </td>
      <td className="px-3 py-3">
        {result.bestSource ? (
          <div>
            <div className="font-medium text-[#17202a]">
              {result.bestSource.storeName}
            </div>
            {shouldReview ? (
              <span className="mt-1 inline-flex rounded bg-[#fff8e6] px-2 py-1 text-[11px] font-semibold text-[#73510b]">
                Revisar
              </span>
            ) : null}
          </div>
        ) : (
          <span className="font-medium text-[#8f2d20]">Sin precio</span>
        )}
      </td>
      <td className="max-w-[280px] px-3 py-3 text-[#17202a]">
        {result.bestSource?.productUrl ? (
          <a
            href={result.bestSource.productUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
          >
            {result.bestSource.productName}
          </a>
        ) : (
          result.bestSource?.productName ?? "-"
        )}
      </td>
      {sourceComparisons.map(({ source, sourcePrice }) => {
        return (
          <td key={source.sourceId} className="px-3 py-3">
            {sourcePrice ? (
              <div title={sourcePrice.productName}>
                <div className="font-medium text-[#17202a]">
                  {sourcePrice.storeName}
                </div>
                <div className="mt-1 font-semibold text-[#173d2f]">
                  {currencyFormatter.format(sourcePrice.price)}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium text-[#83909d]">
                  {source.storeName}
                </div>
                <div className="mt-1 text-[#9aa5b1]">Sin precio</div>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function PriceListCards({
  results,
  sources,
}: {
  results: PriceListItemResult[];
  sources: SourceSearchStatus[];
}) {
  const sourceNames = new Map(
    sources.map((source) => [source.sourceId, source.storeName]),
  );

  return (
    <div className="grid gap-3 md:hidden">
      {results.map((result) => {
        const shouldReview =
          result.bestSource !== null && result.bestSource.confidenceScore < 70;

        return (
          <article
            key={`${result.input.rowNumber}-${result.input.code ?? ""}-card`}
            className={`rounded-md border p-4 ${
              result.bestSource
                ? "border-[#d9dee7] bg-white"
                : "border-[#edd0cb] bg-[#fff8f7]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[#17202a]">
                  {result.input.description || "Artículo sin descripción"}
                </h3>
                {result.input.rubro ? (
                  <p className="mt-1 text-sm text-[#667789]">
                    {result.input.rubro}
                  </p>
                ) : null}
              </div>
              {shouldReview ? (
                <span className="shrink-0 rounded bg-[#fff8e6] px-2 py-1 text-[11px] font-semibold text-[#73510b]">
                  Revisar
                </span>
              ) : null}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[#667789]">Código</dt>
                <dd className="mt-1 font-medium text-[#17202a]">
                  {result.input.code || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[#667789]">EAN</dt>
                <dd className="mt-1 font-medium text-[#17202a]">
                  {result.input.ean13Di || result.input.ean13Bu || "-"}
                </dd>
              </div>
            </dl>

            {result.bestSource ? (
              <div className="mt-4 rounded-md bg-[#f6f7f9] p-3">
                <div className="text-sm text-[#667789]">Mejor precio</div>
                <div className="mt-1 text-xl font-semibold text-[#173d2f]">
                  {currencyFormatter.format(result.bestSource.price)}
                </div>
                <div className="mt-1 text-sm font-medium text-[#17202a]">
                  {result.bestSource.storeName}
                </div>
                {result.bestSource.productUrl ? (
                  <a
                    href={result.bestSource.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-sm font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
                  >
                    Ver producto
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-medium text-[#8f2d20]">
                Sin precio disponible
              </div>
            )}

            {result.sourcePrices.length > 0 ? (
              <details className="mt-3 text-sm text-[#526170]">
                <summary className="cursor-pointer font-medium text-[#17202a]">
                  Ver precios por comercio
                </summary>
                <div className="mt-2 divide-y divide-[#e5e9ef] rounded-md border border-[#d9dee7] bg-white">
                  {buildSortedSourceComparisons(result, sources).map(
                    ({ source, sourcePrice }) => (
                      <div
                        key={`${result.input.rowNumber}-${source.sourceId}`}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span>
                          {sourcePrice
                            ? sourceNames.get(sourcePrice.sourceId) ??
                              sourcePrice.storeName
                            : source.storeName}
                        </span>
                        <span
                          className={
                            sourcePrice
                              ? "font-semibold text-[#173d2f]"
                              : "text-[#9aa5b1]"
                          }
                        >
                          {sourcePrice
                            ? currencyFormatter.format(sourcePrice.price)
                            : "-"}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function SearchResults({
  response,
  sourceFilter,
  onSourceFilterChange,
}: {
  response: SearchResponse;
  sourceFilter: SourceTypeFilter;
  onSourceFilterChange: (filter: SourceTypeFilter) => void;
}) {
  const updatedAt = formatDate(response.catalog?.lastSyncedAt ?? null);
  const visibleResults = filterResultsBySourceType(
    response.results,
    sourceFilter,
  );
  const visibleSources = filterSourcesByType(response.sources, sourceFilter);

  return (
    <div className="mt-5 flex flex-col gap-4">
      <SourceTypeFilterControl
        value={sourceFilter}
        onChange={onSourceFilterChange}
      />

      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <h3 className="text-lg font-semibold text-[#17202a]">
            Resultados para "{response.query}"
          </h3>
          <p className="text-sm text-[#5d6b7a]">
            {visibleResults.length} productos encontrados
            {updatedAt ? ` · actualizado ${updatedAt}` : ""}
          </p>
        </div>
      </div>

      {visibleResults.length === 0 ? (
        <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-5 py-8 text-center text-[#526170]">
          No se encontraron precios para esta búsqueda.
        </div>
      ) : (
        <>
          <ResultsTable results={visibleResults} />
          <ResultsCards results={visibleResults} />
        </>
      )}

      <SourcesDetails sources={visibleSources} />
    </div>
  );
}

function SourceTypeFilterControl({
  value,
  onChange,
}: {
  value: SourceTypeFilter;
  onChange: (filter: SourceTypeFilter) => void;
}) {
  const options: Array<{ value: SourceTypeFilter; label: string }> = [
    { value: "all", label: "Todas" },
    { value: "mayorista", label: "Mayoristas" },
    { value: "minorista", label: "Minoristas" },
  ];

  return (
    <div className="inline-flex w-full rounded-md border border-[#eadbd3] bg-[#fffdfa] p-1 sm:w-fit">
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-9 flex-1 rounded px-3 text-sm font-semibold transition sm:flex-none ${
              isActive
                ? "bg-[#171717] text-white"
                : "text-[#6f625d] hover:bg-white hover:text-[#171717]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SourcesDetails({ sources }: { sources: SourceSearchStatus[] }) {
  return (
    <details className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3 text-sm text-[#526170]">
      <summary className="cursor-pointer font-medium text-[#17202a]">
        Fuentes consultadas
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {sources.map((source) => (
          <div
            key={source.sourceId}
            className="rounded border border-[#d9dee7] bg-white px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              {source.sourceUrl ? (
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#17202a] underline-offset-2 hover:underline"
                >
                  {source.storeName}
                </a>
              ) : (
                <span className="font-medium text-[#17202a]">
                  {source.storeName}
                </span>
              )}
              <span className={statusClassName(source.status)}>
                {sourceStatusLabel(source.status)}
              </span>
            </div>
            <div className="mt-1 text-xs text-[#667789]">
              {source.sourceScope ?? source.storeType}
            </div>
            {source.dataOrigin ? (
              <p className="mt-1 text-xs leading-5 text-[#526170]">
                {source.dataOrigin}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function ResultsTable({ results }: { results: ProductSearchResult[] }) {
  return (
    <div className="hidden overflow-hidden rounded-md border border-[#d9dee7] bg-white md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#edf1f5] text-xs uppercase tracking-[0.06em] text-[#526170]">
          <tr>
            <th className="px-4 py-3">Comercio</th>
            <th className="px-4 py-3">Producto</th>
            <th className="px-4 py-3">Precio</th>
            <th className="px-4 py-3">Link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e9ef]">
          {results.map((result) => (
            <tr key={resultKey(result)} className="align-middle">
              <td className="px-4 py-3">
                <div className="font-medium text-[#17202a]">
                  {result.storeName}
                </div>
                <div className="text-xs text-[#667789]">{result.storeType}</div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {result.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.imageUrl}
                      alt=""
                      className="h-11 w-11 rounded-md border border-[#d9dee7] object-cover"
                    />
                  ) : null}
                  <div>
                    <div className="line-clamp-2 text-[#17202a]">
                      {result.rawName}
                    </div>
                    {result.brand ? (
                      <div className="mt-1 text-xs text-[#667789]">
                        {result.brand}
                      </div>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-base font-semibold text-[#173d2f]">
                {currencyFormatter.format(result.price)}
              </td>
              <td className="px-4 py-3">
                {result.productUrl ? (
                  <a
                    href={result.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
                  >
                    Ver
                  </a>
                ) : (
                  <span className="text-[#83909d]">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultsCards({ results }: { results: ProductSearchResult[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {results.map((result) => (
        <article
          key={resultKey(result)}
          className="rounded-md border border-[#d9dee7] bg-white p-4"
        >
          <div className="flex gap-3">
            {result.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt=""
                className="h-16 w-16 rounded-md border border-[#d9dee7] object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[#526170]">
                {result.storeName}
              </div>
              <h3 className="mt-1 text-base font-semibold text-[#17202a]">
                {result.rawName}
              </h3>
              {result.brand ? (
                <div className="mt-1 text-sm text-[#667789]">
                  {result.brand}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-lg font-semibold text-[#173d2f]">
              {currencyFormatter.format(result.price)}
            </span>
            {result.productUrl ? (
              <a
                href={result.productUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
              >
                Ver producto
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function statusClassName(status: SourceSearchStatus["status"]) {
  const base = "rounded px-2 py-1 text-[11px] font-semibold";

  if (status === "success") {
    return `${base} bg-[#e4f6ed] text-[#16613c]`;
  }

  if (status === "no_results") {
    return `${base} bg-[#eef1f4] text-[#526170]`;
  }

  return `${base} bg-[#fff1ef] text-[#8f2d20]`;
}

function sourceStatusLabel(status: SourceSearchStatus["status"]) {
  if (status === "success") {
    return "ok";
  }

  if (status === "no_results") {
    return "sin precio";
  }

  if (status === "timeout") {
    return "timeout";
  }

  return "no disponible";
}

function resultKey(result: ProductSearchResult) {
  return `${result.sourceId}-${result.normalizedName}-${result.price}`;
}

function filterSourcesByType(
  sources: SourceSearchStatus[],
  sourceFilter: SourceTypeFilter,
) {
  if (sourceFilter === "all") {
    return sources;
  }

  return sources.filter((source) => source.storeType === sourceFilter);
}

function filterResultsBySourceType(
  results: ProductSearchResult[],
  sourceFilter: SourceTypeFilter,
) {
  if (sourceFilter === "all") {
    return results;
  }

  return results.filter((result) => result.storeType === sourceFilter);
}

function filterPriceListResultBySourceType(
  result: PriceListItemResult,
  sourceFilter: SourceTypeFilter,
): PriceListItemResult {
  if (sourceFilter === "all") {
    return result;
  }

  const sourcePrices = result.sourcePrices
    .filter((sourcePrice) => sourcePrice.storeType === sourceFilter)
    .sort((first, second) => first.price - second.price);
  const bestSource = sourcePrices[0] ?? null;

  return {
    ...result,
    status: bestSource ? "matched" : "not_found",
    bestSource,
    bestPrice: bestSource?.price ?? null,
    sourcePrices,
    matchedCount: sourcePrices.length,
  };
}

function buildSortedSourceComparisons(
  result: PriceListItemResult,
  sources: SourceSearchStatus[],
) {
  const pricesBySource = new Map(
    result.sourcePrices.map((sourcePrice) => [
      sourcePrice.sourceId,
      sourcePrice,
    ]),
  );

  return sources
    .map((source) => ({
      source,
      sourcePrice: pricesBySource.get(source.sourceId) ?? null,
    }))
    .sort(compareSourceComparisons);
}

function compareSourceComparisons(
  first: {
    source: SourceSearchStatus;
    sourcePrice: PriceListSourcePrice | null;
  },
  second: {
    source: SourceSearchStatus;
    sourcePrice: PriceListSourcePrice | null;
  },
) {
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
      headers.some((header) => header === "codigo" || header === "code")
    );
  });

  if (headerIndex === -1) {
    throw new Error(
      "No se encontraron columnas Rubro, Descripcion Larga y Codigo.",
    );
  }

  const headers = rows[headerIndex].map((cell) => normalizeColumnName(cell));
  const rubroIndex = findColumn(headers, ["rubro"]);
  const descriptionIndex = findColumn(headers, [
    "descripcion larga",
    "descripcion",
    "description",
  ]);
  const codeIndex = findColumn(headers, ["codigo", "code"]);
  const eanDiIndex = findColumn(headers, ["ean 13 di", "ean13 di", "ean di"]);
  const eanBuIndex = findColumn(headers, ["ean 13 bu", "ean13 bu", "ean bu"]);

  return rows
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      rubro: readPriceListCell(row, rubroIndex),
      description: readPriceListCell(row, descriptionIndex),
      code: readPriceListCell(row, codeIndex),
      ean13Di: cleanSpreadsheetIdentifier(readPriceListCell(row, eanDiIndex)),
      ean13Bu: cleanSpreadsheetIdentifier(readPriceListCell(row, eanBuIndex)),
    }))
    .filter(
      (item) =>
        Boolean(item.description) ||
        Boolean(item.code) ||
        Boolean(item.ean13Di) ||
        Boolean(item.ean13Bu),
    );
}

function downloadPriceListCsv(
  response: PriceListResponse,
  sourceFilter: SourceTypeFilter,
) {
  const sources = filterSourcesByType(response.sources, sourceFilter);
  const results = response.results.map((result) =>
    filterPriceListResultBySourceType(result, sourceFilter),
  );
  const sourceHeaders = sources.map((_, index) => `Comparacion ${index + 1}`);
  const headers = [
    "Rubro",
    "Descripcion Larga",
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Estado",
    "Mejor precio",
    "Mejor fuente",
    "Producto encontrado",
    "Link producto",
    ...sourceHeaders,
  ];
  const rows = results.map((result) => {
    const comparisons = buildSortedSourceComparisons(result, sources);

    return [
      result.input.rubro ?? "",
      result.input.description ?? "",
      result.input.code ?? "",
      result.input.ean13Di ?? "",
      result.input.ean13Bu ?? "",
      result.status === "matched" ? "Con precio" : "Sin precio",
      result.bestPrice === null ? "" : result.bestPrice.toFixed(2),
      result.bestSource?.storeName ?? "",
      result.bestSource?.productName ?? "",
      result.bestSource?.productUrl ?? "",
      ...comparisons.map(({ source, sourcePrice }) =>
        sourcePrice
          ? `${sourcePrice.storeName}: ${sourcePrice.price.toFixed(2)}`
          : `${source.storeName}: Sin precio`,
      ),
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `precios-lista-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeColumnName(value: string | number | null) {
  return String(value ?? "")
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

function readPriceListCell(
  row: Array<string | number | null>,
  columnIndex: number,
) {
  if (columnIndex < 0) {
    return "";
  }

  return String(row[columnIndex] ?? "").trim();
}

function cleanSpreadsheetIdentifier(value: string) {
  const cleaned = value.replace(/\D/g, "");
  return cleaned === "0" ? "" : cleaned;
}

function csvEscape(value: string | number) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
