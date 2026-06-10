"use client";

import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { compareSourcePriority } from "@/lib/source-priority";
import type {
  ProductSearchResult,
  SearchResponse,
  SourceSearchStatus,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

type ComparablePrice = {
  price: number;
  comparisonPrice?: number | null;
  priceCondition?: string | null;
  alternatePrices?: Array<{
    label: string;
    price: number;
    comparisonPrice?: number | null;
  }>;
  packageQuantity?: number | null;
  packageLabel?: string | null;
};

export default function BusquedaGeneralPage() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setError("Ingresá al menos 2 caracteres para buscar.");
      return;
    }

    setQuery(trimmedQuery);
    setError(null);
    setIsLoading(true);

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
        throw new Error(payload.error ?? "No se pudo completar la búsqueda.");
      }

      setResponse(payload as SearchResponse);
    } catch (caughtError) {
      setResponse(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo completar la búsqueda.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setResponse(null);
    setError(null);
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
            Búsqueda general
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/88 sm:text-base">
            Buscá un producto puntual por nombre, código, SKU o EAN y revisá
            resultados vivos de las fuentes configuradas.
          </p>
        </div>
      </section>

      <section className="flex w-full flex-col gap-4 px-3 py-4 sm:px-4 md:py-5 lg:px-6">
        <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-[#17202a]">
              Buscar producto
            </h2>
            <p className="text-sm text-[#5d6b7a]">
              Usá esta página para búsquedas puntuales, no para importar una
              lista completa.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-4 flex flex-col gap-2 lg:flex-row"
          >
            <label className="relative flex-1">
              <span className="sr-only">Buscar producto</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8a96a3]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ej: Tatin negro 33g, 7790040331204, salsa pizza"
                className="h-12 w-full rounded-md border border-[#d9dee7] bg-[#fffdfa] pl-10 pr-11 text-base font-medium text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
              />
              {query.length > 0 ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#667789] transition hover:bg-[#f0f3f7] hover:text-[#17202a]"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#153d7b] px-5 text-sm font-bold text-white transition hover:bg-[#0f3165] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Search aria-hidden="true" className="h-4 w-4" />
              )}
              {isLoading ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {error ? (
            <div className="mt-3 rounded-md border border-[#f5c9c1] bg-[#fff2f0] px-3 py-2 text-sm font-semibold text-[#9b2f1c]">
              {error}
            </div>
          ) : null}
        </section>

        {response ? <GeneralSearchResults response={response} /> : null}
      </section>
    </main>
  );
}

