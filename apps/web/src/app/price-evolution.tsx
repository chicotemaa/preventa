"use client";

import {
  Loader2,
  LineChart as LineChartIcon,
  RefreshCw,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  PriceEvolutionPoint,
  PriceEvolutionProduct,
  PriceEvolutionResponse,
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

export function PriceEvolution() {
  const [payload, setPayload] = useState<PriceEvolutionResponse | null>(null);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadEvolution();
  }, []);

  async function loadEvolution() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/price-list/evolution", {
        cache: "no-store",
      });
      const data = (await response.json()) as PriceEvolutionResponse;

      if (!response.ok || data.errorMessage) {
        throw new Error(data.errorMessage ?? "No se pudo cargar la evolución.");
      }

      setPayload(data);
      setSelectedProductKey((currentKey) => {
        if (
          currentKey &&
          data.products.some((product) => product.productKey === currentKey)
        ) {
          return currentKey;
        }

        return data.products[0]?.productKey ?? null;
      });
    } catch (caughtError) {
      setPayload(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar la evolución.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const products = payload?.products ?? [];
  const filteredProducts = useMemo(
    () => filterProducts(products, searchTerm),
    [products, searchTerm],
  );
  const selectedProduct =
    filteredProducts.find(
      (product) => product.productKey === selectedProductKey,
    ) ??
    filteredProducts[0] ??
    null;

  return (
    <section className="min-w-0 rounded-md border border-[#eadbd3] bg-white p-4 shadow-[0_14px_40px_rgba(77,41,25,0.08)] sm:p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-[#171717]">
            <LineChartIcon className="h-5 w-5 shrink-0 text-[#df2e38]" />
            <span className="min-w-0">Evolución de precios</span>
          </h1>
          <p className="mt-1 text-sm text-[#667789]">
            Aguiar contra referencias de mercado y fuentes consultadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvolution()}
          disabled={isLoading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd] disabled:cursor-not-allowed disabled:text-[#a99f99] sm:w-fit"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </button>
      </div>

      {payload && !payload.enabled && !isLoading ? (
        <StateMessage>
          La evolución queda disponible cuando Supabase esté configurado.
        </StateMessage>
      ) : null}

      {error ? <ErrorMessage>{error}</ErrorMessage> : null}

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-[#eadbd3] bg-[#fffdfa] px-4 py-3 text-sm text-[#6f625d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando evolución...
        </div>
      ) : null}

      {!isLoading && payload?.enabled && products.length === 0 ? (
        <StateMessage>
          Todavía no hay cargas guardadas. En Carga de precios activá “guardar para
          evolución” cuando importes una lista semanal.
        </StateMessage>
      ) : null}

      {products.length > 0 ? (
        <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
          <ProductSelector
            products={filteredProducts}
            selectedProductKey={selectedProduct?.productKey ?? null}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onSelect={setSelectedProductKey}
          />

          {selectedProduct ? (
            <ProductEvolutionDetail product={selectedProduct} />
          ) : (
            <StateMessage>No hay productos para el filtro actual.</StateMessage>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ProductSelector({
  products,
  selectedProductKey,
  searchTerm,
  onSearchTermChange,
  onSelect,
}: {
  products: PriceEvolutionProduct[];
  selectedProductKey: string | null;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSelect: (productKey: string) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-md border border-[#d9dee7] bg-[#f8fafc]">
      <label className="relative block border-b border-[#d9dee7] bg-white p-3">
        <span className="sr-only">Buscar producto en evolución</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-[#df2e38]"
        />
        <input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Buscar artículo, código o EAN"
          className="h-10 w-full rounded-md border border-[#dec8bd] bg-[#fffdfa] pl-10 pr-3 text-sm text-[#171717] outline-none transition focus:border-[#df2e38] focus:ring-4 focus:ring-[#df2e38]/15"
        />
      </label>

      {products.length === 0 ? (
        <div className="px-4 py-5 text-sm text-[#667789]">
          No hay coincidencias.
        </div>
      ) : (
        <div className="max-h-[260px] overflow-auto lg:max-h-[620px]">
          {products.map((product) => {
            const latestPoint = getLatestPoint(product);
            const isSelected = product.productKey === selectedProductKey;

            return (
              <button
                key={product.productKey}
                type="button"
                onClick={() => onSelect(product.productKey)}
                className={`w-full border-b border-[#e5e9ef] px-3 py-3 text-left last:border-b-0 ${
                  isSelected ? "bg-[#edf3ff]" : "bg-white hover:bg-[#fffdfa]"
                }`}
              >
                <span className="line-clamp-2 block text-sm font-semibold leading-5 text-[#17202a]">
                  {product.description}
                </span>
                <span className="mt-1 block text-xs text-[#667789]">
                  {product.code ||
                    product.ean13Di ||
                    product.ean13Bu ||
                    "Sin código"}
                </span>
                <span className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-[#526170]">
                    {product.points.length} cargas
                  </span>
                  <span className="font-semibold text-[#173d2f]">
                    {formatCurrency(latestPoint?.araPrice ?? null)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function ProductEvolutionDetail({
  product,
}: {
  product: PriceEvolutionProduct;
}) {
  const stats = buildEvolutionStats(product);
  const pointsDesc = [...product.points].sort(
    (first, second) =>
      new Date(second.searchedAt).getTime() - new Date(first.searchedAt).getTime(),
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <div className="border-b border-[#d9dee7] px-4 py-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="min-w-0">
            <h2 className="break-words text-base font-extrabold leading-6 text-[#17202a] sm:text-lg">
              {product.description}
            </h2>
            <p className="mt-1 break-words text-sm text-[#667789]">
              {product.rubro || "Sin rubro"} ·{" "}
              {product.code ||
                product.ean13Di ||
                product.ean13Bu ||
                "Sin código"}
            </p>
          </div>
          <span className="w-fit rounded bg-[#eaf2ff] px-2 py-1 text-xs font-semibold text-[#1d5f8f]">
            {stats.sourcesCount} fuentes
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <EvolutionMetric
            label="Aguiar actual"
            value={formatCurrency(stats.lastAra)}
          />
          <EvolutionMetric
            label="Referencia actual"
            value={formatCurrency(stats.lastReference)}
          />
          <EvolutionMetric
            label="Var. Aguiar"
            value={formatSignedPercent(stats.araVariationPercent)}
          />
          <EvolutionMetric
            label="Var. mercado"
            value={formatSignedPercent(stats.referenceVariationPercent)}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 p-3 sm:p-4">
        <PriceEvolutionChart points={product.points} />

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <EvolutionTimelineTable points={pointsDesc} />
          <SourceEvolutionTable product={product} points={pointsDesc} />
        </div>
      </div>
    </div>
  );
}

function PriceEvolutionChart({ points }: { points: PriceEvolutionPoint[] }) {
  const width = 720;
  const height = 240;
  const padding = { top: 22, right: 24, bottom: 38, left: 64 };
  const araSeries = buildChartSeries(points, "araPrice");
  const referenceSeries = buildChartSeries(points, "referencePrice");
  const values = [...araSeries, ...referenceSeries].map((point) => point.value);

  if (values.length === 0) {
    return (
      <StateMessage>
        Este producto todavía no tiene precios Aguiar o referencias suficientes
        para graficar.
      </StateMessage>
    );
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(maxValue - minValue, 1);
  const xForIndex = (index: number) => {
    if (points.length === 1) {
      return width / 2;
    }

    return (
      padding.left +
      (index / (points.length - 1)) * (width - padding.left - padding.right)
    );
  };
  const yForValue = (value: number) =>
    padding.top +
    (1 - (value - minValue) / range) *
      (height - padding.top - padding.bottom);

  return (
    <section className="min-w-0 rounded-md border border-[#e5e9ef] bg-[#f8fafc] p-3">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <h3 className="text-sm font-semibold text-[#17202a]">
          Evolución Aguiar vs mercado
        </h3>
        <div className="flex gap-3 text-xs font-medium text-[#526170]">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-5 rounded bg-[#df2e38]" />
            Aguiar
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-5 rounded bg-[#275fbd]" />
            Mercado
          </span>
        </div>
      </div>
      <div className="mt-3 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Gráfico de evolución de precios"
          className="h-auto w-full"
        >
          {[0, 0.5, 1].map((step) => {
            const value = minValue + range * step;
            const y = yForValue(value);

            return (
              <g key={step}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#d9dee7"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#667789] text-[11px]"
                >
                  {compactCurrency(value)}
                </text>
              </g>
            );
          })}

          <ChartPolyline
            series={araSeries}
            color="#df2e38"
            xForIndex={xForIndex}
            yForValue={yForValue}
          />
          <ChartPolyline
            series={referenceSeries}
            color="#275fbd"
            xForIndex={xForIndex}
            yForValue={yForValue}
          />

          <text
            x={padding.left}
            y={height - 10}
            className="fill-[#667789] text-[11px]"
          >
            {formatShortDate(points[0]?.searchedAt ?? "")}
          </text>
          <text
            x={width - padding.right}
            y={height - 10}
            textAnchor="end"
            className="fill-[#667789] text-[11px]"
          >
            {formatShortDate(points[points.length - 1]?.searchedAt ?? "")}
          </text>
        </svg>
      </div>
    </section>
  );
}

function ChartPolyline({
  series,
  color,
  xForIndex,
  yForValue,
}: {
  series: Array<{ index: number; value: number }>;
  color: string;
  xForIndex: (index: number) => number;
  yForValue: (value: number) => number;
}) {
  if (series.length === 0) {
    return null;
  }

  const points = series
    .map((point) => `${xForIndex(point.index)},${yForValue(point.value)}`)
    .join(" ");

  return (
    <g>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {series.map((point) => (
        <circle
          key={`${color}-${point.index}`}
          cx={xForIndex(point.index)}
          cy={yForValue(point.value)}
          r="4"
          fill={color}
          stroke="#ffffff"
          strokeWidth="2"
        />
      ))}
    </g>
  );
}

function EvolutionTimelineTable({
  points,
}: {
  points: PriceEvolutionPoint[];
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#e5e9ef] bg-white">
      <div className="border-b border-[#e5e9ef] px-3 py-3">
        <h3 className="text-sm font-semibold text-[#17202a]">
          Cargas Aguiar guardadas
        </h3>
      </div>
      <div className="grid gap-2 p-3 lg:hidden">
        {points.map((point) => (
          <article
            key={`${point.runId}-mobile`}
            className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
                  Fecha
                </div>
                <div className="mt-1 text-sm font-semibold text-[#17202a]">
                  {formatShortDate(point.searchedAt)}
                </div>
              </div>
              <span className={gapClassName(point.gapPercent)}>
                {formatSignedPercent(point.gapPercent)}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <MobileValue label="Aguiar" value={formatCurrency(point.araPrice)} />
              <MobileValue
                label="Referencia"
                value={formatCurrency(point.referencePrice)}
              />
              <MobileValue
                label="Sugerido"
                value={formatCurrency(point.suggestedPrice)}
              />
              <MobileValue
                label="Fuente"
                value={point.bestSourceName || "-"}
              />
            </dl>
            <div className="mt-3 text-xs font-medium text-[#667789]">
              {point.decisionLabel}
            </div>
          </article>
        ))}
      </div>
      <div className="hidden max-h-[360px] overflow-auto lg:block">
        <table className="min-w-[720px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#edf1f5] text-[#526170]">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Aguiar</th>
              <th className="px-3 py-2">Referencia</th>
              <th className="px-3 py-2">Sugerido</th>
              <th className="px-3 py-2">Brecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9ef]">
            {points.map((point) => (
              <tr key={point.runId}>
                <td className="px-3 py-2 text-[#526170]">
                  {formatShortDate(point.searchedAt)}
                </td>
                <td className="px-3 py-2 font-semibold text-[#17202a]">
                  {formatCurrency(point.araPrice)}
                </td>
                <td className="px-3 py-2 text-[#173d2f]">
                  <div className="font-semibold">
                    {formatCurrency(point.referencePrice)}
                  </div>
                  <div className="mt-1 text-[#667789]">
                    {point.bestSourceName || "-"}
                  </div>
                </td>
                <td className="px-3 py-2 font-semibold text-[#1d5f8f]">
                  {formatCurrency(point.suggestedPrice)}
                </td>
                <td className="px-3 py-2">
                  <span className={gapClassName(point.gapPercent)}>
                    {formatSignedPercent(point.gapPercent)}
                  </span>
                  <div className="mt-1 text-[#667789]">
                    {point.decisionLabel}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourceEvolutionTable({
  product,
  points,
}: {
  product: PriceEvolutionProduct;
  points: PriceEvolutionPoint[];
}) {
  const sourceNames = product.sourceNames;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#e5e9ef] bg-white">
      <div className="border-b border-[#e5e9ef] px-3 py-3">
        <h3 className="text-sm font-semibold text-[#17202a]">
          Evolución por empresa
        </h3>
      </div>
      {sourceNames.length === 0 ? (
        <div className="px-3 py-5 text-sm text-[#667789]">
          No hay precios por fuente para este producto.
        </div>
      ) : (
        <>
          <div className="grid gap-2 p-3 lg:hidden">
            {points.map((point) => {
              const sourceRows = buildSourceRows(sourceNames, point);

              return (
                <article
                  key={`${point.runId}-sources-mobile`}
                  className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] p-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
                    {formatShortDate(point.searchedAt)}
                  </div>
                  <div className="mt-3 divide-y divide-[#e5e9ef] rounded-md border border-[#e5e9ef] bg-white">
                    {sourceRows.map(({ sourceName, sourcePrice }) => (
                      <div
                        key={`${point.runId}-${sourceName}-mobile`}
                        className="flex items-start justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="break-words text-sm font-medium text-[#17202a]">
                            {sourceName}
                          </div>
                          {sourcePrice ? (
                            <div className="mt-1 text-xs text-[#667789]">
                              {sourcePrice.storeType}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={`shrink-0 text-right text-sm ${
                            sourcePrice
                              ? "font-semibold text-[#173d2f]"
                              : "text-[#9aa5b1]"
                          }`}
                        >
                          {sourcePrice
                            ? formatComparableSourceCurrency(sourcePrice)
                            : "Sin precio"}
                          {sourcePrice ? (
                            <PackagePriceDetail price={sourcePrice} />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="hidden max-h-[360px] overflow-auto lg:block">
            <table className="min-w-[720px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[#edf1f5] text-[#526170]">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  {sourceNames.map((sourceName) => (
                    <th key={sourceName} className="px-3 py-2">
                      {sourceName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e9ef]">
                {points.map((point) => (
                  <tr key={`${point.runId}-sources`}>
                    <td className="px-3 py-2 text-[#526170]">
                      {formatShortDate(point.searchedAt)}
                    </td>
                    {sourceNames.map((sourceName) => {
                      const sourcePrice = point.sourcePrices.find(
                        (price) => price.storeName === sourceName,
                      );

                      return (
                        <td
                          key={`${point.runId}-${sourceName}`}
                          className="px-3 py-2"
                        >
                          {sourcePrice ? (
                            <div>
                              <div className="font-semibold text-[#173d2f]">
                                {formatComparableSourceCurrency(sourcePrice)}
                              </div>
                              <PackagePriceDetail price={sourcePrice} />
                              <div className="mt-1 text-[#667789]">
                                {sourcePrice.storeType}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#9aa5b1]">Sin precio</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function EvolutionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 break-words text-lg font-semibold text-[#17202a] sm:text-xl">
        {value}
      </div>
    </div>
  );
}

function MobileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-[#667789]">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-[#17202a]">{value}</dd>
    </div>
  );
}

function StateMessage({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#526170]">
      {children}
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
      {children}
    </div>
  );
}

function filterProducts(products: PriceEvolutionProduct[], searchTerm: string) {
  const normalizedTerm = normalizeText(searchTerm);

  if (!normalizedTerm) {
    return products;
  }

  return products.filter((product) =>
    [
      product.description,
      product.rubro,
      product.code,
      product.ean13Di,
      product.ean13Bu,
    ]
      .filter(Boolean)
      .some((value) => normalizeText(String(value)).includes(normalizedTerm)),
  );
}

function buildEvolutionStats(product: PriceEvolutionProduct) {
  const araBounds = getFirstAndLastPrice(product.points, "araPrice");
  const referenceBounds = getFirstAndLastPrice(product.points, "referencePrice");

  return {
    lastAra: araBounds.last,
    lastReference: referenceBounds.last,
    araVariationPercent: calculateVariationPercent(
      araBounds.first,
      araBounds.last,
    ),
    referenceVariationPercent: calculateVariationPercent(
      referenceBounds.first,
      referenceBounds.last,
    ),
    sourcesCount: product.sourceNames.length,
  };
}

function getFirstAndLastPrice(
  points: PriceEvolutionPoint[],
  field: "araPrice" | "referencePrice",
) {
  const values = points
    .map((point) => point[field])
    .filter((value): value is number => typeof value === "number");

  return {
    first: values[0] ?? null,
    last: values[values.length - 1] ?? null,
  };
}

function buildChartSeries(
  points: PriceEvolutionPoint[],
  field: "araPrice" | "referencePrice",
) {
  return points.flatMap((point, index) => {
    const value = point[field];

    if (typeof value !== "number") {
      return [];
    }

    return [{ index, value }];
  });
}

function calculateVariationPercent(first: number | null, last: number | null) {
  if (!first || last === null) {
    return null;
  }

  return ((last - first) / first) * 100;
}

function getLatestPoint(product: PriceEvolutionProduct) {
  return product.points[product.points.length - 1] ?? null;
}

function buildSourceRows(
  sourceNames: string[],
  point: PriceEvolutionPoint,
) {
  return sourceNames
    .map((sourceName) => ({
      sourceName,
      sourcePrice:
        point.sourcePrices.find((price) => price.storeName === sourceName) ??
        null,
    }))
    .sort((first, second) => {
      if (first.sourcePrice && second.sourcePrice) {
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

      return first.sourceName.localeCompare(second.sourceName, "es");
    });
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCurrency(value: number | null) {
  return value === null ? "-" : currencyFormatter.format(value);
}

function getComparablePrice(price: PriceListSourcePrice) {
  return typeof price.comparisonPrice === "number" && price.comparisonPrice > 0
    ? price.comparisonPrice
    : price.price;
}

function formatComparableSourceCurrency(price: PriceListSourcePrice) {
  return currencyFormatter.format(getComparablePrice(price));
}

function PackagePriceDetail({ price }: { price: PriceListSourcePrice }) {
  if (!price.packageQuantity || price.packageQuantity <= 1) {
    return null;
  }

  return (
    <div className="mt-1 text-xs font-normal text-[#667789]">
      {price.packageLabel ?? `pack x ${price.packageQuantity}`}:{" "}
      {formatCurrency(price.price)}
    </div>
  );
}

function compactCurrency(value: number) {
  if (value >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }

  return `$${Math.round(value)}`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "-";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(value)}%`;
}

function formatShortDate(value: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function gapClassName(value: number | null) {
  const base = "inline-flex rounded px-2 py-1 text-[11px] font-semibold";

  if (value === null) {
    return `${base} bg-[#eef1f4] text-[#526170]`;
  }

  if (value > 12) {
    return `${base} bg-[#fff1ef] text-[#8f2d20]`;
  }

  if (value < -8) {
    return `${base} bg-[#eaf2ff] text-[#1d5f8f]`;
  }

  return `${base} bg-[#e4f6ed] text-[#16613c]`;
}
