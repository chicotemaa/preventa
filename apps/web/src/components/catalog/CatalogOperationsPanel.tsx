"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileSpreadsheet, RefreshCw } from "lucide-react";
import { buildCatalogReadiness, type CatalogOperationalStatus } from "@/lib/catalog-readiness";
import { formatPriceObservation } from "@/lib/price-freshness";
import { CatalogFreshnessBanner } from "./CatalogFreshnessBanner";

const count = (value?: number | null) => value == null ? "Sin verificar" : value.toLocaleString("es-AR");

export function CatalogOperationsPanel() {
  const [data, setData] = useState<CatalogOperationalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    void fetch("/api/catalog-status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("No se pudo consultar el estado operativo.");
        return await response.json() as CatalogOperationalStatus;
      })
      .then(payload => { if (active) setData(payload); })
      .catch(() => { if (active) setError("No se pudo verificar el estado. Reintentar la consulta."); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [revision]);

  const readiness = data ? buildCatalogReadiness(data) : null;
  const observations = data?.catalog?.priceObservations;

  return (
    <section aria-labelledby="catalog-operations-title" className="min-w-0 border-b border-[#d9dee7] bg-white px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="catalog-operations-title" className="text-lg font-bold text-[#17202a]">Estado para decidir</h2>
          <p className="mt-1 text-sm text-[#526170]">Excel: venta Aguiar · Tokin: costo proveedor · Mayoristas: referencia de mercado</p>
        </div>
        <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}
          aria-label="Actualizar estado" title="Actualizar estado"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#d9dee7] disabled:opacity-50">
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {loading ? <p role="status" className="py-6 text-sm">Consultando datos guardados...</p> : null}
      {error || data?.errorMessage ? <p role="alert" className="mt-3 text-sm text-red-800">{error ?? data?.errorMessage}</p> : null}
      {data ? <>
        <div className="my-4 flex flex-wrap items-center justify-between gap-3 border-y border-[#d9dee7] py-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{data.excel.status === "available" ? data.excel.name : data.excel.status === "missing" ? "Falta una lista Excel activa" : "Excel: no se pudo verificar"}</p>
            <p className="mt-1 text-[#526170]">{data.excel.status === "available"
              ? `${count(data.excel.pricesCount)} precios de venta / ${count(data.excel.itemsCount)} articulos · Carga: ${formatPriceObservation(data.excel.savedAt)}`
              : "Sin precio de venta Excel no se puede calcular la posicion comercial de Aguiar."}</p>
          </div>
          <Link href="/importacion" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#153d7b] underline underline-offset-4">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Importar Excel vigente
          </Link>
        </div>
        {data.catalog ? <CatalogFreshnessBanner catalog={data.catalog} /> : null}
        <dl className="grid grid-cols-2 gap-4 py-5 lg:grid-cols-4">
          {[
            ["Productos guardados", count(data.catalog?.productsCount)],
            ["Consultados en 36 h", count(observations?.currentProducts)],
            ["Precios de mas de 36 h", count(observations?.outdatedProducts)],
            ["Sin fecha verificable", count(observations?.undatedProducts)],
          ].map(([label, value]) => <div key={label} className="min-w-0">
            <dt className="text-xs font-medium text-[#526170]">{label}</dt>
            <dd className="mt-1 break-words text-xl font-bold text-[#17202a]">{value}</dd>
          </div>)}
        </dl>
        <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">{data.cronConfigured ? "Actualizacion programada: 12:00 Argentina" : "Programacion sin configurar en este entorno"}</p>
          <p className="mt-1">Recorrido parcial: Tokin y Maxiconsumo Chaco a diario; otras fuentes por rotacion. No equivale a renovar todo el catalogo cada dia.</p>
          {data.catalog && readiness?.criticalWholesalersWithoutCurrentPrices ? <p className="mt-1">{readiness.criticalWholesalersWithoutCurrentPrices} mayoristas criticos sin precios de las ultimas 36 horas. Cobertura insuficiente para una recomendacion firme.</p> : null}
        </div>
        <details>
          <summary className="cursor-pointer py-2 text-sm font-semibold">Vigencia por fuente</summary>
          <ul className="divide-y divide-[#d9dee7]">
            {readiness?.sources.map(source => <li key={source.sourceId} className="grid min-w-0 gap-2 py-3 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="font-semibold">{source.name}</p>
                <p className="text-xs text-[#526170]">{source.channel === "own" ? "Proveedor" : source.channel === "mayorista" ? "Mayorista" : "Minorista"}{source.critical ? " · Critica" : ""}</p>
              </div>
              <div>
                <p className={source.state === "Vigente" ? "text-green-800" : "text-amber-900"}>{source.state}</p>
                <p className="text-xs text-[#526170]">{data.catalog ? `${count(source.current)} vigentes / ${count(source.total)} guardados` : "Conteo no disponible"}</p>
              </div>
              <p className="text-xs text-[#526170]">Ultimo precio fechado: {formatPriceObservation(source.latestPriceAt)}</p>
              {source.note ? <p className="break-words text-xs text-[#526170] md:col-span-3">{source.note}</p> : null}
            </li>)}
          </ul>
        </details>
        <p className="mt-3 text-xs text-[#526170]">Estado consultado: {formatPriceObservation(data.checkedAt)}</p>
      </> : null}
    </section>
  );
}
