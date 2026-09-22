"use client";

import { useId, useRef } from "react";
import { ChartNoAxesCombined, X } from "lucide-react";
import type { PricingImpact } from "@/lib/pricing-impact";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function PricingImpactDetail({ impact }: { impact: PricingImpact }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const formatMoney = (value: number | null) => value === null ? "Sin datos" : money.format(value);
  return (
    <div className="mt-2 text-xs text-[#526170]">
      <button type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"
        className="flex items-start gap-1 text-left font-semibold text-[#153d7b] underline decoration-dotted underline-offset-4">
        <ChartNoAxesCombined className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Exposicion a 30 dias: {formatMoney(impact.priceExposure)}</span>
      </button>
      <dialog ref={dialog} aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-md border border-[#cfd8e3] bg-white p-0 text-sm text-[#526170] shadow-xl backdrop:bg-black/40">
        <div className="p-5">
        <header className="flex items-start justify-between gap-3 border-b border-[#d9dee7] pb-3">
          <div><h3 id={titleId} className="text-base font-bold text-[#17202a]">Impacto comercial estimado</h3>
            <p className="mt-1">Exposicion a 30 dias: <strong>{formatMoney(impact.priceExposure)}</strong></p></div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar impacto comercial" title="Cerrar" className="shrink-0 rounded p-1.5 hover:bg-[#eef2f6]"><X className="h-5 w-5" /></button>
        </header>
      <dl className="mt-4 grid grid-cols-1 gap-3">
        <div><dt className="inline">Volumen equivalente / 30 dias: </dt><dd className="inline">{impact.monthlyUnits === null ? "Sin datos" : number.format(impact.monthlyUnits)}</dd></div>
        <div><dt className="inline">Venta a precio Excel / 30 dias: </dt><dd className="inline">{formatMoney(impact.monthlySales)}</dd></div>
        <div><dt className="inline">Contribucion estimada / 30 dias: </dt><dd className="inline">{formatMoney(impact.monthlyContribution)}</dd></div>
        <div><dt className="inline">Referencia regular con stock: </dt><dd className="inline">{formatMoney(impact.referencePrice)} · {impact.referenceLabel}</dd></div>
        <div><dt className="inline">Stock propio: </dt><dd className="inline">{impact.stockUnits === null ? "Sin dato vigente" : `${number.format(impact.stockUnits)} unidades`}</dd></div>
        <div><dt className="inline">Cobertura: </dt><dd className="inline">{impact.stockCoverDays === null ? "Sin rotacion verificable" : `${number.format(impact.stockCoverDays)} dias`}</dd></div>
        <div><dt className="inline">Stock a costo ajustado: </dt><dd className="inline">{formatMoney(impact.stockValue)}</dd></div>
      </dl>
      <p className="mt-4 border-t border-[#d9dee7] pt-3 leading-5">{impact.reason}</p>
        </div>
      </dialog>
    </div>
  );
}
