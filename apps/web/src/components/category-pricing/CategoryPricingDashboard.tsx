"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CatalogFreshnessBanner } from "@/components/catalog/CatalogFreshnessBanner";
import { CategoryDecisionTable } from "@/components/category-pricing/CategoryDecisionTable";
import { CategoryProductDetail } from "@/components/category-pricing/CategoryProductDetail";
import { CategorySourceHealth } from "@/components/category-pricing/CategorySourceHealth";
import {
  buildCategoryPricingDashboard,
  countDecisionRowsByFilter,
  filterAndSortDecisionRows,
  formatGapExplanation,
  type CategoryDecisionFilter,
  type CategoryDecisionSort,
  type CategoryPricingDashboard as CategoryPricingDashboardModel,
  type PricingTone,
} from "@/lib/category-pricing";
import type {
  CatalogMetadata,
  CategorySearchGroup,
  SourceSearchStatus,
} from "@/types/search";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

const filterOptions: Array<{ value: CategoryDecisionFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "mayoristas", label: "Solo mayoristas" },
  { value: "minoristas", label: "Solo minoristas" },
  { value: "alerts", label: "Con alertas" },
  { value: "critical_gap", label: "Diferencia critica" },
  { value: "opportunities", label: "Oportunidades" },
  { value: "missing_aguiar", label: "Sin equivalente Aguiar" },
  { value: "weak_match", label: "Equivalencia dudosa" },
  { value: "sources_with_data", label: "Fuentes con datos" },
];

const sortOptions: Array<{ value: CategoryDecisionSort; label: string }> = [
  { value: "wholesale_price", label: "Menor precio mayorista" },
  { value: "gap_desc", label: "Mayor diferencia vs Aguiar" },
  { value: "retail_price", label: "Menor precio minorista" },
  { value: "confidence_desc", label: "Mayor confianza" },
  { value: "winning_source", label: "Fuente ganadora" },
  { value: "brand", label: "Marca" },
  { value: "presentation", label: "Presentacion" },
];

export function CategoryPricingDashboard({
  group,
  sources,
  searchedAt,
  catalog,
}: {
  group: CategorySearchGroup;
  sources: SourceSearchStatus[];
  searchedAt: string;
  catalog?: CatalogMetadata;
}) {
  const dashboard = useMemo(
    () => buildCategoryPricingDashboard({ group, sources, searchedAt }),
    [group, searchedAt, sources],
  );
  const [filter, setFilter] = useState<CategoryDecisionFilter>("all");
  const [sort, setSort] = useState<CategoryDecisionSort>("wholesale_price");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const rows = useMemo(
    () => filterAndSortDecisionRows(dashboard.rows, filter, sort, searchTerm),
    [dashboard.rows, filter, searchTerm, sort],
  );
  const selectedRow = useMemo(
    () => dashboard.rows.find((row) => row.id === selectedRowId) ?? null,
    [dashboard.rows, selectedRowId],
  );
  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        filterOptions.map((option) => [
          option.value,
          countDecisionRowsByFilter(dashboard.rows, option.value),
        ]),
      ) as Record<CategoryDecisionFilter, number>,
    [dashboard.rows],
  );

  return (
    <section className="flex flex-col gap-4">
      <ExecutiveSummary dashboard={dashboard} />
      {catalog ? <CatalogFreshnessBanner catalog={catalog} compact /> : null}

      <section className="rounded-md border border-[#d9dee7] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-[#e5e9ef] pb-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#17202a]">Mesa de decision</h3>
            <p className="mt-1 text-sm text-[#667789]">
              Primero se muestran los artículos propios. La posición de Aguiar se calcula contra
              el mejor precio del mercado comparable, priorizando referencias mayoristas.
            </p>
          </div>
          <label className="flex min-w-0 items-center gap-2 rounded-md border border-[#cfd8e3] bg-white px-3 py-2 text-sm text-[#526170] lg:min-w-[300px]">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#667789]" />
            <span className="sr-only">Buscar dentro de resultados</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar dentro de resultados"
              className="min-w-0 flex-1 bg-transparent text-[#17202a] outline-none placeholder:text-[#9aa5b1]"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={
                  filter === option.value
                    ? "rounded-md bg-[#17202a] px-3 py-2 text-xs font-bold text-white"
                    : "rounded-md border border-[#d9dee7] bg-white px-3 py-2 text-xs font-bold text-[#526170] hover:border-[#153d7b]"
                }
              >
                {option.label} ({filterCounts[option.value]})
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-[#526170]">
            Ordenar
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as CategoryDecisionSort)}
              className="h-10 rounded-md border border-[#cfd8e3] bg-white px-3 text-sm font-semibold text-[#17202a] outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <CategoryDecisionTable rows={rows} onOpenDetail={setSelectedRowId} />
        </div>
      </section>

      <CategorySourceHealth summary={dashboard.sourceHealth} />
      <CategoryProductDetail row={selectedRow} onClose={() => setSelectedRowId(null)} />
    </section>
  );
}

