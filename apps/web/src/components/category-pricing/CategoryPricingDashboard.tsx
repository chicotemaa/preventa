"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CatalogFreshnessBanner } from "@/components/catalog/CatalogFreshnessBanner";
import { CatalogCommercialPanel } from "@/components/price-list/CatalogCommercialPanel";
import { CategoryProductDetail } from "./CategoryProductDetail";
import { CategorySourceHealth } from "./CategorySourceHealth";
import { buildCategoryPricingDashboard } from "@/lib/category-pricing";
import type { CatalogMetadata, CategorySearchGroup, SourceSearchStatus } from "@/types/search";

export function CategoryPricingDashboard({ group, sources, searchedAt, catalog }: {
  group: CategorySearchGroup;
  sources: SourceSearchStatus[];
  searchedAt: string;
  catalog?: CatalogMetadata;
}) {
  const dashboard = useMemo(() => buildCategoryPricingDashboard({ group, sources, searchedAt }), [group, sources, searchedAt]);
  const products = useMemo(() => [...group.tokinProducts, ...group.competitorProducts], [group]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const selected = dashboard.rows.find(row => row.id === selectedRowId) ?? null;
  const detailRows = useMemo(() => {
    const term = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return dashboard.rows.filter(row => `${row.clusterName} ${row.brand}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(term));
  }, [dashboard.rows, search]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <header className="border-b border-[#d9dee7] py-3">
        <h2 className="text-2xl font-bold text-[#17202a]">{group.categoryName}</h2>
        <p className="mt-1 text-sm text-[#526170]">
          {group.totalProducts} registros de catalogo · {group.tokinProductsCount ?? group.tokinProducts.length} referencias Tokin · {group.competitorProductsCount ?? group.competitorProducts.length} competidores
        </p>
        <p className="mt-1 text-xs text-[#667789]">Consulta: {new Date(searchedAt).toLocaleString("es-AR")}</p>
      </header>
      {catalog ? <CatalogFreshnessBanner catalog={catalog} compact /> : null}
      <CatalogCommercialPanel products={products} />
      <details className="border-y border-[#d9dee7] py-3">
        <summary className="cursor-pointer text-sm font-bold text-[#153d7b]">Ver detalle de productos del catalogo ({dashboard.rows.length})</summary>
        <label className="my-3 flex max-w-lg items-center gap-2 rounded border border-[#cfd8e3] px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="sr-only">Filtrar detalle del catalogo</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Producto o marca" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {detailRows.map(row => <button key={row.id} type="button" onClick={() => setSelectedRowId(row.id)}
            className="rounded-md border border-[#d9dee7] bg-white p-3 text-left hover:border-[#153d7b]">
            <span className="block text-sm font-bold text-[#17202a]">{row.clusterName}</span>
            <span className="mt-1 block text-xs text-[#667789]">{row.brand} · {row.presentationLabel} · {row.products.length} referencias</span>
          </button>)}
        </div>
        {!detailRows.length ? <p className="py-3 text-sm text-[#667789]">Sin productos para este filtro.</p> : null}
      </details>
      <CategorySourceHealth summary={dashboard.sourceHealth} />
      <CategoryProductDetail row={selected} onClose={() => setSelectedRowId(null)} />
    </section>
  );
}
