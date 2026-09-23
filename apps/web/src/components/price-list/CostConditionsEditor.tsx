"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Save, X } from "lucide-react";
import { calculateCostStructure, parseCostConditions, type CostConditions } from "@/lib/cost-structure";
import { analyzePriceListCommercial, DEFAULT_TARGET_GROSS_MARGIN_RATIO } from "@/lib/price-list-commercial";
import type { PriceListItemResult } from "@/types/search";
import { formatPriceObservation } from "@/lib/price-freshness";

const fields = [
  ["purchaseVatPercent", "IVA compra %", 100],
  ["recoverableVatPercent", "IVA compra recuperable %", 100],
  ["saleVatPercent", "IVA venta %", 100],
  ["discountPercent", "Descuento adicional %", 99.99],
  ["bonusPercent", "Bonificacion monetaria adicional %", 99.99],
  ["freightPerUnit", "Flete por unidad $", 1e9],
  ["financingPercent", "Financiacion de la compra %", 100],
  ["otherCostsPerUnit", "Otros costos por unidad $", 1e9],
  ["targetMarginPercent", "Margen objetivo sobre venta neta %", 89.99],
] as const;

export function CostConditionsEditor({ result, onSave, onClose }: {
  result: PriceListItemResult;
  onSave: (value: CostConditions | null) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const c = result.costConditions;
    return {
      purchaseTaxBasis: c?.purchaseTaxBasis ?? "",
      saleTaxBasis: c?.saleTaxBasis ?? "",
      ...Object.fromEntries(fields.map(([key]) => [key, c ? String(c[key]) : key === "targetMarginPercent"
        ? String(DEFAULT_TARGET_GROSS_MARGIN_RATIO * 100) : ""])),
    };
  });
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const candidate = parseCostConditions({
    ...draft, version: 1, confirmedAt: new Date().toISOString(),
    ...Object.fromEntries(fields.map(([key]) => [key, draft[key]?.trim() ? Number(draft[key]) : null])),
  });
  const previewAnalysis = analyzePriceListCommercial({ ...result, costConditions: candidate });
  const preview = previewAnalysis.costBreakdown;
  function change(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setConfirmed(false);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (candidate && confirmed) onSave(candidate);
  }
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby={titleId}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-3xl overflow-y-auto rounded-md border border-[#cfd8e3] bg-white p-4 text-[#17202a] shadow-xl backdrop:bg-black/40 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-bold">Condiciones de costo</h2>
          <p className="mt-1 text-sm">{result.input.description} · {result.input.code}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar condiciones" title="Cerrar" className="shrink-0 rounded p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
      </div>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {([["purchaseTaxBasis", "Referencia Tokin"], ["saleTaxBasis", "Venta Excel"]] as const).map(([key, label]) => (
            <label key={key} className="text-sm font-semibold">{label}
              <select required value={draft[key]} onChange={(e) => change(key, e.target.value)} className="mt-1 h-10 w-full rounded border border-[#cfd8e3] bg-white px-2">
                <option value="">IVA sin confirmar</option>
                <option value="included">Incluye IVA</option>
                <option value="excluded">No incluye IVA</option>
              </select>
            </label>
          ))}
          {fields.map(([key, label, max]) => (
            <label key={key} className="text-sm font-semibold">{label}
              <input required type="number" min="0" max={max} step="0.01" inputMode="decimal" value={draft[key]}
                onChange={(e) => change(key, e.target.value)} className="mt-1 h-10 w-full rounded border border-[#cfd8e3] px-2" />
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-[#526170]">Descuentos y bonificaciones monetarias adicionales se aplican en cadena, sin duplicar los ya incluidos en Tokin. Flete y otros costos: importes por unidad, netos de IVA recuperable. Financiacion: sobre mercaderia descontada mas IVA no recuperable. Cero significa que el concepto no aplica; vacio significa pendiente.</p>
        {preview ? (
          <dl className="grid grid-cols-2 gap-3 border-y py-3 text-sm sm:grid-cols-3">
            <Metric label="Costo ajustado / unidad" value={money(preview.effectiveUnitCost)} />
            <Metric label="Venta neta / unidad" value={money(preview.netSalePrice)} />
            <Metric label="Piso en base IVA del Excel" value={money(preview.targetExcelPrice)} />
          </dl>
        ) : <p role="status" className="text-sm text-[#73510b]">{previewAnalysis.economicsReason}</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} required className="mt-1" />
          Confirmo estas condiciones para este articulo y su unidad equivalente.
        </label>
        <p className="text-xs text-[#526170]">Margen estimado, no rentabilidad neta. Los gastos no informados no estan incluidos.</p>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {result.costConditions ? <button type="button" onClick={() => onSave(null)} className="px-3 py-2 text-sm text-[#8f2d20]">Quitar condiciones</button> : null}
          <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">Cancelar</button>
          <button type="submit" disabled={!candidate || !confirmed} className="inline-flex items-center gap-2 rounded bg-[#153d7b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Aplicar al articulo</button>
        </div>
      </form>
    </dialog>
  );
}

export function CostBreakdownDetail({ result }: { result: PriceListItemResult }) {
  const c = parseCostConditions(result.costConditions);
  const b = calculateCostStructure(result.ownPrice?.tokinPrice, result.ownPrice?.excelPrice ?? result.input.currentPrice, c);
  if (!b || !c) return <p className="text-xs text-[#73510b]">Costo final sin confirmar. Tokin es referencia del proveedor.</p>;
  return (
    <details className="my-2 text-xs">
      <summary className="cursor-pointer font-semibold">Desglose de costo informado</summary>
      <dl className="mt-2 space-y-1">
        <Metric label="Tokin neto de IVA" value={money(b.supplierNet)} />
        <Metric label="Descuento adicional" value={money(-b.discountAmount)} />
        <Metric label="Bonificacion adicional" value={money(-b.bonusAmount)} />
        <Metric label="IVA no recuperable" value={money(b.nonRecoverableVat)} />
        <Metric label="Flete / unidad" value={money(b.freight)} />
        <Metric label="Financiacion / unidad" value={money(b.financing)} />
        <Metric label="Otros / unidad" value={money(b.otherCosts)} />
        <Metric label="Costo ajustado / unidad" value={money(b.effectiveUnitCost)} />
        <Metric label="Objetivo sobre venta neta" value={`${c.targetMarginPercent}%`} />
        <Metric label="Condiciones confirmadas" value={formatPriceObservation(c.confirmedAt)} />
      </dl>
      <p className="mt-2">Desglose de las condiciones guardadas; no acredita vigencia del precio.</p>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[#526170]">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}

function money(value: number | null) {
  return value === null ? "-" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}
