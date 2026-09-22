"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { CommercialReference } from "@/lib/commercial-reference";
import type { ProductSearchResult } from "@/types/search";
import { ImportDecisionTable } from "./ImportDecisionTable";

export function CatalogCommercialPanel({ products }: { products: ProductSearchResult[] }) {
  const [reference, setReference] = useState<CommercialReference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const identities = useMemo(() => products.map(({ sourceId, storeName, storeType, sku, barcodes }) =>
    ({ sourceId, storeName, storeType, sku, barcodes })), [products]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setReference(null);
    setError(null);
    fetch("/api/price-list/reference", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: identities }), cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("No se pudo leer la evaluacion Excel guardada.");
        return response.json() as Promise<CommercialReference>;
      })
      .then(data => { if (active) setReference(data); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Error de lectura."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [revision, identities]);
  return (
    <section aria-label="Evaluacion comercial Excel" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-[#d9dee7] py-3">
        <div className="min-w-0 text-sm text-[#526170]" role="status">
          {loading ? "Cargando evaluacion Excel..." : error ? error : reference?.runId ? (
            <><strong className="text-[#17202a]">{reference.listName}</strong> · Evaluacion guardada: {new Date(reference.evaluatedAt!).toLocaleString("es-AR")} · {reference.results.length} articulos identificados</>
          ) : "Sin evaluacion Excel guardada. No se conoce la posicion comercial de Aguiar."}
        </div>
        <div className="flex items-center gap-3">
          <Link className="text-sm font-semibold text-[#153d7b] underline" href={reference?.runId ? `/historial?run=${encodeURIComponent(reference.runId)}` : "/importacion"}>
            {reference?.runId ? "Ver carga" : "Importar Excel"}
          </Link>
          <button type="button" aria-label="Actualizar evaluacion Excel" title="Actualizar evaluacion Excel" disabled={loading}
            onClick={() => setRevision(value => value + 1)} className="rounded p-2 text-[#153d7b] disabled:opacity-40">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {reference?.ambiguousMatches ? <p role="status" className="text-sm text-[#73510b]">{reference.ambiguousMatches} coincidencias ambiguas; excluidas de la evaluacion.</p> : null}
      {reference?.results.length ? (
        <ImportDecisionTable response={{ results: reference.results, searchedAt: reference.evaluatedAt! }} />
      ) : !loading && !error && reference?.runId ? (
        <p className="text-sm text-[#526170]">Sin coincidencia exacta con esta carga Excel. Los precios del catalogo quedan como referencias, sin semaforo de venta propio.</p>
      ) : null}
    </section>
  );
}
