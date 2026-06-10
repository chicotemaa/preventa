"use client";

import {
  Download,
  FileSpreadsheet,
  Loader2,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { compareSourcePriority } from "@/lib/source-priority";
import type {
  CategoryBrandSummary,
  CategorySearchGroup,
  CategorySearchResponse,
  PriceListInputItem,
  PriceListItemResult,
  PriceListPersistenceResult,
  PriceListRejectedCandidate,
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
const percentFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const HIGH_PRICE_GAP_PERCENT = 12;
const OPPORTUNITY_GAP_PERCENT = -8;
const AGUIAR_TOKIN_SOURCE_ID = "aguiar-arcor-resistencia";
const quickCategoryQueries = [
  { name: "Alfajores", helper: "Triples, simples y mini tortas" },
  { name: "Jugos en polvo", helper: "Sobres y packs por caja" },
  { name: "Galletitas", helper: "Dulces, crackers y surtidos" },
  { name: "Mermeladas", helper: "Frascos y presentaciones light" },
  { name: "Chocolates", helper: "Tabletas, baños y rellenos" },
  { name: "Salsas y aderezos", helper: "Salsas, mayonesas y ketchup" },
  { name: "Cereales y barritas", helper: "Cereal Mix y barras" },
  { name: "Golosinas", helper: "Caramelos, gomitas y chupetines" },
];

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

type SourceTypeFilter = "all" | ProductSearchResult["storeType"];
type PriceListItemFilter = "all" | "matched" | "not_found";
type PriceListEditableField = "currentPrice";
type PriceDecisionStatus =
  | "ready"
  | "review_match"
  | "no_reference"
  | "missing_own_price"
  | "above_reference"
  | "opportunity";

type PriceDecisionAnalysis = {
  result: PriceListItemResult;
  status: PriceDecisionStatus;
  statusLabel: string;
  currentPrice: number | null;
  referencePrice: number | null;
  gapPercent: number | null;
  suggestedPrice: number | null;
};

type WeeklyAnalysis = {
  total: number;
  withReference: number;
  withoutReference: number;
  withOwnPrice: number;
  opportunities: number;
  aboveReference: number;
  ready: number;
  review: number;
  decisions: PriceDecisionAnalysis[];
  statusCounts: Array<{
    status: PriceDecisionStatus;
    label: string;
    count: number;
  }>;
  rubros: Array<{
    rubro: string;
    total: number;
    withReference: number;
    withoutReference: number;
    opportunities: number;
  }>;
  topGaps: PriceDecisionAnalysis[];
};

type SourceCoverage = {
  totalSources: number;
  sourcesWithData: number;
  sourcesWithoutData: number;
  mayoristaSources: number;
  minoristaSources: number;
  mayoristaSourcesWithData: number;
  minoristaSourcesWithData: number;
};

type PriceListFilterCounts = Record<PriceListItemFilter, number>;

function getComparablePrice(price: ComparablePrice) {
  return normalizeOptionalNumber(price.comparisonPrice) ?? price.price;
}

function formatComparableCurrency(price: ComparablePrice) {
  return currencyFormatter.format(getComparablePrice(price));
}

function getPackagePriceLabel(price: ComparablePrice) {
  if (!price.packageQuantity || price.packageQuantity <= 1) {
    return null;
  }

  return `${price.packageLabel ?? `pack x ${price.packageQuantity}`}: ${currencyFormatter.format(price.price)}`;
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

function UnitPriceDetail({ price }: { price: ComparablePrice }) {
  const packageLabel = getPackagePriceLabel(price);
  const alternatePrices = getAlternatePriceLabels(price);

  if (!packageLabel && !price.priceCondition && alternatePrices.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 text-xs font-normal leading-4 text-[#667789]">
      {price.priceCondition ? <div>{price.priceCondition}</div> : null}
      {packageLabel ? <div>Unitario. {packageLabel}</div> : null}
      {alternatePrices.map((label) => (
        <div key={label}>{label}</div>
      ))}
    </div>
  );
}

function formatSourceCsvPrice(sourcePrice: PriceListSourcePrice) {
  const unitPrice = getComparablePrice(sourcePrice).toFixed(2);
  const packageLabel = getPackagePriceLabel(sourcePrice);
  const details = [
    sourcePrice.priceCondition,
    packageLabel ? `unitario (${packageLabel})` : null,
    ...getAlternatePriceLabels(sourcePrice),
  ].filter(Boolean);

  return details.length > 0
    ? `${sourcePrice.storeName}: ${unitPrice} (${details.join("; ")})`
    : `${sourcePrice.storeName}: ${unitPrice}`;
}

export default function Home() {
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
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[#143a78]/88"
        />
        <div className="relative mx-auto flex w-full max-w-[1800px] flex-col gap-2 px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl lg:text-4xl">
            Explorador de categorías
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/88 sm:text-base">
            Elegí una familia para ver primero el surtido de Aguiar/Tokin y
            después productos equivalentes de la competencia.
          </p>
        </div>
      </section>

      <section className="flex w-full flex-col gap-4 px-3 py-4 sm:px-4 md:py-5 lg:px-6">
        <LiveProductSearch />
      </section>
    </main>
  );
}

function LiveProductSearch() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<CategorySearchResponse | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function runCategorySearch(rawQuery: string) {
    const trimmedQuery = rawQuery.trim();

    if (trimmedQuery.length < 2) {
      setError("Ingresá al menos 2 caracteres para buscar.");
      return;
    }

    setQuery(trimmedQuery);
    setError(null);
    setIsLoading(true);

    try {
      const result = await fetch("/api/category-search", {
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

      const categoryResponse = payload as CategorySearchResponse;
      setResponse(categoryResponse);
      setSelectedGroupId(
        categoryResponse.groups.length === 1
          ? categoryResponse.groups[0]?.id ?? null
          : null,
      );
    } catch (caughtError) {
      setResponse(null);
      setSelectedGroupId(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo completar la búsqueda.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCategorySearch(query);
  }

  function clearSearch() {
    setQuery("");
    setResponse(null);
    setSelectedGroupId(null);
    setError(null);
  }

  return (
    <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-[#17202a]">
          Buscar individual
        </h2>
        <p className="text-sm text-[#5d6b7a]">
          Escribí o elegí una familia para ver productos de Tokin/Aguiar y
          compararlos contra la competencia.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col gap-2 lg:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">Buscar rubro</span>
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8a96a3]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej: alfajor, jugo en polvo, galletitas, mermelada"
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

      {isLoading ? (
        <CategorySearchLoading query={query} />
      ) : response ? (
        <CategorySearchResults
          response={response}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
        />
      ) : (
        <SuggestedCategoryGrid
          onSelectCategory={(categoryName) => void runCategorySearch(categoryName)}
        />
      )}
    </section>
  );
}

function SuggestedCategoryGrid({
  onSelectCategory,
}: {
  onSelectCategory: (categoryName: string) => void;
}) {
  return (
    <div className="mt-5 border-t border-[#e5e9ef] pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-[#17202a]">
          Familias sugeridas
        </h3>
        <p className="text-sm text-[#667789]">
          Accesos rápidos para abrir rubros completos sin escribir.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {quickCategoryQueries.map((categoryQuery) => (
          <button
            key={categoryQuery.name}
            type="button"
            onClick={() => onSelectCategory(categoryQuery.name)}
            className="min-h-[76px] rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 py-3 text-left transition hover:border-[#153d7b] hover:bg-[#f5f8ff]"
          >
            <span className="block text-sm font-bold text-[#17202a]">
              {categoryQuery.name}
            </span>
            <span className="mt-1 block text-xs leading-4 text-[#667789]">
              {categoryQuery.helper}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CategorySearchLoading({ query }: { query: string }) {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-4 text-sm font-semibold text-[#526170]">
      <Loader2 className="h-5 w-5 animate-spin text-[#153d7b]" />
      <span>Buscando productos de {query}...</span>
    </div>
  );
}

function PriceListImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [response, setResponse] = useState<PriceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingForEvolution, setIsSavingForEvolution] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceTypeFilter>("all");
  const [persistForEvolution, setPersistForEvolution] = useState(false);

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
        body: JSON.stringify({ items, persist: persistForEvolution }),
      });
      const payload = await result.json();

      if (!result.ok) {
        throw new Error(payload.error ?? "No se pudo evaluar la lista.");
      }

      const priceListResponse = payload as PriceListResponse;
      setResponse(priceListResponse);
      logPriceListDebugToConsole(priceListResponse);
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

  async function handleSaveForEvolution() {
    if (!response || response.persistence?.saved) {
      return;
    }

    setIsSavingForEvolution(true);
    setError(null);

    try {
      const result = await fetch("/api/price-list/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ response }),
      });
      const payload = (await result.json()) as {
        error?: string;
        persistence?: PriceListPersistenceResult;
      };

      if (!result.ok) {
        throw new Error(payload.error ?? "No se pudo guardar la evaluacion.");
      }

      setResponse({
        ...response,
        persistence: payload.persistence ?? {
          enabled: false,
          requested: true,
          saved: false,
        },
      });
      setPersistForEvolution(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la evaluacion.",
      );
    } finally {
      setIsSavingForEvolution(false);
    }
  }

  function handleItemInputChange(
    rowNumber: number,
    field: PriceListEditableField,
    value: number | null,
  ) {
    setResponse((currentResponse) => {
      if (!currentResponse) {
        return currentResponse;
      }

      return {
        ...currentResponse,
        persistence: undefined,
        results: currentResponse.results.map((result) =>
          result.input.rowNumber === rowNumber
            ? {
                ...result,
                input: {
                  ...result.input,
                  [field]: value ?? undefined,
                },
              }
            : result,
        ),
      };
    });
  }

  return (
    <section
      id="lista"
      className="rounded-md border border-[#eadbd3] bg-white p-3 text-[#171717] shadow-[0_14px_40px_rgba(77,41,25,0.08)] sm:p-4 lg:p-5"
    >
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#171717]">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#df2e38]" />
            Importar lista de artículos
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6f625d]">
            Excel o CSV con Rubro, Descripción, Código y EAN. Opcional:
            Precio Aguiar. Si Aguiar no tiene precio, la celda queda vacía.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:shrink-0">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#df2e38] px-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(223,46,56,0.22)] transition hover:bg-[#bd1f2a] sm:h-11 sm:px-4">
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd] disabled:cursor-not-allowed disabled:text-[#a99f99] sm:h-11 sm:px-4"
          >
            <Download className="h-4 w-4" />
            Descargar resultado
          </button>
          <button
            type="button"
            disabled={!response}
            onClick={() => response && downloadAraUploadCsv(response, sourceFilter)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#275fbd] bg-[#f5f8ff] px-3 text-sm font-semibold text-[#173e83] transition hover:bg-[#eaf2ff] disabled:cursor-not-allowed disabled:border-[#dec8bd] disabled:bg-white disabled:text-[#a99f99] sm:h-11 sm:px-4"
          >
            <Download className="h-4 w-4" />
            Exportar para Aguiar
          </button>
          <button
            type="button"
            disabled={
              !response || response.persistence?.saved || isSavingForEvolution
            }
            onClick={() => void handleSaveForEvolution()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#173d2f] bg-[#f1fbf6] px-3 text-sm font-semibold text-[#173d2f] transition hover:bg-[#e4f6ed] disabled:cursor-not-allowed disabled:border-[#dec8bd] disabled:bg-white disabled:text-[#a99f99] sm:h-11 sm:px-4"
          >
            {isSavingForEvolution ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {response?.persistence?.saved ? "Guardado" : "Guardar evolución"}
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
            Activá esto solo cuando quieras dejar la lista como referencia
            semanal para comparar Aguiar y fuentes.
          </span>
        </span>
      </label>

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

      {response?.persistence?.saved ? (
        <div className="mt-4 rounded-md border border-[#b7e3ca] bg-[#eefaf3] px-4 py-3 text-sm text-[#16613c]">
          Carga guardada para evolución.{" "}
          <Link
            href="/evolucion"
            className="font-semibold underline-offset-2 hover:underline"
          >
            Ver evolución
          </Link>
        </div>
      ) : null}

      {response?.persistence?.requested &&
      response.persistence.errorMessage ? (
        <div className="mt-4 rounded-md border border-[#f0d898] bg-[#fff8e6] px-4 py-3 text-sm text-[#73510b]">
          La lista se evaluó, pero no se pudo guardar para evolución:{" "}
          {response.persistence.errorMessage}
        </div>
      ) : null}

      {response?.persistence?.requested &&
      !response.persistence.saved &&
      !response.persistence.errorMessage ? (
        <div className="mt-4 rounded-md border border-[#f0d898] bg-[#fff8e6] px-4 py-3 text-sm text-[#73510b]">
          La lista se evaluó, pero el guardado para evolución no está
          disponible en este entorno.
        </div>
      ) : null}

      {response && !response.persistence?.requested ? (
        <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3 text-sm text-[#526170]">
          Esta evaluación todavía no quedó guardada. Podés guardarla para
          evolución sin volver a importar la planilla.
        </div>
      ) : null}

      {response ? (
        <PriceListResults
          response={response}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          onItemInputChange={handleItemInputChange}
        />
      ) : null}
    </section>
  );
}

function CategorySearchResults({
  response,
  selectedGroupId,
  onSelectGroup,
}: {
  response: CategorySearchResponse;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
}) {
  const selectedGroup = selectedGroupId
    ? response.groups.find((group) => group.id === selectedGroupId) ?? null
    : null;

  return (
    <div className="mt-5 flex flex-col gap-4">
      {response.groups.length === 0 ? (
        <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-5 py-8 text-center text-[#526170]">
          No se encontraron rubros con productos para esta búsqueda.
        </div>
      ) : selectedGroup ? (
        <CategoryGroupDetail group={selectedGroup} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {response.groups.map((group) => {
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onSelectGroup(group.id)}
                className="rounded-md border border-[#d9dee7] bg-white p-4 text-left transition hover:border-[#153d7b]/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-[#17202a]">
                      {group.categoryName}
                    </h4>
                    <p className="mt-1 text-sm text-[#667789]">
                      {group.totalProducts} productos en el rubro ·{" "}
                      {group.tokinBrands.length} marcas Tokin ·{" "}
                      {group.competitorBrands.length} marcas competencia
                    </p>
                  </div>
                  <span className="rounded bg-[#edf1f5] px-2 py-1 text-xs font-semibold text-[#526170]">
                    Abrir
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded bg-white px-3 py-2">
                    <div className="text-xs font-semibold uppercase text-[#667789]">
                      Tokin / Aguiar
                    </div>
                    <div className="mt-1 font-bold text-[#173d2f]">
                      {group.tokinProducts.length}
                    </div>
                    <div className="text-xs text-[#667789]">
                      {formatCurrencyValue(group.minTokinPrice)}
                    </div>
                  </div>
                  <div className="rounded bg-white px-3 py-2">
                    <div className="text-xs font-semibold uppercase text-[#667789]">
                      Competencia
                    </div>
                    <div className="mt-1 font-bold text-[#173d2f]">
                      {group.competitorProducts.length}
                    </div>
                    <div className="text-xs text-[#667789]">
                      {formatCurrencyValue(group.minCompetitorPrice)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SourcesDetails sources={response.sources} />
    </div>
  );
}

function CategoryGroupDetail({ group }: { group: CategorySearchGroup }) {
  const hasTokinProducts = group.tokinProducts.length > 0;

  return (
    <div className="rounded-md border border-[#d9dee7] bg-[#fffdfa] p-3 sm:p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-[#17202a]">
          {group.categoryName}
        </h3>
        <p className="text-sm text-[#667789]">
          Vista de surtido por categoría. Acá no se fuerza un match exacto: se
          muestran los productos Tokin/Aguiar del rubro y después las
          alternativas de mercado.
        </p>
      </div>

      {!hasTokinProducts ? (
        <div className="mt-4 rounded-md border border-[#f0d898] bg-[#fff8e6] px-4 py-3 text-sm font-semibold text-[#73510b]">
          Tokin/Aguiar no devolvió productos para esta categoría en esta
          consulta. La comparación de competencia se muestra igual.
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        <CategoryProductsSection
          title="Tokin / Aguiar"
          subtitle="Productos disponibles en el catálogo B2B"
          products={group.tokinProducts}
          brands={group.tokinBrands}
          emptyMessage="No se encontraron productos Tokin para este rubro. Si esperabas datos de Aguiar, revisá que el worker tenga credenciales Tokin y catálogo sincronizado."
        />
        <CategoryProductsSection
          title="Competencia"
          subtitle="Mayoristas y minoristas consultados"
          products={group.competitorProducts}
          brands={group.competitorBrands}
          emptyMessage="No se encontraron productos de competencia para este rubro."
        />
      </div>
    </div>
  );
}

function CategoryProductsSection({
  title,
  subtitle,
  products,
  brands,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  products: ProductSearchResult[];
  brands: CategoryBrandSummary[];
  emptyMessage: string;
}) {
  return (
    <section className="min-w-0 rounded-md border border-[#e5e9ef] bg-white p-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-base font-bold text-[#17202a]">{title}</h4>
        <p className="text-sm text-[#667789]">
          {products.length} productos · {subtitle}
        </p>
      </div>

      {products.length === 0 ? (
        <div className="mt-3 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#526170]">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-3">
          <CategoryProductCards products={products} />
        </div>
      )}

      <BrandSummary brands={brands} />
    </section>
  );
}

function CategoryProductCards({ products }: { products: ProductSearchResult[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => (
        <CategoryProductCard key={resultKey(product)} product={product} />
      ))}
    </div>
  );
}

function CategoryProductCard({ product }: { product: ProductSearchResult }) {
  return (
    <article className="flex min-h-[250px] flex-col justify-between rounded-md border border-[#d9dee7] bg-white p-3 shadow-sm">
      <div>
        <div className="flex gap-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.rawName}
              className="h-20 w-20 shrink-0 rounded-md border border-[#d9dee7] object-contain"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f8fafc] text-xs font-semibold text-[#8a96a3]">
              Sin foto
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#667789]">
              {product.storeName}
            </div>
            <h5 className="mt-1 line-clamp-3 text-sm font-bold leading-5 text-[#17202a]">
              {product.rawName}
            </h5>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded bg-[#edf1f5] px-2 py-0.5 text-[11px] font-semibold text-[#526170]">
                {product.storeType}
              </span>
              {product.brand ? (
                <span className="rounded bg-[#fff8f2] px-2 py-0.5 text-[11px] font-semibold text-[#7a4a16]">
                  {product.brand}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <CategoryPriceBreakdown product={product} />
      </div>

      {product.productUrl ? (
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 text-sm font-semibold text-[#153d7b] transition hover:border-[#153d7b] hover:bg-[#f5f8ff]"
        >
          Ver producto
        </a>
      ) : null}
    </article>
  );
}

function CategoryPriceBreakdown({ product }: { product: ProductSearchResult }) {
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

function BrandSummary({ brands }: { brands: CategoryBrandSummary[] }) {
  if (brands.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
      {brands.map((brand) => (
        <div
          key={brand.brand}
          className="min-w-0 rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2"
        >
          <div className="truncate text-sm font-semibold text-[#17202a]">
            {brand.brand}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            {brand.productsCount} prod. · desde{" "}
            {formatCurrencyValue(brand.minPrice)}
          </div>
          <div className="mt-1 truncate text-xs text-[#83909d]">
            {brand.sourceNames.join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}

function PriceListResults({
  response,
  sourceFilter,
  onSourceFilterChange,
  onItemInputChange,
}: {
  response: PriceListResponse;
  sourceFilter: SourceTypeFilter;
  onSourceFilterChange: (filter: SourceTypeFilter) => void;
  onItemInputChange: (
    rowNumber: number,
    field: PriceListEditableField,
    value: number | null,
  ) => void;
}) {
  const [itemFilter, setItemFilter] = useState<PriceListItemFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const visibleSources = filterSourcesByType(
    response.sources.filter((source) => !isAguiarTokinSource(source.sourceId)),
    sourceFilter,
  );
  const sourceFilteredResults = response.results.map((result) =>
    filterPriceListResultBySourceType(result, sourceFilter),
  );
  const visibleResults = filterPriceListItems(
    sourceFilteredResults,
    itemFilter,
    searchTerm,
  );
  const filterCounts = buildPriceListFilterCounts(sourceFilteredResults);
  const tableMinWidth = Math.max(980, 520 + visibleSources.length * 178);

  return (
    <div className="mt-5 flex flex-col gap-4">
      <SourceTypeFilterControl
        value={sourceFilter}
        onChange={onSourceFilterChange}
      />

      <PriceListWorkbenchControls
        itemFilter={itemFilter}
        onItemFilterChange={setItemFilter}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        counts={filterCounts}
        visibleCount={visibleResults.length}
        totalCount={sourceFilteredResults.length}
      />

      {visibleResults.length > 0 ? (
        <>
          <div className="hidden w-full overflow-x-auto rounded-md border border-[#d9dee7] bg-white lg:block">
            <table
              className="w-full border-collapse text-left text-xs"
              style={{ minWidth: `${tableMinWidth}px` }}
            >
              <thead className="bg-[#edf1f5] uppercase tracking-[0.04em] text-[#526170]">
                <tr>
                  <th className="w-[280px] px-2.5 py-3">Artículo</th>
                  <th className="w-[140px] px-2.5 py-3">Código / EAN</th>
                  <th className="w-[145px] px-2.5 py-3">Precio Aguiar</th>
                  {visibleSources.length === 0 ? (
                    <th className="min-w-[170px] px-2.5 py-3">Fuentes</th>
                  ) : null}
                  {visibleSources.map((source, index) => (
                    <th key={source.sourceId} className="min-w-[170px] px-2.5 py-3">
                      Precio {index + 1}
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
                    onItemInputChange={onItemInputChange}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <PriceListCards
            results={visibleResults}
            sources={visibleSources}
            onItemInputChange={onItemInputChange}
          />
        </>
      ) : (
        <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-5 py-8 text-center text-sm text-[#526170]">
          No hay artículos para los filtros aplicados.
        </div>
      )}

      <SourcesDetails sources={visibleSources} />
      <MatchingDiagnostics response={response} />
    </div>
  );
}

function MatchingDiagnostics({ response }: { response: PriceListResponse }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const itemsToReview = response.results.filter(resultNeedsMatchingReview);
  const sourceProblems = getSourceProblems(response.sources);
  const summary = buildDebugSummary(response, itemsToReview, sourceProblems);

  async function copyDebugJson() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(buildDebugPayload(response), null, 2),
      );
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("failed");
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    }
  }

  return (
    <details
      open={itemsToReview.length > 0 || sourceProblems.length > 0}
      className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-3 text-sm text-[#526170] sm:px-4"
    >
      <summary className="cursor-pointer font-semibold text-[#17202a]">
        Depuración de búsqueda ({summary.totalIssues} alertas)
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <p className="text-sm leading-6 text-[#526170]">
            Este panel muestra consultas probadas, fuentes sin datos o con error
            y candidatos descartados. Descargá el JSON completo para pasarme el
            caso exacto sin perder contexto.
          </p>
          <div className="grid gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => downloadMatchingLogCsv(response)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd]"
            >
              <Download className="h-4 w-4" />
              CSV matching
            </button>
            <button
              type="button"
              onClick={() => downloadDebugJson(response)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd]"
            >
              <Download className="h-4 w-4" />
              JSON completo
            </button>
            <button
              type="button"
              onClick={() => void copyDebugJson()}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd]"
            >
              {copyStatus === "copied"
                ? "Copiado"
                : copyStatus === "failed"
                  ? "No se pudo copiar"
                  : "Copiar JSON"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <DebugMetric label="Sin match" value={summary.unmatchedItems} />
          <DebugMetric label="Sin Aguiar" value={summary.itemsWithoutAguiar} />
          <DebugMetric label="Sin mercado" value={summary.itemsWithoutMarket} />
          <DebugMetric label="Fuentes error" value={summary.failedSources} />
          <DebugMetric label="Fuentes sin datos" value={summary.emptySources} />
          <DebugMetric label="Descartes" value={summary.rejectedCandidates} />
        </div>

        {sourceProblems.length > 0 ? (
          <div className="rounded-md border border-[#e5e9ef] bg-white">
            <div className="border-b border-[#e5e9ef] px-3 py-2">
              <h4 className="text-sm font-semibold text-[#17202a]">
                Fuentes con error o sin datos
              </h4>
            </div>
            <div className="max-h-[300px] overflow-auto divide-y divide-[#e5e9ef]">
              {sourceProblems.map((source) => (
                <div key={`debug-source-${source.sourceId}`} className="px-3 py-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#17202a]">
                        {source.storeName}
                      </div>
                      <div className="mt-0.5 text-xs text-[#667789]">
                        {source.sourceId} · {source.storeType} ·{" "}
                        {source.resultsCount} resultados ·{" "}
                        {formatDurationMs(source.durationMs)}
                      </div>
                    </div>
                    <span className={statusClassName(source.status)}>
                      {sourceStatusLabel(source.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#526170]">
                    {source.errorMessage ??
                      (source.status === "no_results" || source.resultsCount === 0
                        ? "La fuente respondió, pero no devolvió productos útiles para esta corrida."
                        : "Sin detalle de error informado por la fuente.")}
                  </div>
                  {source.sourceUrl ? (
                    <a
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-xs font-medium text-[#1d5f8f] underline-offset-2 hover:underline"
                    >
                      Abrir fuente
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-[#e5e9ef] bg-white">
          <div className="flex flex-col gap-1 border-b border-[#e5e9ef] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-sm font-semibold text-[#17202a]">
              Artículos para depurar
            </h4>
            <span className="text-xs text-[#667789]">
              {itemsToReview.length} de {response.results.length} artículos
            </span>
          </div>

          {itemsToReview.length === 0 ? (
            <div className="px-3 py-5 text-sm text-[#667789]">
              No hay artículos con alertas de matching en esta evaluación.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto divide-y divide-[#e5e9ef]">
              {itemsToReview.map((result) => {
                const directAguiar = result.diagnostics?.directAguiar;
                const issueLabels = getResultIssueLabels(result);

                return (
                  <details
                    key={`diag-${result.input.rowNumber}-${result.input.code ?? ""}`}
                    className="px-3 py-2"
                  >
                    <summary className="cursor-pointer">
                      <div className="inline-flex w-[calc(100%-1rem)] flex-col gap-1 align-top sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 font-semibold text-[#17202a]">
                            {result.input.description ||
                              "Artículo sin descripción"}
                          </div>
                          <div className="mt-1 text-xs text-[#667789]">
                            Fila {result.input.rowNumber} ·{" "}
                            {result.input.code || "-"} ·{" "}
                            {result.input.ean13Di ||
                              result.input.ean13Bu ||
                              "sin EAN"}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {issueLabels.map((label) => (
                            <span
                              key={`${result.input.rowNumber}-${label}`}
                              className="rounded bg-[#fff1ef] px-2 py-1 text-[11px] font-semibold text-[#8f2d20]"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </summary>

                    <div className="mt-3 grid gap-3 text-xs">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <span className="font-semibold text-[#526170]">
                            Marca esperada:
                          </span>{" "}
                          {result.diagnostics?.expectedBrand ?? "-"}
                        </div>
                        <div>
                          <span className="font-semibold text-[#526170]">
                            Query usada:
                          </span>{" "}
                          {result.queryUsed ?? "-"}
                        </div>
                        <div>
                          <span className="font-semibold text-[#526170]">
                            Precio Aguiar:
                          </span>{" "}
                          {formatCurrencyValue(
                            normalizeOptionalNumber(result.input.currentPrice),
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-[#526170]">
                            Mejor mercado:
                          </span>{" "}
                          {formatCurrencyValue(result.bestPrice)}
                        </div>
                      </div>

                      {directAguiar ? (
                        <div className="rounded border border-[#e5e9ef] bg-[#f8fafc] px-2 py-2">
                          <span className="font-semibold text-[#526170]">
                            Aguiar directo:
                          </span>{" "}
                          {directSourceStatusLabel(directAguiar.status)}
                          {directAguiar.matchedQuery
                            ? ` con "${directAguiar.matchedQuery}"`
                            : ""}
                          {directAguiar.errorMessage
                            ? ` · ${directAguiar.errorMessage}`
                            : ""}
                          <div className="mt-1 text-[#667789]">
                            Consultas:{" "}
                            {directAguiar.queriesTried.join(" | ") || "-"}
                          </div>
                          {directAguiar.aiMatch ? (
                            <div className="mt-2 rounded border border-[#dbeafe] bg-white px-2 py-2 text-[#526170]">
                              <span className="font-semibold text-[#1d5f8f]">
                                IA:
                              </span>{" "}
                              {aiMatchStatusLabel(directAguiar.aiMatch.status)}
                              {directAguiar.aiMatch.confidenceScore !==
                              undefined
                                ? ` · score ${directAguiar.aiMatch.confidenceScore}`
                                : ""}
                              {directAguiar.aiMatch.selectedProductName
                                ? ` · ${directAguiar.aiMatch.selectedProductName}`
                                : ""}
                              {directAguiar.aiMatch.reason ? (
                                <div className="mt-1">
                                  {directAguiar.aiMatch.reason}
                                </div>
                              ) : null}
                              {directAguiar.aiMatch.errorMessage ? (
                                <div className="mt-1 text-[#8f2d20]">
                                  {directAguiar.aiMatch.errorMessage}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {result.diagnostics?.aguiarPriceNormalization ? (
                        <div className="rounded border border-[#f2d7c8] bg-[#fff8f3] px-2 py-2 text-[#7a4a16]">
                          <span className="font-semibold">
                            Control precio Aguiar:
                          </span>{" "}
                          {priceNormalizationStatusLabel(
                            result.diagnostics.aguiarPriceNormalization.status,
                          )}
                          <div className="mt-1">
                            {result.diagnostics.aguiarPriceNormalization.reason}
                          </div>
                          <div className="mt-1 text-[#667789]">
                            Original{" "}
                            {formatCurrencyValue(
                              result.diagnostics.aguiarPriceNormalization
                                .originalPrice,
                            )}
                            {result.diagnostics.aguiarPriceNormalization
                              .normalizedPrice
                              ? ` · normalizado ${formatCurrencyValue(
                                  result.diagnostics.aguiarPriceNormalization
                                    .normalizedPrice,
                                )}`
                              : ""}
                            {result.diagnostics.aguiarPriceNormalization
                              .referencePrice
                              ? ` · referencia ${formatCurrencyValue(
                                  result.diagnostics.aguiarPriceNormalization
                                    .referencePrice,
                                )}`
                              : ""}
                          </div>
                          <div className="mt-1 text-[#667789]">
                            Producto:{" "}
                            {
                              result.diagnostics.aguiarPriceNormalization
                                .productName
                            }
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-2">
                        {result.diagnostics?.queryDiagnostics.map(
                          (diagnostic) => (
                            <div
                              key={`${result.input.rowNumber}-${diagnostic.query}`}
                              className="rounded border border-[#e5e9ef] px-2 py-2"
                            >
                              <div className="font-semibold text-[#17202a]">
                                Query: "{diagnostic.query}"
                              </div>
                              <div className="mt-1 text-[#667789]">
                                devueltos{" "}
                                {diagnostic.sourceResultsCount ?? "-"} ·
                                candidatos {diagnostic.candidatesCount} ·
                                matches {diagnostic.matchesCount} · descartados{" "}
                                {diagnostic.rejectedCount}
                              </div>
                              {diagnostic.topRejected.length > 0 ? (
                                <div className="mt-2 divide-y divide-[#eef1f4] rounded border border-[#eef1f4]">
                                  {diagnostic.topRejected.map((candidate) => (
                                    <DiagnosticCandidateRow
                                      key={`${diagnostic.query}-${candidate.sourceId}-${candidate.productName}-${candidate.reason}`}
                                      candidate={candidate}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2 rounded bg-[#f8fafc] px-2 py-2 text-[#667789]">
                                  Sin candidatos descartados registrados para
                                  esta query.
                                </div>
                              )}
                            </div>
                          ),
                        ) ?? null}

                        {directAguiar?.queryDiagnostics.map((diagnostic) => (
                          <div
                            key={`${result.input.rowNumber}-aguiar-${diagnostic.query}`}
                            className="rounded border border-[#f0d898] bg-[#fffaf0] px-2 py-2"
                          >
                            <div className="font-semibold text-[#17202a]">
                              Aguiar query: "{diagnostic.query}"
                            </div>
                            <div className="mt-1 text-[#667789]">
                              devueltos {diagnostic.sourceResultsCount ?? "-"} ·
                              candidatos {diagnostic.candidatesCount} · matches{" "}
                              {diagnostic.matchesCount} · descartados{" "}
                              {diagnostic.rejectedCount}
                            </div>
                            {diagnostic.topRejected.length > 0 ? (
                              <div className="mt-2 divide-y divide-[#f0d898] rounded border border-[#f0d898] bg-white">
                                {diagnostic.topRejected.map((candidate) => (
                                  <DiagnosticCandidateRow
                                    key={`aguiar-${diagnostic.query}-${candidate.sourceId}-${candidate.productName}-${candidate.reason}`}
                                    candidate={candidate}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function DebugMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[#17202a]">{value}</div>
    </div>
  );
}

function DiagnosticCandidateRow({
  candidate,
}: {
  candidate: PriceListRejectedCandidate;
}) {
  return (
    <div className="px-2 py-2">
      <div className="font-medium text-[#17202a]">{candidate.productName}</div>
      <div className="mt-1 text-[#667789]">
        {candidate.storeName} · {rejectReasonLabel(candidate.reason)} · base{" "}
        {candidate.baseScore} / final {candidate.finalScore}
      </div>
      {candidate.productUrl ? (
        <a
          href={candidate.productUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-[#1d5f8f] underline-offset-2 hover:underline"
        >
          Ver candidato
        </a>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] p-2.5 sm:p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#667789] sm:text-xs">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-[#17202a] sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

function AraNumberInput({
  label,
  value,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hideLabel?: boolean;
}) {
  const [draft, setDraft] = useState(formatAmountDraft(value));
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    setDraft(formatAmountDraft(value));
    setIsInvalid(false);
  }, [value]);

  function commitDraft(rawValue: string) {
    const parsedValue = parseManualAmount(rawValue);

    if (rawValue.trim() && parsedValue === null) {
      setDraft(formatAmountDraft(value));
      setIsInvalid(true);
      return;
    }

    setIsInvalid(false);
    onChange(parsedValue);
    setDraft(formatAmountDraft(parsedValue));
  }

  return (
    <label className="block">
      <span
        className={
          hideLabel
            ? "sr-only"
            : "mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#667789]"
        }
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setIsInvalid(false);
        }}
        onBlur={() => commitDraft(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            setDraft(formatAmountDraft(value));
            setIsInvalid(false);
            event.currentTarget.blur();
          }
        }}
        placeholder=""
        className={`h-9 w-full min-w-[88px] rounded-md border bg-[#fffdfa] px-2 text-sm font-semibold text-[#17202a] outline-none transition focus:ring-4 ${
          isInvalid
            ? "border-[#df2e38] focus:ring-[#df2e38]/15"
            : "border-[#dec8bd] focus:border-[#df2e38] focus:ring-[#df2e38]/15"
        }`}
      />
    </label>
  );
}

function SourceCoverageSummary({ coverage }: { coverage: SourceCoverage }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <CoverageMetric
        label="Fuentes"
        value={coverage.totalSources}
        helper={`${coverage.sourcesWithoutData} sin precio`}
      />
      <CoverageMetric
        label="Con datos"
        value={coverage.sourcesWithData}
        helper="aportaron precios"
      />
      <CoverageMetric
        label="Mayoristas"
        value={coverage.mayoristaSourcesWithData}
        helper={`${coverage.mayoristaSources} consultadas`}
      />
      <CoverageMetric
        label="Minoristas"
        value={coverage.minoristaSourcesWithData}
        helper={`${coverage.minoristaSources} consultadas`}
      />
    </div>
  );
}

function CoverageMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="text-xl font-semibold text-[#17202a]">{value}</span>
        <span className="text-xs text-[#667789]">{helper}</span>
      </div>
    </div>
  );
}

function PriceListWorkbenchControls({
  itemFilter,
  onItemFilterChange,
  searchTerm,
  onSearchTermChange,
  counts,
  visibleCount,
  totalCount,
}: {
  itemFilter: PriceListItemFilter;
  onItemFilterChange: (filter: PriceListItemFilter) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  counts: PriceListFilterCounts;
  visibleCount: number;
  totalCount: number;
}) {
  const options: Array<{ value: PriceListItemFilter; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "matched", label: "Con precio" },
    { value: "not_found", label: "Sin precio" },
  ];

  return (
    <div className="rounded-md border border-[#d9dee7] bg-white p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {options.map((option) => {
            const isActive = itemFilter === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onItemFilterChange(option.value)}
                className={`rounded-md px-2.5 py-2 text-xs font-semibold transition ${
                  isActive
                    ? "bg-[#171717] text-white"
                    : "bg-[#f8fafc] text-[#526170] hover:bg-[#edf1f5] hover:text-[#17202a]"
                }`}
              >
                {option.label}{" "}
                <span className={isActive ? "text-white/75" : "text-[#8a96a3]"}>
                  {counts[option.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-[320px]">
            <span className="sr-only">Buscar dentro de la lista importada</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#df2e38]"
            />
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Filtrar artículo o código"
              className="h-10 w-full rounded-md border border-[#dec8bd] bg-[#fffdfa] pl-9 pr-9 text-sm text-[#171717] outline-none transition focus:border-[#df2e38] focus:ring-4 focus:ring-[#df2e38]/15"
            />
            {searchTerm ? (
              <button
                type="button"
                aria-label="Limpiar filtro"
                onClick={() => onSearchTermChange("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#667789] hover:bg-[#edf1f5] hover:text-[#17202a]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <div className="text-sm font-medium text-[#526170]">
            {visibleCount}/{totalCount} visibles
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyAnalysisPanel({ analysis }: { analysis: WeeklyAnalysis }) {
  return (
    <section className="pt-1">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div>
          <h3 className="text-base font-bold text-[#17202a]">
            Análisis semanal
          </h3>
          <p className="mt-1 text-sm text-[#667789]">
            Semáforo de decisión, resumen por rubro y brechas contra referencias.
          </p>
        </div>
        <div className="text-sm font-medium text-[#526170]">
          {analysis.withOwnPrice}/{analysis.total} con precio Aguiar
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Listos" value={analysis.ready} />
        <Metric label="Oportunidades" value={analysis.opportunities} />
        <Metric label="Muy arriba" value={analysis.aboveReference} />
        <Metric label="Sin referencia" value={analysis.withoutReference} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <DecisionStatusChart analysis={analysis} />
        <RubroSummaryTable analysis={analysis} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <GapAnalysisTable analysis={analysis} />
        <DecisionTable analysis={analysis} />
      </div>
    </section>
  );
}

function DecisionStatusChart({ analysis }: { analysis: WeeklyAnalysis }) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] p-3">
      <h4 className="text-sm font-semibold text-[#17202a]">
        Semáforo de decisión
      </h4>
      <div className="mt-3 flex flex-col gap-3">
        {analysis.statusCounts.map((item) => {
          const percent = analysis.total > 0 ? (item.count / analysis.total) * 100 : 0;

          return (
            <div key={item.status}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-[#526170]">{item.label}</span>
                <span className="text-[#667789]">
                  {item.count} · {formatPercent(percent)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#e5e9ef]">
                <div
                  className={`h-full rounded-full ${decisionBarClassName(item.status)}`}
                  style={{ width: `${percent > 0 ? Math.max(3, percent) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RubroSummaryTable({ analysis }: { analysis: WeeklyAnalysis }) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-white">
      <div className="border-b border-[#e5e9ef] px-3 py-3">
        <h4 className="text-sm font-semibold text-[#17202a]">
          Resumen por rubro
        </h4>
      </div>
      <div className="max-h-[280px] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#edf1f5] text-[#526170]">
            <tr>
              <th className="px-3 py-2">Rubro</th>
              <th className="px-3 py-2">Art.</th>
              <th className="px-3 py-2">Con ref.</th>
              <th className="px-3 py-2">Sin ref.</th>
              <th className="px-3 py-2">Oportunidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9ef]">
            {analysis.rubros.map((rubro) => (
              <tr key={rubro.rubro}>
                <td className="max-w-[220px] px-3 py-2 font-medium text-[#17202a]">
                  {rubro.rubro}
                </td>
                <td className="px-3 py-2 text-[#526170]">{rubro.total}</td>
                <td className="px-3 py-2 text-[#173d2f]">
                  {rubro.withReference}
                </td>
                <td className="px-3 py-2 text-[#8f2d20]">
                  {rubro.withoutReference}
                </td>
                <td className="px-3 py-2 text-[#73510b]">
                  {rubro.opportunities}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GapAnalysisTable({ analysis }: { analysis: WeeklyAnalysis }) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-white">
      <div className="border-b border-[#e5e9ef] px-3 py-3">
        <h4 className="text-sm font-semibold text-[#17202a]">
          Mayores brechas
        </h4>
      </div>
      {analysis.topGaps.length === 0 ? (
        <div className="px-3 py-5 text-sm text-[#667789]">
          No hay brechas para mostrar con los filtros actuales.
        </div>
      ) : (
        <div className="max-h-[280px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#edf1f5] text-[#526170]">
              <tr>
                <th className="px-3 py-2">Artículo</th>
                <th className="px-3 py-2">Aguiar</th>
                <th className="px-3 py-2">Ref.</th>
                <th className="px-3 py-2">Brecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9ef]">
              {analysis.topGaps.map((decision) => (
                <tr key={`${decision.result.input.rowNumber}-gap`}>
                  <td className="max-w-[260px] px-3 py-2 font-medium text-[#17202a]">
                    {decision.result.input.description || "-"}
                  </td>
                  <td className="px-3 py-2 text-[#526170]">
                    {formatCurrencyValue(decision.currentPrice)}
                  </td>
                  <td className="px-3 py-2 text-[#526170]">
                    {formatCurrencyValue(decision.referencePrice)}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${gapTextClassName(decision.gapPercent)}`}>
                    {formatSignedPercent(decision.gapPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DecisionTable({ analysis }: { analysis: WeeklyAnalysis }) {
  const decisions = analysis.decisions
    .filter((decision) => decision.status !== "ready")
    .slice(0, 12);

  return (
    <div className="rounded-md border border-[#e5e9ef] bg-white">
      <div className="border-b border-[#e5e9ef] px-3 py-3">
        <h4 className="text-sm font-semibold text-[#17202a]">
          Productos a revisar
        </h4>
      </div>
      {decisions.length === 0 ? (
        <div className="px-3 py-5 text-sm text-[#667789]">
          No hay alertas abiertas para el filtro actual.
        </div>
      ) : (
        <div className="max-h-[280px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#edf1f5] text-[#526170]">
              <tr>
                <th className="px-3 py-2">Artículo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Sugerido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9ef]">
              {decisions.map((decision) => (
                <tr key={`${decision.result.input.rowNumber}-decision`}>
                  <td className="max-w-[280px] px-3 py-2">
                    <div className="font-medium text-[#17202a]">
                      {decision.result.input.description || "-"}
                    </div>
                    <div className="mt-1 text-[#667789]">
                      {decision.result.input.rubro || "Sin rubro"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={decisionBadgeClassName(decision.status)}>
                      {decision.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-[#173d2f]">
                    {formatCurrencyValue(decision.suggestedPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PriceListRow({
  result,
  sources,
  onItemInputChange,
}: {
  result: PriceListItemResult;
  sources: SourceSearchStatus[];
  onItemInputChange: (
    rowNumber: number,
    field: PriceListEditableField,
    value: number | null,
  ) => void;
}) {
  const sourceComparisons = buildSortedSourceComparisons(result, sources);
  const aguiarPrice = normalizeOptionalNumber(result.input.currentPrice);
  const bestMarketPrice = normalizeOptionalNumber(result.bestPrice);
  const aguiarIsAboveBest =
    aguiarPrice !== null &&
    bestMarketPrice !== null &&
    aguiarPrice > bestMarketPrice;
  const hasAnyPrice = aguiarPrice !== null || result.bestSource !== null;

  return (
    <tr className={hasAnyPrice ? "align-top" : "align-top bg-[#fff8f7]"}>
      <td className="max-w-[260px] px-2.5 py-3">
        <div className="line-clamp-3 font-medium leading-5 text-[#17202a]">
          {result.input.description || "-"}
        </div>
        {result.input.rubro ? (
          <div className="mt-1 text-[#667789]">{result.input.rubro}</div>
        ) : null}
      </td>
      <td className="px-2.5 py-3 text-[#526170]">
        <div>{result.input.code || "-"}</div>
        <div className="mt-1">
          {result.input.ean13Di || result.input.ean13Bu || "-"}
        </div>
      </td>
      <td className="px-2.5 py-3">
        <div
          className={
            aguiarIsAboveBest
              ? "rounded-md border border-[#ef9a63] bg-[#fff4e8] p-1.5"
              : ""
          }
        >
          <AraNumberInput
            label="Precio Aguiar"
            value={result.input.currentPrice ?? null}
            hideLabel
            onChange={(value) =>
              onItemInputChange(result.input.rowNumber, "currentPrice", value)
            }
          />
          {aguiarIsAboveBest ? (
            <div className="mt-1 text-[11px] font-semibold text-[#9a3b16]">
              Más caro que mercado
            </div>
          ) : null}
        </div>
      </td>
      {sourceComparisons.length === 0 ? (
        <td className="px-2.5 py-3 font-semibold text-[#8f2d20]">
          Sin fuentes visibles
        </td>
      ) : null}
      {sourceComparisons.map(({ source, sourcePrice }) => {
        const isBetterThanAguiar =
          aguiarPrice !== null &&
          sourcePrice !== null &&
          getComparablePrice(sourcePrice) < aguiarPrice;

        return (
          <td
            key={source.sourceId}
            className={`px-2.5 py-3 ${
              isBetterThanAguiar
                ? "bg-[#fff4e8] shadow-[inset_3px_0_0_#df7b34]"
                : ""
            }`}
          >
            {sourcePrice ? (
              <div title={sourcePrice.productName}>
                <div className="line-clamp-2 font-medium text-[#17202a]">
                  {sourcePrice.storeName}
                </div>
                <div
                  className={`mt-1 font-semibold ${
                    isBetterThanAguiar ? "text-[#9a3b16]" : "text-[#173d2f]"
                  }`}
                >
                  {formatComparableCurrency(sourcePrice)}
                </div>
                <UnitPriceDetail price={sourcePrice} />
                {isBetterThanAguiar ? (
                  <div className="mt-1 text-[11px] font-semibold text-[#9a3b16]">
                    Mejor que Aguiar
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="line-clamp-2 font-medium text-[#83909d]">
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
  onItemInputChange,
}: {
  results: PriceListItemResult[];
  sources: SourceSearchStatus[];
  onItemInputChange: (
    rowNumber: number,
    field: PriceListEditableField,
    value: number | null,
  ) => void;
}) {
  const sourceNames = new Map(
    sources.map((source) => [source.sourceId, source.storeName]),
  );

  return (
    <div className="grid gap-3 lg:hidden">
      {results.map((result) => {
        const aguiarPrice = normalizeOptionalNumber(result.input.currentPrice);
        const bestMarketPrice = normalizeOptionalNumber(result.bestPrice);
        const aguiarIsAboveBest =
          aguiarPrice !== null &&
          bestMarketPrice !== null &&
          aguiarPrice > bestMarketPrice;
        const hasAnyPrice = aguiarPrice !== null || result.bestSource !== null;

        return (
          <article
            key={`${result.input.rowNumber}-${result.input.code ?? ""}-card`}
            className={`rounded-md border p-3 sm:p-4 ${
              hasAnyPrice
                ? "border-[#d9dee7] bg-white"
                : "border-[#edd0cb] bg-[#fff8f7]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="line-clamp-3 text-sm font-semibold leading-5 text-[#17202a] sm:text-base">
                  {result.input.description || "Artículo sin descripción"}
                </h3>
                {result.input.rubro ? (
                  <p className="mt-1 text-sm text-[#667789]">
                    {result.input.rubro}
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
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

            <div
              className={`mt-3 ${
                aguiarIsAboveBest
                  ? "rounded-md border border-[#ef9a63] bg-[#fff4e8] p-2"
                  : ""
              }`}
            >
              <AraNumberInput
                label="Precio Aguiar"
                value={result.input.currentPrice ?? null}
                onChange={(value) =>
                  onItemInputChange(
                    result.input.rowNumber,
                    "currentPrice",
                    value,
                  )
                }
              />
              {aguiarIsAboveBest ? (
                <div className="mt-1 text-xs font-semibold text-[#9a3b16]">
                  Aguiar está por encima del mejor precio encontrado.
                </div>
              ) : null}
            </div>

            {result.bestSource ? (
              <div className="mt-3 rounded-md bg-[#f6f7f9] p-3">
                <div className="text-xs font-medium uppercase tracking-[0.04em] text-[#667789]">
                  Mejor unitario
                </div>
                <div className="mt-1 text-lg font-semibold text-[#173d2f] sm:text-xl">
                  {formatComparableCurrency(result.bestSource)}
                </div>
                <UnitPriceDetail price={result.bestSource} />
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
              <div
                className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
                  aguiarPrice
                    ? "bg-[#f6f7f9] text-[#526170]"
                    : "bg-white text-[#8f2d20]"
                }`}
              >
                {aguiarPrice
                  ? "Sin referencia de mercado disponible"
                  : "Sin precio disponible"}
              </div>
            )}

            {result.sourcePrices.length > 0 ? (
              <details className="mt-3 text-sm text-[#526170]">
                <summary className="cursor-pointer font-medium text-[#17202a]">
                  Ver precios por comercio
                </summary>
                <div className="mt-2 divide-y divide-[#e5e9ef] rounded-md border border-[#d9dee7] bg-white">
                  {buildSortedSourceComparisons(result, sources).map(
                    ({ source, sourcePrice }) => {
                      const isBetterThanAguiar =
                        aguiarPrice !== null &&
                        sourcePrice !== null &&
                        getComparablePrice(sourcePrice) < aguiarPrice;

                      return (
                        <div
                          key={`${result.input.rowNumber}-${source.sourceId}`}
                          className={`flex items-center justify-between gap-3 px-3 py-2 ${
                            isBetterThanAguiar ? "bg-[#fff4e8]" : ""
                          }`}
                        >
                          <span>
                            {sourcePrice
                              ? sourceNames.get(sourcePrice.sourceId) ??
                                sourcePrice.storeName
                              : source.storeName}
                          </span>
                          <div className="shrink-0 text-right">
                            <span
                              className={
                                sourcePrice
                                  ? isBetterThanAguiar
                                    ? "font-semibold text-[#9a3b16]"
                                    : "font-semibold text-[#173d2f]"
                                  : "text-[#9aa5b1]"
                              }
                            >
                              {sourcePrice
                                ? formatComparableCurrency(sourcePrice)
                                : "-"}
                            </span>
                            {sourcePrice ? (
                              <UnitPriceDetail price={sourcePrice} />
                            ) : null}
                          </div>
                        </div>
                      );
                    },
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
  const sourceCoverage = buildSearchSourceCoverage(visibleSources, visibleResults);

  return (
    <div className="mt-5 flex flex-col gap-4">
      <SourceTypeFilterControl
        value={sourceFilter}
        onChange={onSourceFilterChange}
      />

      <SourceCoverageSummary coverage={sourceCoverage} />

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
    <div className="inline-flex w-full max-w-full overflow-x-auto rounded-md border border-[#eadbd3] bg-[#fffdfa] p-1 sm:w-fit">
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-9 flex-1 shrink-0 rounded px-3 text-sm font-semibold transition sm:flex-none ${
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
  const sortedSources = sortSourcesForDisplay(sources);

  return (
    <details className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-3 text-sm text-[#526170] sm:px-4">
      <summary className="cursor-pointer font-medium text-[#17202a]">
        Fuentes consultadas
      </summary>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {sortedSources.map((source) => (
          <div
            key={source.sourceId}
            className="rounded border border-[#d9dee7] bg-white px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              {source.sourceUrl ? (
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 break-words font-medium text-[#17202a] underline-offset-2 hover:underline"
                >
                  {source.storeName}
                </a>
              ) : (
                <span className="min-w-0 break-words font-medium text-[#17202a]">
                  {source.storeName}
                </span>
              )}
              <span className={statusClassName(source.status)}>
                {sourceStatusLabel(source.status)}
              </span>
            </div>
            <div className="mt-1 text-xs text-[#667789]">
              {source.sourceScope ?? source.storeType} · {source.resultsCount}{" "}
              resultados · {formatDurationMs(source.durationMs)}
            </div>
            {source.dataOrigin ? (
              <p className="mt-1 text-xs leading-5 text-[#526170]">
                {source.dataOrigin}
              </p>
            ) : null}
            {source.errorMessage ? (
              <p className="mt-1 rounded bg-[#fff1ef] px-2 py-1 text-xs leading-5 text-[#8f2d20]">
                {source.errorMessage}
              </p>
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

function sortSourcesForPriority(sources: SourceSearchStatus[]) {
  return [...sources].sort((first, second) => {
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

function ResultsTable({ results }: { results: ProductSearchResult[] }) {
  return (
    <div className="hidden overflow-hidden rounded-md border border-[#d9dee7] bg-white lg:block">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#edf1f5] text-xs uppercase tracking-[0.06em] text-[#526170]">
          <tr>
            <th className="px-4 py-3">Comercio</th>
            <th className="px-4 py-3">Producto</th>
            <th className="px-4 py-3">Precio unitario</th>
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
                {formatComparableCurrency(result)}
                <UnitPriceDetail price={result} />
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
    <div className="grid gap-3 lg:hidden">
      {results.map((result) => (
        <article
          key={resultKey(result)}
          className="rounded-md border border-[#d9dee7] bg-white p-3 sm:p-4"
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
              <h3 className="mt-1 line-clamp-3 text-sm font-semibold leading-5 text-[#17202a] sm:text-base">
                {result.rawName}
              </h3>
              {result.brand ? (
                <div className="mt-1 text-sm text-[#667789]">
                  {result.brand}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              <span className="text-lg font-semibold text-[#173d2f]">
                {formatComparableCurrency(result)}
              </span>
              <UnitPriceDetail price={result} />
            </div>
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

function directSourceStatusLabel(
  status: NonNullable<
    NonNullable<PriceListItemResult["diagnostics"]>["directAguiar"]
  >["status"],
) {
  if (status === "matched") {
    return "encontro precio";
  }

  if (status === "failed") {
    return "fallo";
  }

  if (status === "skipped") {
    return "omitido";
  }

  return "sin resultado";
}

function priceNormalizationStatusLabel(
  status: NonNullable<
    NonNullable<
      PriceListItemResult["diagnostics"]
    >["aguiarPriceNormalization"]
  >["status"],
) {
  if (status === "normalized") {
    return "normalizado";
  }

  return "rechazado";
}

function aiMatchStatusLabel(
  status: NonNullable<
    NonNullable<
      NonNullable<PriceListItemResult["diagnostics"]>["directAguiar"]
    >["aiMatch"]
  >["status"],
) {
  const labels = {
    disabled: "desactivada",
    skipped: "omitida",
    matched: "match aceptado",
    rejected: "sin match confiable",
    failed: "fallo",
  } satisfies Record<typeof status, string>;

  return labels[status];
}

function rejectReasonLabel(reason: PriceListRejectedCandidate["reason"]) {
  if (reason === "brand_mismatch") {
    return "Marca no coincide";
  }

  if (reason === "presentation_or_flavor_mismatch") {
    return "Presentacion o sabor no coincide";
  }

  if (reason === "no_candidates") {
    return "Sin candidatos";
  }

  return "Score bajo";
}

function resultKey(result: ProductSearchResult) {
  return `${result.sourceId}-${result.normalizedName}-${result.price}-${getComparablePrice(result)}`;
}

function filterSourcesByType(
  sources: SourceSearchStatus[],
  sourceFilter: SourceTypeFilter,
) {
  const filteredSources =
    sourceFilter === "all"
      ? sources
      : sources.filter((source) => source.storeType === sourceFilter);

  return sortSourcesForPriority(filteredSources);
}

function isAguiarTokinSource(sourceId: string) {
  return sourceId === AGUIAR_TOKIN_SOURCE_ID;
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
  const sourcePrices = result.sourcePrices
    .filter((sourcePrice) => !isAguiarTokinSource(sourcePrice.sourceId))
    .filter(
      (sourcePrice) =>
        sourceFilter === "all" || sourcePrice.storeType === sourceFilter,
    )
    .sort((first, second) => getComparablePrice(first) - getComparablePrice(second));
  const bestSource = sourcePrices[0] ?? null;
  const hasAguiarPrice =
    normalizeOptionalNumber(result.input.currentPrice) !== null;

  return {
    ...result,
    status: bestSource || hasAguiarPrice ? "matched" : "not_found",
    bestSource,
    bestPrice: bestSource ? getComparablePrice(bestSource) : null,
    sourcePrices,
    matchedCount: sourcePrices.length + (hasAguiarPrice ? 1 : 0),
  };
}

function filterPriceListItems(
  results: PriceListItemResult[],
  itemFilter: PriceListItemFilter,
  searchTerm: string,
) {
  const normalizedSearch = normalizeSearchText(searchTerm);

  return results.filter((result) => {
    const matchesStatus =
      itemFilter === "all" || result.status === itemFilter;

    return (
      matchesStatus &&
      (!normalizedSearch ||
        normalizeSearchText(
          [
            result.input.description,
            result.input.rubro,
            result.input.code,
            result.input.ean13Di,
            result.input.ean13Bu,
            result.bestSource?.storeName,
            result.bestSource?.productName,
            ...result.sourcePrices.map((sourcePrice) => sourcePrice.storeName),
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(normalizedSearch))
    );
  });
}

function buildPriceListFilterCounts(
  results: PriceListItemResult[],
): PriceListFilterCounts {
  const counts: PriceListFilterCounts = {
    all: results.length,
    matched: 0,
    not_found: 0,
  };

  for (const result of results) {
    counts[result.status] += 1;
  }

  return counts;
}

function buildSourceCoverage(
  sources: SourceSearchStatus[],
  results: PriceListItemResult[],
): SourceCoverage {
  const sourceTypes = new Map(
    sources.map((source) => [source.sourceId, source.storeType]),
  );
  const sourcesWithData = new Set<string>();

  for (const result of results) {
    for (const sourcePrice of result.sourcePrices) {
      if (sourceTypes.has(sourcePrice.sourceId)) {
        sourcesWithData.add(sourcePrice.sourceId);
      }
    }
  }

  return buildCoverageFromSets(sources, sourcesWithData);
}

function buildSearchSourceCoverage(
  sources: SourceSearchStatus[],
  results: ProductSearchResult[],
): SourceCoverage {
  const sourceTypes = new Map(
    sources.map((source) => [source.sourceId, source.storeType]),
  );
  const sourcesWithData = new Set(
    results
      .filter((result) => sourceTypes.has(result.sourceId))
      .map((result) => result.sourceId),
  );

  return buildCoverageFromSets(sources, sourcesWithData);
}

function buildCoverageFromSets(
  sources: SourceSearchStatus[],
  sourcesWithData: Set<string>,
): SourceCoverage {
  const mayoristaSources = sources.filter(
    (source) => source.storeType === "mayorista",
  );
  const minoristaSources = sources.filter(
    (source) => source.storeType === "minorista",
  );
  const countWithData = (source: SourceSearchStatus) =>
    sourcesWithData.has(source.sourceId);

  return {
    totalSources: sources.length,
    sourcesWithData: sourcesWithData.size,
    sourcesWithoutData: Math.max(0, sources.length - sourcesWithData.size),
    mayoristaSources: mayoristaSources.length,
    minoristaSources: minoristaSources.length,
    mayoristaSourcesWithData: mayoristaSources.filter(countWithData).length,
    minoristaSourcesWithData: minoristaSources.filter(countWithData).length,
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

function getSourceProblems(sources: SourceSearchStatus[]) {
  return sources.filter(
    (source) =>
      source.status !== "success" ||
      source.resultsCount === 0 ||
      Boolean(source.errorMessage),
  );
}

function buildDebugSummary(
  response: PriceListResponse,
  itemsToReview: PriceListItemResult[],
  sourceProblems: SourceSearchStatus[],
) {
  return {
    totalIssues: itemsToReview.length + sourceProblems.length,
    unmatchedItems: response.results.filter(
      (result) => result.status === "not_found",
    ).length,
    itemsWithoutAguiar: response.results.filter(
      (result) => normalizeOptionalNumber(result.input.currentPrice) === null,
    ).length,
    itemsWithoutMarket: response.results.filter(
      (result) => result.sourcePrices.length === 0,
    ).length,
    failedSources: response.sources.filter(
      (source) => source.status === "failed" || source.status === "timeout",
    ).length,
    emptySources: response.sources.filter(
      (source) => source.status === "no_results" || source.resultsCount === 0,
    ).length,
    rejectedCandidates: response.results.reduce(
      (total, result) => total + countRejectedDiagnostics(result),
      0,
    ),
  };
}

function logPriceListDebugToConsole(response: PriceListResponse) {
  const aguiarRows = response.results
    .map((result) => {
      const directAguiar = result.diagnostics?.directAguiar;
      const priceNormalization = result.diagnostics?.aguiarPriceNormalization;
      const hasIssue =
        normalizeOptionalNumber(result.input.currentPrice) === null ||
        result.status === "not_found" ||
        Boolean(priceNormalization) ||
        directAguiar?.status === "failed" ||
        directAguiar?.status === "no_results";

      if (!hasIssue) {
        return null;
      }

      const directDiagnostics = directAguiar?.queryDiagnostics ?? [];
      const maxReturned = Math.max(
        0,
        ...directDiagnostics.map(
          (diagnostic) => diagnostic.sourceResultsCount ?? 0,
        ),
      );
      const maxMatches = Math.max(
        0,
        ...directDiagnostics.map((diagnostic) => diagnostic.matchesCount),
      );
      const rejectedCount = directDiagnostics.reduce(
        (total, diagnostic) => total + diagnostic.rejectedCount,
        0,
      );
      const topRejected = directDiagnostics
        .flatMap((diagnostic) => diagnostic.topRejected)
        .slice(0, 3)
        .map(
          (candidate) =>
            `${candidate.productName} (${rejectReasonLabel(candidate.reason)}, ${candidate.finalScore})`,
        )
        .join(" | ");

      return {
        fila: result.input.rowNumber,
        codigo: result.input.code ?? "",
        ean: result.input.ean13Di ?? "",
        descripcion: result.input.description ?? "",
        precioAguiar:
          normalizeOptionalNumber(result.input.currentPrice) ?? "sin precio",
        estadoAguiar: directAguiar?.status ?? "catalogo",
        consultasTokin: directAguiar?.queriesTried.join(" | ") ?? "",
        maxDevueltosTokin: maxReturned,
        maxMatchesTokin: maxMatches,
        descartadosTokin: rejectedCount,
        topDescartados: topRejected,
        controlPrecio: priceNormalization?.status ?? "",
        motivo:
          priceNormalization?.reason ??
          directAguiar?.errorMessage ??
          (normalizeOptionalNumber(result.input.currentPrice) === null
            ? "Sin precio Aguiar"
            : ""),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (aguiarRows.length === 0) {
    console.info("[Aguiar/Tokin] La lista no dejó incidencias de matching.");
    return;
  }

  console.groupCollapsed(
    `[Aguiar/Tokin] ${aguiarRows.length} articulos con incidencia de matching/precio`,
  );
  console.table(aguiarRows);
  console.warn(
    "[Aguiar/Tokin] Si un producto existe en Tokin pero aparece sin precio, copiame esta tabla y el log-matching CSV para ajustar aliases o reglas.",
  );
  console.groupEnd();
}

function countRejectedDiagnostics(result: PriceListItemResult) {
  const catalogRejected =
    result.diagnostics?.queryDiagnostics.reduce(
      (total, diagnostic) => total + diagnostic.topRejected.length,
      0,
    ) ?? 0;
  const directAguiarRejected =
    result.diagnostics?.directAguiar?.queryDiagnostics.reduce(
      (total, diagnostic) => total + diagnostic.topRejected.length,
      0,
    ) ?? 0;

  return catalogRejected + directAguiarRejected;
}

function getResultIssueLabels(result: PriceListItemResult) {
  const labels: string[] = [];

  if (result.status === "not_found") {
    labels.push("Sin match");
  }

  if (normalizeOptionalNumber(result.input.currentPrice) === null) {
    labels.push("Sin Aguiar");
  }

  if (result.sourcePrices.length === 0) {
    labels.push("Sin mercado");
  }

  if (labels.length === 0) {
    labels.push("Revisar");
  }

  return labels;
}

function buildDebugPayload(response: PriceListResponse) {
  const sourceProblems = getSourceProblems(response.sources);
  const itemsToReview = response.results.filter(resultNeedsMatchingReview);

  return {
    generatedAt: new Date().toISOString(),
    summary: buildDebugSummary(response, itemsToReview, sourceProblems),
    searchedAt: response.searchedAt,
    durationMs: response.durationMs,
    catalog: response.catalog,
    sourceProblems,
    sources: response.sources,
    itemsToReview,
    results: response.results,
  };
}

function formatDurationMs(durationMs: number) {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)} s`;
  }

  return `${durationMs} ms`;
}

function resultNeedsMatchingReview(result: PriceListItemResult) {
  return (
    result.status === "not_found" ||
    result.sourcePrices.length === 0 ||
    normalizeOptionalNumber(result.input.currentPrice) === null
  );
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
    const priority = compareSourcePriority(first.sourcePrice, second.sourcePrice);

    if (priority !== 0) {
      return priority;
    }

    return (
      getComparablePrice(first.sourcePrice) -
      getComparablePrice(second.sourcePrice)
    );
  }

  if (first.sourcePrice) {
    return -1;
  }

  if (second.sourcePrice) {
    return 1;
  }

  const priority = compareSourcePriority(first.source, second.source);

  if (priority !== 0) {
    return priority;
  }

  return first.source.storeName.localeCompare(second.source.storeName, "es");
}

function buildWeeklyAnalysis(results: PriceListItemResult[]): WeeklyAnalysis {
  const decisions = results.map(analyzePriceDecision);
  const rubros = summarizeRubros(decisions);
  const statusCounts = buildDecisionStatusCounts(decisions);
  const topGaps = decisions
    .filter((decision) => decision.gapPercent !== null)
    .sort(
      (first, second) =>
        Math.abs(second.gapPercent ?? 0) - Math.abs(first.gapPercent ?? 0),
    )
    .slice(0, 8);

  return {
    total: decisions.length,
    withReference: decisions.filter((decision) => decision.referencePrice !== null)
      .length,
    withoutReference: decisions.filter(
      (decision) => decision.referencePrice === null,
    ).length,
    withOwnPrice: decisions.filter((decision) => decision.currentPrice !== null)
      .length,
    opportunities: decisions.filter((decision) => decision.status === "opportunity")
      .length,
    aboveReference: decisions.filter(
      (decision) => decision.status === "above_reference",
    ).length,
    ready: decisions.filter((decision) => decision.status === "ready").length,
    review: decisions.filter((decision) => decision.status !== "ready").length,
    decisions,
    statusCounts,
    rubros,
    topGaps,
  };
}

function analyzePriceDecision(
  result: PriceListItemResult,
): PriceDecisionAnalysis {
  const currentPrice = normalizeOptionalNumber(result.input.currentPrice);
  const referencePrice = normalizeOptionalNumber(result.bestPrice);
  const gapPercent =
    currentPrice && referencePrice
      ? ((currentPrice - referencePrice) / referencePrice) * 100
      : null;
  const suggestedPrice = calculateSuggestedPrice(
    currentPrice,
    referencePrice,
  );
  const status = getPriceDecisionStatus(
    result,
    currentPrice,
    referencePrice,
    gapPercent,
  );

  return {
    result,
    status,
    statusLabel: getDecisionStatusLabel(status),
    currentPrice,
    referencePrice,
    gapPercent,
    suggestedPrice,
  };
}

function getPriceDecisionStatus(
  result: PriceListItemResult,
  currentPrice: number | null,
  referencePrice: number | null,
  gapPercent: number | null,
): PriceDecisionStatus {
  if (!referencePrice) {
    return "no_reference";
  }

  if (!currentPrice) {
    return "missing_own_price";
  }

  if (result.bestSource && result.bestSource.confidenceScore < 70) {
    return "review_match";
  }

  if (gapPercent !== null && gapPercent > HIGH_PRICE_GAP_PERCENT) {
    return "above_reference";
  }

  if (gapPercent !== null && gapPercent < OPPORTUNITY_GAP_PERCENT) {
    return "opportunity";
  }

  return "ready";
}

function calculateSuggestedPrice(
  currentPrice: number | null,
  referencePrice: number | null,
) {
  if (!currentPrice && !referencePrice) {
    return null;
  }

  const target = Math.max(
    referencePrice ?? 0,
    currentPrice ?? 0,
  );

  return roundPriceForList(target);
}

function roundPriceForList(value: number) {
  const step = value < 1_000 ? 10 : value < 10_000 ? 50 : 100;
  return Math.ceil(value / step) * step;
}

function summarizeRubros(decisions: PriceDecisionAnalysis[]) {
  const rubros = new Map<WeeklyAnalysis["rubros"][number]["rubro"], WeeklyAnalysis["rubros"][number]>();

  for (const decision of decisions) {
    const rubro = decision.result.input.rubro || "Sin rubro";
    const current = rubros.get(rubro) ?? {
      rubro,
      total: 0,
      withReference: 0,
      withoutReference: 0,
      opportunities: 0,
    };

    current.total += 1;
    current.withReference += decision.referencePrice !== null ? 1 : 0;
    current.withoutReference += decision.referencePrice === null ? 1 : 0;
    current.opportunities += decision.status === "opportunity" ? 1 : 0;
    rubros.set(rubro, current);
  }

  return Array.from(rubros.values()).sort((first, second) => {
    if (second.withoutReference !== first.withoutReference) {
      return second.withoutReference - first.withoutReference;
    }

    return first.rubro.localeCompare(second.rubro, "es");
  });
}

function buildDecisionStatusCounts(decisions: PriceDecisionAnalysis[]) {
  const statusOrder: PriceDecisionStatus[] = [
    "ready",
    "opportunity",
    "above_reference",
    "missing_own_price",
    "review_match",
    "no_reference",
  ];

  return statusOrder.map((status) => ({
    status,
    label: getDecisionStatusLabel(status),
    count: decisions.filter((decision) => decision.status === status).length,
  }));
}

function getDecisionStatusLabel(status: PriceDecisionStatus) {
  const labels: Record<PriceDecisionStatus, string> = {
    ready: "Listo",
    review_match: "Revisar match",
    no_reference: "Sin referencia",
    missing_own_price: "Falta precio Aguiar",
    above_reference: "Muy arriba",
    opportunity: "Oportunidad",
  };

  return labels[status];
}

function decisionBarClassName(status: PriceDecisionStatus) {
  const colors: Record<PriceDecisionStatus, string> = {
    ready: "bg-[#1f8a5b]",
    review_match: "bg-[#d68b14]",
    no_reference: "bg-[#8b96a5]",
    missing_own_price: "bg-[#6b7c8f]",
    above_reference: "bg-[#d65f21]",
    opportunity: "bg-[#2d74c4]",
  };

  return colors[status];
}

function decisionBadgeClassName(status: PriceDecisionStatus) {
  const base = "inline-flex rounded px-2 py-1 text-[11px] font-semibold";
  const colors: Record<PriceDecisionStatus, string> = {
    ready: "bg-[#e4f6ed] text-[#16613c]",
    review_match: "bg-[#fff8e6] text-[#73510b]",
    no_reference: "bg-[#eef1f4] text-[#526170]",
    missing_own_price: "bg-[#eef1f4] text-[#526170]",
    above_reference: "bg-[#fff1ef] text-[#8f2d20]",
    opportunity: "bg-[#eaf2ff] text-[#1d5f8f]",
  };

  return `${base} ${colors[status]}`;
}

function gapTextClassName(value: number | null) {
  if (value === null) {
    return "text-[#526170]";
  }

  if (value > HIGH_PRICE_GAP_PERCENT) {
    return "text-[#8f2d20]";
  }

  if (value < OPPORTUNITY_GAP_PERCENT) {
    return "text-[#1d5f8f]";
  }

  return "text-[#173d2f]";
}

function formatCurrencyValue(value: number | null) {
  return value === null ? "-" : currencyFormatter.format(value);
}

function formatAmountDraft(value: number | null) {
  return value === null ? "" : String(value);
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "-";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const currentPriceIndex = findColumn(headers, [
    "precio aguiar",
    "precio ara",
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
      rubro: readPriceListCell(row, rubroIndex),
      description: readPriceListCell(row, descriptionIndex),
      code: readPriceListCell(row, codeIndex),
      ean13Di: cleanSpreadsheetIdentifier(readPriceListCell(row, eanDiIndex)),
      ean13Bu: cleanSpreadsheetIdentifier(readPriceListCell(row, eanBuIndex)),
      currentPrice: parseSpreadsheetAmount(
        readPriceListCell(row, currentPriceIndex),
      ),
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
  const sources = filterSourcesByType(
    response.sources.filter((source) => !isAguiarTokinSource(source.sourceId)),
    sourceFilter,
  );
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
    "Precio Aguiar",
    "Estado",
    "Mejor unitario",
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
      result.input.currentPrice?.toFixed(2) ?? "",
      result.status === "matched" ? "Con precio" : "Sin precio",
      result.bestPrice === null ? "" : result.bestPrice.toFixed(2),
      result.bestSource?.storeName ?? "",
      result.bestSource?.productName ?? "",
      result.bestSource?.productUrl ?? "",
      ...comparisons.map(({ source, sourcePrice }) =>
        sourcePrice
          ? formatSourceCsvPrice(sourcePrice)
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

function downloadMatchingLogCsv(response: PriceListResponse) {
  const headers = [
    "Fila",
    "Rubro",
    "Descripcion",
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Estado",
    "Precio Aguiar",
    "Mejor fuente",
    "Query usada",
    "Marca esperada",
    "Origen diagnostico",
    "Query diagnostico",
    "Devueltos fuente",
    "Candidatos",
    "Matches",
    "Descartados",
    "Fuente candidato",
    "Producto candidato",
    "Motivo descarte",
    "Score base",
    "Score final",
    "Link candidato",
    "Control precio Aguiar",
    "Precio Aguiar original",
    "Precio Aguiar normalizado",
    "Precio referencia",
    "Motivo control Aguiar",
  ];
  const rows = response.results.flatMap((result) =>
    buildMatchingLogRows(result),
  );
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `log-matching-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDebugJson(response: PriceListResponse) {
  const json = JSON.stringify(buildDebugPayload(response), null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `debug-precios-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildMatchingLogRows(result: PriceListItemResult) {
  const diagnostics = result.diagnostics;
  const catalogRows =
    diagnostics?.queryDiagnostics.flatMap((diagnostic) =>
      buildMatchingDiagnosticRows(result, "Catalogo", diagnostic),
    ) ?? [];
  const directAguiar = diagnostics?.directAguiar;
  const aguiarRows =
    directAguiar?.queryDiagnostics.flatMap((diagnostic) =>
      buildMatchingDiagnosticRows(result, "Aguiar directo", diagnostic),
    ) ?? [];
  const aguiarStatusRows =
    directAguiar && directAguiar.queryDiagnostics.length === 0
      ? [
          buildMatchingLogBaseRow(
            result,
            "Aguiar directo",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            [
              directSourceStatusLabel(directAguiar.status),
              directAguiar.errorMessage,
            ]
              .filter(Boolean)
              .join(" - "),
          ),
        ]
      : [];

  if (
    catalogRows.length === 0 &&
    aguiarRows.length === 0 &&
    aguiarStatusRows.length === 0
  ) {
    return [buildMatchingLogBaseRow(result, "", "", "", "", "", "", "", "", "")];
  }

  return [...catalogRows, ...aguiarRows, ...aguiarStatusRows];
}

function buildMatchingDiagnosticRows(
  result: PriceListItemResult,
  diagnosticOrigin: string,
  diagnostic: NonNullable<
    PriceListItemResult["diagnostics"]
  >["queryDiagnostics"][number],
) {
  if (diagnostic.topRejected.length === 0) {
    return [
      buildMatchingLogBaseRow(
        result,
        diagnosticOrigin,
        diagnostic.query,
        diagnostic.sourceResultsCount === undefined
          ? ""
          : String(diagnostic.sourceResultsCount),
        String(diagnostic.candidatesCount),
        String(diagnostic.matchesCount),
        String(diagnostic.rejectedCount),
        "",
        "",
        "",
      ),
    ];
  }

  return diagnostic.topRejected.map((candidate) =>
    buildMatchingLogBaseRow(
      result,
      diagnosticOrigin,
      diagnostic.query,
      diagnostic.sourceResultsCount === undefined
        ? ""
        : String(diagnostic.sourceResultsCount),
      String(diagnostic.candidatesCount),
      String(diagnostic.matchesCount),
      String(diagnostic.rejectedCount),
      candidate.storeName,
      candidate.productName,
      rejectReasonLabel(candidate.reason),
      String(candidate.baseScore),
      String(candidate.finalScore),
      candidate.productUrl ?? "",
    ),
  );
}

function buildMatchingLogBaseRow(
  result: PriceListItemResult,
  diagnosticOrigin: string,
  diagnosticQuery: string,
  sourceResultsCount: string,
  candidatesCount: string,
  matchesCount: string,
  rejectedCount: string,
  candidateSource: string,
  candidateProduct: string,
  rejectReason: string,
  baseScore = "",
  finalScore = "",
  candidateUrl = "",
) {
  const priceNormalization = result.diagnostics?.aguiarPriceNormalization;

  return [
    String(result.input.rowNumber),
    result.input.rubro ?? "",
    result.input.description ?? "",
    result.input.code ?? "",
    result.input.ean13Di ?? "",
    result.input.ean13Bu ?? "",
    result.status === "matched" ? "Con precio" : "Sin precio",
    formatCsvAmount(normalizeOptionalNumber(result.input.currentPrice)),
    result.bestSource?.storeName ?? "",
    result.queryUsed ?? "",
    result.diagnostics?.expectedBrand ?? "",
    diagnosticOrigin,
    diagnosticQuery,
    sourceResultsCount,
    candidatesCount,
    matchesCount,
    rejectedCount,
    candidateSource,
    candidateProduct,
    rejectReason,
    baseScore,
    finalScore,
    candidateUrl,
    priceNormalization
      ? priceNormalizationStatusLabel(priceNormalization.status)
      : "",
    priceNormalization
      ? formatCsvAmount(priceNormalization.originalPrice)
      : "",
    priceNormalization?.normalizedPrice
      ? formatCsvAmount(priceNormalization.normalizedPrice)
      : "",
    priceNormalization?.referencePrice
      ? formatCsvAmount(priceNormalization.referencePrice)
      : "",
    priceNormalization?.reason ?? "",
  ];
}

function downloadAraUploadCsv(
  response: PriceListResponse,
  sourceFilter: SourceTypeFilter,
) {
  const results = response.results.map((result) =>
    filterPriceListResultBySourceType(result, sourceFilter),
  );
  const headers = [
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Descripcion",
    "Rubro",
    "Precio Aguiar",
  ];
  const rows = results.map((result) => {
    return [
      result.input.code ?? "",
      result.input.ean13Di ?? "",
      result.input.ean13Bu ?? "",
      result.input.description ?? "",
      result.input.rubro ?? "",
      formatCsvAmount(normalizeOptionalNumber(result.input.currentPrice)),
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aguiar-precios-${new Date().toISOString().slice(0, 10)}.csv`;
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

function parseManualAmount(value: string) {
  const cleaned = value
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/(?!^)-/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") {
    return null;
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function csvEscape(value: string | number) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function formatCsvAmount(value: number | null) {
  return value === null ? "" : value.toFixed(2);
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