function ExecutiveSummary({ dashboard }: { dashboard: CategoryPricingDashboardModel }) {
  const searchedDate = new Date(dashboard.searchedAt);

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e5e9ef] px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-[#e02c3b]">
            Tablero competitivo de precios
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-[#17202a]">
            {dashboard.familyName}
          </h2>
          <p className="mt-1 text-sm text-[#667789]">
            Busqueda: {Number.isNaN(searchedDate.getTime()) ? "-" : dateFormatter.format(searchedDate)}
          </p>
        </div>
        <RecommendationPanel
          label={dashboard.recommendation.label}
          reason={dashboard.recommendation.reason}
          tone={dashboard.recommendation.tone}
        />
      </div>

      <div className="grid gap-px bg-[#e5e9ef] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <SummaryMetric
          label="Grupos comparables"
          value={dashboard.rows.length}
          helper={`${dashboard.totalProducts} registros encontrados`}
        />
        <SummaryMetric
          label="Artículos Aguiar / Tokin"
          value={dashboard.aguiarProductsCount}
          helper={
            dashboard.visibleAguiarProductsCount < dashboard.aguiarProductsCount
              ? `${dashboard.visibleAguiarProductsCount} visibles`
              : undefined
          }
        />
        <SummaryMetric
          label="Posición promedio"
          value={formatGapExplanation(dashboard.averageGapVsAguiarPercent)}
          helper={`${dashboard.comparableRowsCount} comparaciones válidas`}
        />
        <SummaryMetric
          label="Aguiar más caro"
          value={dashboard.aboveMarketRowsCount}
          helper="Requieren revisión"
          tone={dashboard.aboveMarketRowsCount > 0 ? "danger" : "neutral"}
        />
        <SummaryMetric
          label="Precio competitivo"
          value={dashboard.competitiveRowsCount}
          helper="Dentro del rango esperado"
        />
        <SummaryMetric
          label="Oportunidades de margen"
          value={dashboard.opportunityRowsCount}
          helper={`${dashboard.withoutOwnEquivalentRowsCount} sin equivalente propio`}
        />
        <SummaryMetric
          label="Cobertura"
          value={`${dashboard.sourceHealth.withData}/${dashboard.sourceHealth.total}`}
          helper={`${dashboard.criticalAlertsCount} alertas críticas`}
          tone={dashboard.criticalAlertsCount > 0 ? "danger" : "neutral"}
        />
      </div>
    </section>
  );
}

function RecommendationPanel({
  label,
  reason,
  tone,
}: {
  label: string;
  reason: string;
  tone: PricingTone;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${recommendationPanelClassName(tone)}`}>
      <div className="text-sm font-extrabold">{label}</div>
      <div className="mt-1 max-w-xl text-xs leading-4">{reason}</div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  helper?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className={tone === "danger" ? "bg-[#fff4f2] p-3" : "bg-[#fffdfa] p-3"}>
      <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-black text-[#17202a]">{value}</div>
      {helper ? (
        <div className="mt-0.5 truncate text-[11px] font-semibold text-[#667789]">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function recommendationPanelClassName(tone: PricingTone) {
  if (tone === "danger") {
    return "border-[#f5c9c1] bg-[#fff4f2] text-[#9b2f1c]";
  }

  if (tone === "warning") {
    return "border-[#f0d898] bg-[#fff8e8] text-[#73510b]";
  }

  if (tone === "info") {
    return "border-[#c8dcff] bg-[#f1f7ff] text-[#153d7b]";
  }

  if (tone === "success") {
    return "border-[#c8e8d2] bg-[#f4fbf7] text-[#16613c]";
  }

  return "border-[#d9dee7] bg-[#f8fafc] text-[#526170]";
}