function GeneralSearchResults({ response }: { response: SearchResponse }) {
  return (
    <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-[#17202a]">
          Resultados para "{response.query}"
        </h2>
        <p className="text-sm text-[#667789]">
          {response.results.length} productos encontrados ·{" "}
          {formatDurationMs(response.durationMs)}
        </p>
      </div>

      {response.results.length === 0 ? (
        <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-5 py-8 text-center text-sm text-[#526170]">
          No se encontraron productos con coincidencia suficiente.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {response.results.map((product) => (
            <ProductResultCard key={productKey(product)} product={product} />
          ))}
        </div>
      )}

      <SourceStatusList sources={response.sources} />
    </section>
  );
}

function ProductResultCard({ product }: { product: ProductSearchResult }) {
  return (
    <article className="flex min-h-[240px] flex-col justify-between rounded-md border border-[#d9dee7] bg-white p-3 shadow-sm">
      <div>
        <div className="flex gap-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md border border-[#d9dee7] object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f8fafc] text-xs font-semibold text-[#8a96a3]">
              Sin foto
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#667789]">
              {product.storeName}
            </div>
            <h3 className="mt-1 line-clamp-3 text-sm font-bold leading-5 text-[#17202a]">
              {product.rawName}
            </h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded bg-[#edf1f5] px-2 py-0.5 text-[11px] font-semibold text-[#526170]">
                {product.storeType}
              </span>
              {product.brand ? (
                <span className="rounded bg-[#fff8f2] px-2 py-0.5 text-[11px] font-semibold text-[#7a4a16]">
                  {product.brand}
                </span>
              ) : null}
              <span className="rounded bg-[#f4fbf7] px-2 py-0.5 text-[11px] font-semibold text-[#16613c]">
                score {product.confidenceScore}
              </span>
            </div>
          </div>
        </div>

        <PriceBreakdown product={product} />
      </div>

      {product.productUrl ? (
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 text-sm font-semibold text-[#153d7b] transition hover:border-[#153d7b] hover:bg-[#f5f8ff]"
        >
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          Ver producto
        </a>
      ) : null}
    </article>
  );
}

function PriceBreakdown({ product }: { product: ProductSearchResult }) {
  const packageDescriptor =
    product.packageQuantity && product.packageQuantity > 1
      ? product.packageLabel ?? `pack x ${product.packageQuantity}`
      : null;
  const alternatePrices = getAlternatePriceLabels(product);
  const hasBultoCondition = Boolean(
    product.priceCondition && /bulto|caja|pack/i.test(product.priceCondition),
  );

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-md border border-[#dbe7df] bg-[#f4fbf7] px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
          Unidad
        </div>
        <div className="mt-1 text-base font-extrabold text-[#173d2f]">
          {formatComparableCurrency(product)}
        </div>
        <div className="mt-1 text-xs leading-4 text-[#667789]">
          precio unitario o equivalente
        </div>
      </div>

      <div className="rounded-md border border-[#eadbd3] bg-[#fff8f2] px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
          Bulto / pack
        </div>
        {packageDescriptor || hasBultoCondition ? (
          <>
            <div className="mt-1 text-base font-extrabold text-[#7a4a16]">
              {currencyFormatter.format(product.price)}
            </div>
            <div className="mt-1 text-xs leading-4 text-[#667789]">
              {product.priceCondition ?? packageDescriptor}
            </div>
          </>
        ) : (
          <>
            <div className="mt-1 text-base font-extrabold text-[#83909d]">
              -
            </div>
            <div className="mt-1 text-xs leading-4 text-[#667789]">
              no informado por la fuente
            </div>
          </>
        )}
      </div>

      {alternatePrices.length > 0 ? (
        <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2 sm:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Otros precios
          </div>
          <div className="mt-1 space-y-1 text-xs leading-4 text-[#667789]">
            {alternatePrices.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourceStatusList({ sources }: { sources: SourceSearchStatus[] }) {
  if (sources.length === 0) {
    return null;
  }

  const sortedSources = sortSourcesForDisplay(sources);

  return (
    <details className="mt-5 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-[#17202a]">
        Fuentes consultadas ({sources.length})
      </summary>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {sortedSources.map((source) => (
          <div
            key={source.sourceId}
            className="rounded-md border border-[#e5e9ef] bg-white px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#17202a]">
                  {source.storeName}
                </div>
                <div className="mt-0.5 text-xs text-[#667789]">
                  {source.resultsCount} resultados ·{" "}
                  {formatDurationMs(source.durationMs)}
                </div>
              </div>
              <span className={statusClassName(source.status)}>
                {source.status}
              </span>
            </div>
            {source.errorMessage ? (
              <div className="mt-2 text-xs leading-4 text-[#8f2d20]">
                {source.errorMessage}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function sortSourcesForDisplay(sources: SourceSearchStatus[]) {
  return [...sources].sort((first, second) => {
    const firstHasData = first.status === "success" && first.resultsCount > 0;
    const secondHasData = second.status === "success" && second.resultsCount > 0;

    if (firstHasData !== secondHasData) {
      return firstHasData ? -1 : 1;
    }

    const priority = compareSourcePriority(first, second);

    if (priority !== 0) {
      return priority;
    }

    if (first.storeType !== second.storeType) {
      return first.storeType === "mayorista" ? -1 : 1;
    }

    return first.storeName.localeCompare(second.storeName, "es");
  });
}

function getComparablePrice(price: ComparablePrice) {
  return normalizeOptionalNumber(price.comparisonPrice) ?? price.price;
}

function formatComparableCurrency(price: ComparablePrice) {
  return currencyFormatter.format(getComparablePrice(price));
}

function getAlternatePriceLabels(price: ComparablePrice) {
  return (price.alternatePrices ?? [])
    .filter(
      (alternatePrice) =>
        typeof alternatePrice.price === "number" &&
        Number.isFinite(alternatePrice.price) &&
        alternatePrice.price > 0,
    )
    .map(
      (alternatePrice) =>
        `${alternatePrice.label}: ${currencyFormatter.format(alternatePrice.price)}`,
    );
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDurationMs(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
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

function productKey(product: ProductSearchResult) {
  return [
    product.sourceId,
    product.productUrl,
    product.rawName,
    product.price,
  ].join("|");
}
