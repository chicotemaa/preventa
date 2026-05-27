"use client";

import {
  AlertTriangle,
  ArrowDownUp,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import type {
  PendingSourceStatus,
  PriceListInputItem,
  PriceListItemResult,
  PriceListResponse,
  ProductSearchResult,
  SearchResponse,
  SourceSearchStatus,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const defaultRegion = {
  name: "Argentina",
  scopeLabel: "Alcance nacional",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    <main className="min-h-screen bg-[#f6f7f9]">
      <section className="border-b border-[#d9dee7] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#51606f]">
              Informe nacional
            </p>
            <h1 className="text-3xl font-semibold text-[#17202a] md:text-4xl">
              Comparador nacional de precios
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-[#5d6b7a]">
              Informe de precios para preventistas con alcance nacional. Busca
              sobre el último scrapeo server-side de marcas Bon o Bon, Cofler,
              Bagley, Arcor, Topline, Mogul, Tofi, Aguila, Rocklets,
              Tortuguita, Cabsha, Simple y La Serenisima.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 md:flex-row"
          >
            <label className="relative flex-1">
              <span className="sr-only">Buscar producto</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#667789]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Marca, SKU, codigo de barras, descripcion o nombre"
                className="h-14 w-full rounded-md border border-[#b8c2cf] bg-white pl-12 pr-4 text-lg text-[#17202a] outline-none transition focus:border-[#1d5f8f] focus:ring-4 focus:ring-[#1d5f8f]/15"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-md bg-[#1d5f8f] px-6 font-semibold text-white transition hover:bg-[#164d74] disabled:cursor-not-allowed disabled:bg-[#8da9bd]"
            >
              {isLoading ? (
                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              ) : (
                <Search aria-hidden="true" className="h-5 w-5" />
              )}
              {isLoading ? "Buscando..." : "Buscar"}
            </button>
          </form>

          <PriceListImport />
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 md:px-8">
        {error ? (
          <div className="rounded-md border border-[#e0b4ad] bg-[#fff1ef] px-4 py-3 text-[#8f2d20]">
            {error}
          </div>
        ) : null}

        {failedSources.length > 0 ? (
          <div className="flex gap-3 rounded-md border border-[#f0d898] bg-[#fff8e6] px-4 py-3 text-sm text-[#73510b]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {failedSources.length} fuentes no pudieron consultarse.
              El detalle queda debajo de los resultados.
            </span>
          </div>
        ) : null}

        {response ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
              <div>
                <h2 className="text-xl font-semibold text-[#17202a]">
                  Resultados para "{response.query}"
                </h2>
                <p className="text-sm text-[#5d6b7a]">
                  {response.results.length} productos encontrados en el
                  informe nacional actual
                </p>
                {response.catalog ? (
                  <p className="mt-1 text-sm text-[#5d6b7a]">
                    Snapshot: {response.catalog.productsCount} productos ·{" "}
                    {response.catalog.lastSyncedAt
                      ? new Date(response.catalog.lastSyncedAt).toLocaleString(
                          "es-AR",
                        )
                    : "sin sincronizar"}{" "}
                    · {regionLabel(response.catalog.region ?? defaultRegion)} ·
                    estado {response.catalog.status}
                  </p>
                ) : null}
              </div>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-[#36536f]">
                <ArrowDownUp className="h-4 w-4" />
                Ordenado por mejor precio
              </div>
            </div>

            {response.results.length === 0 ? (
              <div className="rounded-md border border-[#d9dee7] bg-white px-5 py-10 text-center text-[#526170]">
                No se encontraron productos con coincidencia suficiente.
              </div>
            ) : (
              <>
                <ResultsTable results={response.results} />
                <ResultsCards results={response.results} />
              </>
            )}

            <div className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-[#17202a]">
                Fuentes activas
              </h3>
              <SourceSummary response={response} />
            </div>

            {response.catalog?.pendingSources.length ? (
              <div className="flex flex-col gap-3">
                <h3 className="text-base font-semibold text-[#17202a]">
                  Integraciones pendientes
                </h3>
                <PendingSources sources={response.catalog.pendingSources} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-[#d9dee7] bg-white px-5 py-10 text-center text-[#526170]">
            Ingresá una búsqueda para comparar precios en fuentes activas.
            <span className="mt-2 block text-sm">
              Alcance: {regionLabel(defaultRegion)}.
            </span>
          </div>
        )}
      </section>
    </main>
  );
}

function PriceListImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [response, setResponse] = useState<PriceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#17202a]">
            <FileSpreadsheet className="h-5 w-5 text-[#1d5f8f]" />
            Evaluar lista de articulos
          </h2>
          <p className="mt-1 text-sm text-[#5d6b7a]">
            Formato esperado: Rubro, Descripcion Larga, Codigo, EAN 13 DI y
            EAN 13 BU.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#b8c2cf] bg-white px-4 text-sm font-semibold text-[#17202a] transition hover:border-[#1d5f8f]">
            <Upload className="h-4 w-4" />
            Importar Excel/CSV
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
            onClick={() => response && downloadPriceListCsv(response)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1d5f8f] px-4 text-sm font-semibold text-white transition hover:bg-[#164d74] disabled:cursor-not-allowed disabled:bg-[#8da9bd]"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </button>
        </div>
      </div>

      {fileName ? (
        <p className="mt-3 text-sm text-[#5d6b7a]">
          {fileName} {itemsCount > 0 ? `· ${itemsCount} articulos` : ""}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-[#d9dee7] bg-white px-4 py-3 text-sm text-[#526170]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Evaluando precios...
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-md border border-[#e0b4ad] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
          {error}
        </div>
      ) : null}

      {response ? <PriceListResults response={response} /> : null}
    </div>
  );
}

function PriceListResults({ response }: { response: PriceListResponse }) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Articulos" value={response.itemsCount} />
        <Metric label="Con precio" value={response.matchedCount} />
        <Metric label="Sin precio" value={response.unmatchedCount} />
        <Metric label="Fuentes" value={response.sources.length} />
      </div>
      <div className="overflow-x-auto rounded-md border border-[#d9dee7] bg-white">
        <table className="min-w-[1200px] border-collapse text-left text-xs">
          <thead className="bg-[#edf1f5] uppercase tracking-[0.04em] text-[#526170]">
            <tr>
              <th className="px-3 py-3">Rubro</th>
              <th className="px-3 py-3">Descripcion larga</th>
              <th className="px-3 py-3">Codigo</th>
              <th className="px-3 py-3">EAN 13 DI</th>
              <th className="px-3 py-3">Mejor precio</th>
              <th className="px-3 py-3">Fuente</th>
              <th className="px-3 py-3">Producto detectado</th>
              {response.sources.map((source) => (
                <th key={source.sourceId} className="px-3 py-3">
                  {source.storeName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9ef]">
            {response.results.map((result) => (
              <PriceListRow
                key={`${result.input.rowNumber}-${result.input.code ?? ""}`}
                result={result}
                sources={response.sources}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-white p-3">
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
  const pricesBySource = new Map(
    result.sourcePrices.map((sourcePrice) => [sourcePrice.sourceId, sourcePrice]),
  );

  return (
    <tr className="align-top">
      <td className="max-w-[190px] px-3 py-3 font-medium text-[#17202a]">
        {result.input.rubro || "-"}
      </td>
      <td className="max-w-[280px] px-3 py-3 text-[#17202a]">
        {result.input.description || "-"}
      </td>
      <td className="px-3 py-3 text-[#526170]">{result.input.code || "-"}</td>
      <td className="px-3 py-3 text-[#526170]">{result.input.ean13Di || "-"}</td>
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
            <div className="text-[#667789]">
              Score {result.bestSource.confidenceScore}
            </div>
          </div>
        ) : (
          <span className="text-[#8f2d20]">Sin coincidencia</span>
        )}
      </td>
      <td className="max-w-[260px] px-3 py-3 text-[#17202a]">
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
      {sources.map((source) => {
        const sourcePrice = pricesBySource.get(source.sourceId);

        return (
          <td key={source.sourceId} className="px-3 py-3">
            {sourcePrice ? (
              <div>
                <div className="font-semibold text-[#173d2f]">
                  {currencyFormatter.format(sourcePrice.price)}
                </div>
                <div className="mt-1 max-w-[180px] text-[#667789]">
                  {sourcePrice.productName}
                </div>
              </div>
            ) : (
              <span className="text-[#9aa5b1]">-</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function regionLabel(region: {
  name: string;
  scopeLabel?: string;
  provinces?: string[];
}) {
  if (region.scopeLabel) {
    return `${region.name}: ${region.scopeLabel}`;
  }

  return `${region.name}: ${(region.provinces ?? []).join(", ")}`;
}

function PendingSources({ sources }: { sources: PendingSourceStatus[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {sources.map((source) => (
        <div
          key={source.sourceId}
          className="rounded-md border border-[#d9dee7] bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[#17202a]">{source.storeName}</span>
            <span className="rounded bg-[#eef1f4] px-2 py-1 text-xs font-semibold text-[#526170]">
              {pendingStatusLabel(source.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#5d6b7a]">{source.storeType}</p>
          <p className="mt-2 text-xs leading-5 text-[#5d6b7a]">
            {source.message}
          </p>
        </div>
      ))}
    </div>
  );
}

function SourceSummary({ response }: { response: SearchResponse }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {response.sources.map((source) => (
        <div
          key={source.sourceId}
          className="rounded-md border border-[#d9dee7] bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-[#17202a]">{source.storeName}</span>
            <span className={statusClassName(source.status)}>
              {sourceStatusLabel(source.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#5d6b7a]">
            {source.resultsCount} resultados · {source.durationMs} ms
          </p>
          <p className="mt-2 text-xs leading-5 text-[#5d6b7a]">
            Origen: {source.dataOrigin ?? "Catalogo publico configurado"}.
          </p>
          <p className="text-xs leading-5 text-[#5d6b7a]">
            Alcance: {source.sourceScope ?? "No especificado"}.
          </p>
          {source.sourceUrl ? (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-xs font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
            >
              Ver fuente
            </a>
          ) : null}
          {source.errorMessage ? (
            <p className="mt-2 text-xs leading-5 text-[#7a4f11]">
              {source.errorMessage}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ results }: { results: ProductSearchResult[] }) {
  return (
    <div className="hidden overflow-hidden rounded-md border border-[#d9dee7] bg-white md:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#edf1f5] text-xs uppercase tracking-[0.06em] text-[#526170]">
          <tr>
            <th className="px-4 py-3">Comercio</th>
            <th className="px-4 py-3">Marca</th>
            <th className="px-4 py-3">Producto</th>
            <th className="px-4 py-3">Precio</th>
            <th className="px-4 py-3">Score</th>
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
                {result.dataOrigin ? (
                  <div className="mt-1 max-w-[210px] text-xs leading-4 text-[#667789]">
                    {result.dataOrigin}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 font-medium text-[#36536f]">
                {result.brand ?? "-"}
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
                  <span className="line-clamp-2 text-[#17202a]">
                    {result.rawName}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-base font-semibold text-[#173d2f]">
                {currencyFormatter.format(result.price)}
              </td>
              <td className="px-4 py-3">{result.confidenceScore}</td>
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
                  <span className="text-[#83909d]">Sin link</span>
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
                {result.storeName} · {result.storeType}
              </div>
              {result.dataOrigin ? (
                <div className="mt-1 text-xs leading-4 text-[#667789]">
                  Origen: {result.dataOrigin}
                </div>
              ) : null}
              {result.brand ? (
                <div className="mt-1 text-sm font-semibold text-[#36536f]">
                  {result.brand}
                </div>
              ) : null}
              <h3 className="mt-1 text-base font-semibold text-[#17202a]">
                {result.rawName}
              </h3>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-lg font-semibold text-[#173d2f]">
              {currencyFormatter.format(result.price)}
            </span>
            <span className="text-sm text-[#526170]">
              Score {result.confidenceScore}
            </span>
          </div>
          {result.productUrl ? (
            <a
              href={result.productUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
            >
              Ver producto
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function statusClassName(status: SearchResponse["sources"][number]["status"]) {
  const base = "rounded px-2 py-1 text-xs font-semibold";

  if (status === "success") {
    return `${base} bg-[#e4f6ed] text-[#16613c]`;
  }

  if (status === "no_results") {
    return `${base} bg-[#eef1f4] text-[#526170]`;
  }

  return `${base} bg-[#fff1ef] text-[#8f2d20]`;
}

function sourceStatusLabel(status: SearchResponse["sources"][number]["status"]) {
  if (status === "success") {
    return "activa";
  }

  if (status === "no_results") {
    return "sin coincidencias";
  }

  if (status === "timeout") {
    return "timeout";
  }

  return "fallo";
}

function pendingStatusLabel(status: PendingSourceStatus["status"]) {
  if (status === "requires_login") {
    return "requiere acceso";
  }

  if (status === "no_public_prices") {
    return "sin precios";
  }

  if (status === "out_of_scope") {
    return "fuera de rubro";
  }

  return "sin catálogo";
}

function resultKey(result: ProductSearchResult) {
  return `${result.sourceId}-${result.normalizedName}-${result.price}`;
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

function downloadPriceListCsv(response: PriceListResponse) {
  const sourceHeaders = response.sources.map((source) => source.storeName);
  const headers = [
    "Rubro",
    "Descripcion Larga",
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Mejor precio",
    "Mejor fuente",
    "Producto detectado",
    "Score",
    "Query usada",
    ...sourceHeaders,
  ];
  const rows = response.results.map((result) => {
    const pricesBySource = new Map(
      result.sourcePrices.map((sourcePrice) => [
        sourcePrice.sourceId,
        sourcePrice.price.toFixed(2),
      ]),
    );

    return [
      result.input.rubro ?? "",
      result.input.description ?? "",
      result.input.code ?? "",
      result.input.ean13Di ?? "",
      result.input.ean13Bu ?? "",
      result.bestPrice === null ? "" : result.bestPrice.toFixed(2),
      result.bestSource?.storeName ?? "",
      result.bestSource?.productName ?? "",
      result.bestSource?.confidenceScore ?? "",
      result.queryUsed ?? "",
      ...response.sources.map((source) => pricesBySource.get(source.sourceId) ?? ""),
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
