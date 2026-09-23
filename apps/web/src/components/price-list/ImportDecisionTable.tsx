"use client";

import { PriceFreshnessLabel } from "@/components/catalog/PriceFreshnessLabel";
import { formatPriceObservation } from "@/lib/price-freshness";
import { CostConditionsEditor, CostBreakdownDetail } from "./CostConditionsEditor";
import type { CostConditions } from "@/lib/cost-structure";
import { analyzePricingImpact, comparePricingImpact, type PricingImpact } from "@/lib/pricing-impact";
import { PricingImpactDetail } from "./PricingImpactDetail";

import {
  AlertTriangle,
  CircleCheck,
  Search,
  TrendingDown,
  TrendingUp,
  Settings2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { isReliableSourcePrice } from "@/lib/price-list-commercial";
import { getWholesalePosition, summarizeDecisionReadiness } from "@/lib/price-position";
import { getPriceConditionWarning } from "@/lib/price-comparison-safety";
import {
  analyzePriceListDecision,
  getPriceListComparablePrice,
  sortPriceListResultPrices,
  type PriceListDecisionAnalysis,
  type PriceListDecisionKind,
  type PriceListDecisionTone,
} from "@/lib/price-list-decision";
import type {
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
} from "@/types/search";

type ImportDecisionFilter =
  | "all"
  | "attention"
  | "cost_risk"
  | "above_wholesale"
  | "competitive"
  | "opportunity"
  | "missing_own"
  | "without_wholesale";

type AnalyzedResult = {
  impact: PricingImpact;
  result: PriceListItemResult;
  decision: PriceListDecisionAnalysis;
};

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("es-AR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function ImportDecisionTable({
  response,
  onCostConditionsChange,
  example = false,
}: {
  response: Pick<PriceListResponse, "results" | "searchedAt">;
  onCostConditionsChange?: (rowNumber: number, value: CostConditions | null) => void;
  example?: boolean;
}) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const editingResult = response.results.find((row) => row.input.rowNumber === editingRow);
  const [filter, setFilter] = useState<ImportDecisionFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<"impact" | "severity">("impact");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [filter, searchTerm, sort, response.results]);
  const analyzedResults = useMemo(
    () =>
      response.results.map((result) => {
        const sortedResult = sortPriceListResultPrices(result);
        const decision = analyzePriceListDecision(sortedResult);
        return {
          result: sortedResult,
          decision,
          impact: analyzePricingImpact(sortedResult, decision),
        };
      }),
    [response.results],
  );
  const counts = useMemo(
    () => ({
      total: analyzedResults.length,
      attention: analyzedResults.filter(({ decision }) =>
        isAttention(decision.kind),
      ).length,
      costRisk: analyzedResults.filter(({ decision }) =>
        isCostRisk(decision.kind),
      ).length,
      aboveWholesale: analyzedResults.filter(({ decision }) =>
        getWholesalePosition(decision) === "above",
      ).length,
      competitive: analyzedResults.filter(
        ({ decision }) => decision.kind === "competitive",
      ).length,
      opportunities: analyzedResults.filter(
        ({ decision }) => decision.kind === "margin_opportunity",
      ).length,
      missingOwn: analyzedResults.filter(
        ({ decision }) => decision.kind === "missing_own_price",
      ).length,
      withoutWholesale: analyzedResults.filter(
        ({ decision }) => !decision.hasWholesaleReference,
      ).length,
    }),
    [analyzedResults],
  );
  const visibleResults = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return analyzedResults
      .filter(({ decision }) => matchesFilter(decision, filter))
      .filter(({ result }) => matchesSearch(result, normalizedSearch))
      .sort((a, b) => (sort === "impact" ? comparePricingImpact(a.impact, b.impact) : 0) || compareRows(a, b));
  }, [analyzedResults, filter, searchTerm, sort]);
  const readiness = useMemo(() => summarizeDecisionReadiness(analyzedResults.map(row => row.decision)), [analyzedResults]);
  const pageCount = Math.max(1, Math.ceil(visibleResults.length / 50));
  const activePage = Math.min(page, pageCount - 1);
  const pageRows = visibleResults.slice(activePage * 50, (activePage + 1) * 50);

  return (
    <section className="rounded-md border border-[#eadbd3] bg-white shadow-sm">
      <div className="p-4 sm:p-5">
        <h2 className="text-lg font-bold text-[#17202a]">
          Mesa de decisión de precios
        </h2>
        <p className="mt-1 text-xs text-[#667789]">{example ? "Escenario simulado" : "Evaluacion"}: {formatPriceObservation(response.searchedAt)} · {example ? "Sin datos comerciales reales" : "Venta Excel informada en esta carga"}</p>
        <dl aria-label="Base de la comparacion" className="mt-3 grid gap-3 border-y border-[#e5e9ef] py-3 text-sm sm:grid-cols-3">
          <div><dt className="text-[#526170]">Excel + mayorista vigente</dt><dd className="font-bold">{readiness.comparableWholesale} / {readiness.total}</dd></div>
          <div><dt className="text-[#526170]">Tokin comparable vigente</dt><dd className="font-bold">{readiness.currentSupplier} / {readiness.total}</dd></div>
          <div><dt className="text-[#526170]">Costo ajustado confirmado</dt><dd className="font-bold">{readiness.confirmedCosts} / {readiness.total}</dd></div>
        </dl>
        <p className="mt-2 text-xs leading-5 text-[#526170]">
          Diferencia positiva: Excel más caro. Negativa: Excel más barato. Precios publicados por unidad equivalente; la diferencia no es margen ni autoriza un cambio automático.
        </p>

        <section aria-label="Semáforo de la importación" className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#17202a]">Cosas para ver</h3>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="text-xs font-semibold text-[#153d7b] hover:underline"
            >
              Ver todos ({counts.total})
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            <SignalButton
              label="Revisar"
              value={counts.attention}
              tone="neutral"
              active={filter === "attention"}
              onClick={() => setFilter("attention")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <SignalButton
              label="Costo o margen"
              value={counts.costRisk}
              tone="warning"
              active={filter === "cost_risk"}
              onClick={() => setFilter("cost_risk")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <SignalButton
              label="Excel arriba >5%"
              value={counts.aboveWholesale}
              tone="warning"
              active={filter === "above_wholesale"}
              onClick={() => setFilter("above_wholesale")}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <SignalButton
              label="Competitivos"
              value={counts.competitive}
              tone="success"
              active={filter === "competitive"}
              onClick={() => setFilter("competitive")}
              icon={<CircleCheck className="h-4 w-4" />}
            />
            <SignalButton
              label="Oportunidad"
              value={counts.opportunities}
              tone="info"
              active={filter === "opportunity"}
              onClick={() => setFilter("opportunity")}
              icon={<TrendingDown className="h-4 w-4" />}
            />
            <SignalButton
              label="Falta Excel"
              value={counts.missingOwn}
              tone="neutral"
              active={filter === "missing_own"}
              onClick={() => setFilter("missing_own")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <SignalButton
              label="Sin mayorista"
              value={counts.withoutWholesale}
              tone="neutral"
              active={filter === "without_wholesale"}
              onClick={() => setFilter("without_wholesale")}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>
        </section>

        <div className="mt-4 grid gap-2 border-y border-[#e5e9ef] bg-[#f8fafc] py-3 md:grid-cols-[minmax(240px,1fr)_auto] md:items-center">
          <label className="relative">
            <span className="sr-only">Buscar dentro de la importación</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a96a3]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar artículo, código, EAN o rubro"
              className="h-10 w-full rounded-md border border-[#cfd8e3] bg-white pl-9 pr-3 text-sm text-[#17202a] outline-none focus:border-[#153d7b]"
            />
          </label>
          <div className="text-sm font-semibold text-[#526170]">
            {visibleResults.length} artículos visibles
            <label className="ml-2 inline-flex items-center gap-2 text-xs">
              Ordenar
              <select aria-label="Ordenar decisiones" value={sort} onChange={event => setSort(event.target.value as "impact" | "severity")}
                className="h-10 max-w-full rounded border border-[#cfd8e3] bg-white px-2">
                <option value="impact">Mayor exposicion economica</option>
                <option value="severity">Severidad de la decision</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {visibleResults.length > 0 ? (
        <>
          <DesktopDecisionTable rows={pageRows} onEdit={onCostConditionsChange ? setEditingRow : undefined} />
          <MobileDecisionCards rows={pageRows} onEdit={onCostConditionsChange ? setEditingRow : undefined} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9ef] p-4 text-sm">
            <span role="status">{activePage * 50 + 1}-{Math.min((activePage + 1) * 50, visibleResults.length)} de {visibleResults.length} artículos</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Pagina anterior" title="Pagina anterior" disabled={activePage === 0} onClick={() => setPage(activePage - 1)} className="rounded border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span>{activePage + 1} / {pageCount}</span>
              <button type="button" aria-label="Pagina siguiente" title="Pagina siguiente" disabled={activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)} className="rounded border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      ) : (
        <div className="border-t border-[#e5e9ef] px-4 py-8 text-center text-sm text-[#667789]">
          No hay artículos para los filtros seleccionados.
        </div>
      )}
      {editingResult ? <CostConditionsEditor key={editingRow} result={editingResult}
        onClose={() => setEditingRow(null)} onSave={(value) => {
          onCostConditionsChange?.(editingResult.input.rowNumber, value);
          setEditingRow(null);
        }} /> : null}
    </section>
  );
}

function DesktopDecisionTable({ rows, onEdit }: { rows: AnalyzedResult[]; onEdit?: (row: number) => void }) {
  return (
    <div className="hidden max-h-[760px] overflow-auto border-t border-[#e5e9ef] xl:block">
      <table className="w-full min-w-[1320px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#edf1f5] uppercase text-[#526170]">
          <tr>
            <th className="px-3 py-3">Artículo</th>
            <th className="px-3 py-3">Referencia Tokin / costo ajustado</th>
            <th className="px-3 py-3">Venta Excel</th>
            <th className="px-3 py-3">Recargo sobre costo ajustado</th>
            <th className="px-3 py-3">Margen ajustado est.</th>
            <th className="px-3 py-3">Mejor mayorista</th>
            <th className="px-3 py-3">Excel vs mayorista</th>
            <th className="px-3 py-3">Lectura y acción</th>
            <th className="px-3 py-3">Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e9ef]">
          {rows.map(({ result, decision, impact }) => (
            <DecisionTableRow
              key={String(result.input.rowNumber) + "-" + (result.input.code ?? "")}
              result={result}
              decision={decision}
              impact={impact}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionTableRow({
  result,
  decision,
  impact,
  onEdit,
}: {
  result: PriceListItemResult;
  decision: PriceListDecisionAnalysis;
  impact: PricingImpact;
  onEdit?: (row: number) => void;
}) {
  const commercial = decision.commercial;

  return (
    <tr className="align-top hover:bg-[#fffdfa]">
      <td className="max-w-[300px] px-3 py-3">
        <div className="font-bold leading-5 text-[#17202a]">
          {result.input.description || "Artículo sin descripción"}
        </div>
        <div className="mt-1 text-[#667789]">
          {[result.input.rubro, result.input.subrubro].filter(Boolean).join(" · ") || "-"}
        </div>
        <div className="mt-1 text-[#8a96a3]">
          {result.input.code || result.input.ean13Di || "Sin código"}
        </div>
      </td>
      <PriceCell
        value={commercial.supplierCost}
        observedAt={result.ownPrice?.tokinObservedAt ?? null}
        helper={
          (commercial.effectiveUnitCost === null ? "Costo final sin confirmar. " : "Costo ajustado: " + formatCurrency(commercial.effectiveUnitCost) + ". ") +
          formatSupplierStatus(commercial.supplierCostStatus) +
          formatPackageTotal(
            commercial.unitsPerPackage,
            commercial.supplierPackageCost,
          )
        }
        emphasize
      />
      <PriceCell
        value={commercial.excelSalePrice}
        helper={
          "Precio de venta informado" +
          formatPackageTotal(
            commercial.unitsPerPackage,
            commercial.excelPackagePrice,
          )
        }
      />
      <RatioCell
        value={commercial.markupRatio}
        helper={formatCurrency(commercial.grossProfitAmount)}
      />
      <RatioCell
        value={commercial.grossMarginRatio}
        helper={
          commercial.minimumPriceForTargetMargin
            ? "Piso objetivo: " + formatCurrency(commercial.minimumPriceForTargetMargin)
            : "Sin costo final confirmado"
        }
      />
      <PriceCell
        value={commercial.bestWholesalePrice}
        observedAt={commercial.bestWholesale?.observedAt ?? null}
        helper={
          (commercial.bestWholesale?.storeName ?? "Sin referencia") +
          (commercial.averageWholesalePrice
            ? " · prom. " + formatCurrency(commercial.averageWholesalePrice)
            : "")
        }
      />
      <RatioCell
        value={commercial.gapVsBestWholesaleRatio}
        helper={formatSignedCurrency(commercial.differenceVsBestWholesale)}
        tone={decision.tone}
      />
      <td className="max-w-[260px] px-3 py-3">
        <DecisionSummary decision={decision} />
        <PricingImpactDetail impact={impact} />
      </td>
      <td className="max-w-[250px] px-3 py-3">
        {onEdit ? <CostButton onClick={() => onEdit(result.input.rowNumber)} /> : null}
        <SourceDetails result={result} decision={decision} />
      </td>
    </tr>
  );
}

function MobileDecisionCards({ rows, onEdit }: { rows: AnalyzedResult[]; onEdit?: (row: number) => void }) {
  return (
    <div className="grid gap-3 border-t border-[#e5e9ef] p-3 xl:hidden">
      {rows.map(({ result, decision, impact }) => {
        const commercial = decision.commercial;

        return (
          <article
            key={String(result.input.rowNumber) + "-mobile-" + (result.input.code ?? "")}
            className="rounded-md border border-[#d9dee7] bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#17202a]">
                  {result.input.description || "Artículo sin descripción"}
                </h3>
                <p className="mt-1 text-xs text-[#667789]">
                  {result.input.code || result.input.ean13Di || "Sin código"}
                </p>
              </div>
              <DecisionChip decision={decision} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MobileMetric
                label="Referencia Tokin · unidad"
                value={formatCurrency(commercial.supplierCost)}
                observedAt={result.ownPrice?.tokinObservedAt ?? null}
                helper={formatPackageTotal(
                  commercial.unitsPerPackage,
                  commercial.supplierPackageCost,
                ).replace(" · ", "")}
              />
              <MobileMetric
                label="Venta Excel · unidad"
                value={formatCurrency(commercial.excelSalePrice)}
                helper={formatPackageTotal(
                  commercial.unitsPerPackage,
                  commercial.excelPackagePrice,
                ).replace(" · ", "")}
              />
              <MobileMetric label="Costo ajustado · unidad" value={formatCurrency(commercial.effectiveUnitCost)} />
              <MobileMetric label="Recargo sobre costo ajustado" value={formatRatio(commercial.markupRatio)} />
              <MobileMetric label="Margen ajustado est." value={formatRatio(commercial.grossMarginRatio)} />
              <MobileMetric
                label={"Mayorista · " + (commercial.bestWholesale?.storeName ?? "-")}
                value={formatCurrency(commercial.bestWholesalePrice)}
                observedAt={commercial.bestWholesale?.observedAt ?? null}
              />
              <MobileMetric
                label="Excel vs mayorista"
                value={formatRatio(commercial.gapVsBestWholesaleRatio)}
              />
            </dl>

            <div className="mt-3 border-t border-[#e5e9ef] pt-3">
              <div className="text-sm font-bold text-[#17202a]">{decision.action}</div>
              <p className="mt-1 text-xs leading-5 text-[#667789]">{decision.helper}</p>
              {commercial.minimumPriceForTargetMargin ? (
                <p className="mt-1 text-xs font-semibold text-[#526170]">
                  Piso para margen objetivo{" "}
                  ({formatRatio(commercial.targetGrossMarginRatio)}):{" "}
                  {formatCurrency(commercial.minimumPriceForTargetMargin)}
                </p>
              ) : null}
            </div>

            <PricingImpactDetail impact={impact} />
            {onEdit ? <CostButton onClick={() => onEdit(result.input.rowNumber)} /> : null}
            <SourceDetails result={result} decision={decision} />
          </article>
        );
      })}
    </div>
  );
}

function PriceCell({
  value,
  helper,
  emphasize = false,
  observedAt,
}: {
  value: number | null;
  helper: string;
  emphasize?: boolean;
  observedAt?: string | null;
}) {
  return (
    <td className="whitespace-nowrap px-3 py-3">
      <div className={emphasize ? "font-bold text-[#153d7b]" : "font-bold text-[#17202a]"}>
        {formatCurrency(value)}
      </div>
      <div className="mt-1 max-w-[190px] whitespace-normal leading-4 text-[#667789]">
        {helper}
      </div>
      {observedAt !== undefined && value !== null ? <PriceFreshnessLabel observedAt={observedAt} /> : null}
    </td>
  );
}

function RatioCell({
  value,
  helper,
  tone = "neutral",
}: {
  value: number | null;
  helper: string;
  tone?: PriceListDecisionTone;
}) {
  return (
    <td className="whitespace-nowrap px-3 py-3">
      <div className={"font-extrabold " + ratioToneClassName(tone)}>
        {formatRatio(value)}
      </div>
      <div className="mt-1 text-[#667789]">{helper}</div>
    </td>
  );
}

function DecisionSummary({ decision }: { decision: PriceListDecisionAnalysis }) {
  return (
    <>
      <DecisionChip decision={decision} />
      <div className="mt-2 font-bold text-[#17202a]">{decision.action}</div>
      <div title={decision.helper} className="mt-1 line-clamp-3 leading-4 text-[#667789]">{decision.helper}</div>
    </>
  );
}

function DecisionChip({ decision }: { decision: PriceListDecisionAnalysis }) {
  return (
    <span
      className={
        "inline-flex max-w-[190px] rounded border px-2 py-1 text-[10px] font-bold " +
        decisionToneClassName(decision.tone)
      }
    >
      {decision.label}
    </span>
  );
}

function SourceDetails({
  result,
  decision,
}: {
  result: PriceListItemResult;
  decision: PriceListDecisionAnalysis;
}) {
  const commercial = decision.commercial;

  return (
    <details className="mt-3 xl:mt-0">
      <summary className="cursor-pointer text-xs font-bold text-[#153d7b]">
        Ver fuentes ({result.sourcePrices.length})
      </summary>
      <div className="mt-2 space-y-2">
        <CostBreakdownDetail result={result} />
        <div className="rounded border border-[#cddcf2] bg-[#f5f8ff] px-2 py-2 text-[11px]">
          <div className="font-bold text-[#153d7b]">
            Tokin: {formatCurrency(commercial.supplierCost)}
          </div>
          {commercial.supplierCost ? <PriceFreshnessLabel observedAt={result.ownPrice?.tokinObservedAt} /> : null}
          <div className="mt-1 leading-4 text-[#667789]">
            {commercial.supplierCostReason}
          </div>
          <div className="mt-1 leading-4 text-[#667789]">
            Diferencia publicada Excel/Tokin: {formatRatio(commercial.listPriceMarkupRatio)}. No es margen.
          </div>
        </div>
        {result.sourcePrices.length === 0 ? (
          <div className="text-xs text-[#667789]">Sin fuentes de mercado.</div>
        ) : (
          result.sourcePrices.map((sourcePrice) => (
            <SourceLine
              key={sourcePrice.sourceId + "-" + sourcePrice.productName}
              sourcePrice={sourcePrice}
            />
          ))
        )}
      </div>
    </details>
  );
}

function SourceLine({ sourcePrice }: { sourcePrice: PriceListSourcePrice }) {
  const comparablePrice = getPriceListComparablePrice(sourcePrice);
  const hasPackagePrice = Math.abs(sourcePrice.price - comparablePrice) > 0.01;

  return (
    <div className="rounded border border-[#e5e9ef] bg-[#f8fafc] px-2 py-2 text-[11px]">
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-[#17202a]">{sourcePrice.storeName}</span>
        <span className="shrink-0 text-[#526170]">
          {sourcePrice.storeType === "mayorista" ? "Mayorista" : "Minorista"}
        </span>
      </div>
      <div className="mt-1 font-bold text-[#173d2f]">
        Unidad/equiv.: {formatCurrency(comparablePrice)}
      </div>
      <PriceFreshnessLabel observedAt={sourcePrice.observedAt} />
      <div>{sourcePrice.availability === "in_stock" ? "En stock" : sourcePrice.availability === "out_of_stock" ? "Sin stock; excluido" : "Stock sin confirmar"}</div>
      {sourcePrice.priceCondition ? <div>Condicion: {sourcePrice.priceCondition}</div> : null}
      {getPriceConditionWarning(sourcePrice) ? <div className="font-semibold text-[#73510b]">Precio condicionado: validar antes de decidir</div> : null}
      {hasPackagePrice || (sourcePrice.packageQuantity ?? 0) > 1 ? (
        <div className="mt-1 text-[#667789]">
          Bulto/lista: {formatCurrency(sourcePrice.price)} ·{" "}
          {sourcePrice.packageLabel ?? "presentación informada"}
        </div>
      ) : null}
      <div className="mt-1 line-clamp-2 text-[#667789]">
        {sourcePrice.productName}
      </div>
      {!isReliableSourcePrice(sourcePrice) ? (
        <div className="mt-1 font-semibold text-[#73510b]">
          Referencia a revisar · excluida del cálculo
        </div>
      ) : null}
    </div>
  );
}

function SignalButton({
  label,
  value,
  tone,
  active,
  onClick,
  icon,
}: {
  label: string;
  value: number;
  tone: PriceListDecisionTone;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex min-h-16 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition " +
        metricToneClassName(tone) +
        (active
          ? " ring-2 ring-[#153d7b] ring-offset-1"
          : " hover:border-[#153d7b]")
      }
    >
      <span>
        <span className="block text-[11px] font-bold uppercase text-[#667789]">
          {label}
        </span>
        <span className="mt-1 block text-xl font-extrabold text-[#17202a]">
          {value}
        </span>
      </span>
      {icon}
    </button>
  );
}

function MobileMetric({
  label,
  value,
  helper,
  observedAt,
}: {
  label: string;
  value: string;
  helper?: string;
  observedAt?: string | null;
}) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2">
      <dt className="text-[10px] font-bold uppercase leading-4 text-[#667789]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-extrabold text-[#17202a]">{value}</dd>
      {helper ? (
        <dd className="mt-1 text-[11px] leading-4 text-[#667789]">{helper}</dd>
      ) : null}
      {observedAt !== undefined && value !== "-" ? <dd><PriceFreshnessLabel observedAt={observedAt} /></dd> : null}
    </div>
  );
}

function matchesFilter(
  decision: PriceListDecisionAnalysis,
  filter: ImportDecisionFilter,
) {
  if (filter === "all") return true;
  if (filter === "attention") return isAttention(decision.kind);
  if (filter === "cost_risk") return isCostRisk(decision.kind);
  if (filter === "above_wholesale") {
    return getWholesalePosition(decision) === "above";
  }
  if (filter === "competitive") return decision.kind === "competitive";
  if (filter === "opportunity") return decision.kind === "margin_opportunity";
  if (filter === "missing_own") return decision.kind === "missing_own_price";
  return !decision.hasWholesaleReference;
}

function matchesSearch(result: PriceListItemResult, normalizedSearch: string) {
  if (!normalizedSearch) return true;

  return [
    result.input.description,
    result.input.code,
    result.input.ean13Di,
    result.input.ean13Bu,
    result.input.rubro,
    result.input.subrubro,
    result.input.segment,
  ]
    .filter(Boolean)
    .some((value) => normalizeText(String(value)).includes(normalizedSearch));
}

function compareRows(first: AnalyzedResult, second: AnalyzedResult) {
  const rank: Record<PriceListDecisionKind, number> = {
    below_supplier_cost: 0,
    cost_pressure: 1,
    above_wholesale_critical: 2,
    below_target_margin: 3,
    above_wholesale_warning: 4,
    weak_match: 5,
    outdated_reference: 5,
    cost_unverified: 5,
    conditional_reference: 5,
    missing_own_price: 6,
    no_reference: 7,
    retail_only: 8,
    competitive: 9,
    margin_opportunity: 10,
  };
  const rankDifference =
    rank[first.decision.kind] - rank[second.decision.kind];

  return rankDifference !== 0
    ? rankDifference
    : first.result.input.rowNumber - second.result.input.rowNumber;
}

function isAttention(kind: PriceListDecisionKind) {
  return kind !== "competitive" && kind !== "margin_opportunity";
}

function isCostRisk(kind: PriceListDecisionKind) {
  return (
    kind === "below_supplier_cost" ||
    kind === "below_target_margin" ||
    kind === "cost_pressure"
    || kind === "cost_unverified"
  );
}

function CostButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} title="Editar condiciones de costo del articulo"
    className="my-2 inline-flex items-center gap-1 text-xs font-semibold text-[#153d7b]">
    <Settings2 className="h-4 w-4" />Condiciones de costo
  </button>;
}

function formatSupplierStatus(
  status: PriceListDecisionAnalysis["commercial"]["supplierCostStatus"],
) {
  const labels = {
    comparable: "Unidad equivalente",
    normalized: "Normalizado a unidad",
    missing: "Sin costo comparable",
    rejected: "Presentación no comparable",
    outdated: "Actualizar costo / fecha sin verificar",
  } as const;

  return labels[status];
}

function formatPackageTotal(
  unitsPerPackage: number | null,
  packageTotal: number | null,
) {
  return unitsPerPackage && packageTotal
    ? " · Bulto x " +
        String(unitsPerPackage) +
        ": " +
        formatCurrency(packageTotal)
    : "";
}

function formatCurrency(value: number | null) {
  return value === null ? "-" : currencyFormatter.format(value);
}

function formatRatio(value: number | null) {
  if (value === null) return "-";
  const prefix = value > 0 ? "+" : "";
  return prefix + percentFormatter.format(value);
}

function formatSignedCurrency(value: number | null) {
  if (value === null) return "Sin diferencia";
  const prefix = value > 0 ? "+" : "";
  return prefix + currencyFormatter.format(value);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function metricToneClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "border-[#f1b3ad] bg-[#fff1ef]",
    warning: "border-[#f0d2a2] bg-[#fff8e8]",
    success: "border-[#bfe5cf] bg-[#f4fbf7]",
    info: "border-[#bed4f4] bg-[#f5f8ff]",
    neutral: "border-[#d9dee7] bg-white",
  };
  return classes[tone];
}

function decisionToneClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "border-[#f1b3ad] bg-[#fff1ef] text-[#8f2d20]",
    warning: "border-[#f0d2a2] bg-[#fff8e8] text-[#8a5a0a]",
    success: "border-[#bfe5cf] bg-[#f4fbf7] text-[#16613c]",
    info: "border-[#bed4f4] bg-[#f5f8ff] text-[#153d7b]",
    neutral: "border-[#d9dee7] bg-[#f8fafc] text-[#526170]",
  };
  return classes[tone];
}

function ratioToneClassName(tone: PriceListDecisionTone) {
  const classes: Record<PriceListDecisionTone, string> = {
    danger: "text-[#8f2d20]",
    warning: "text-[#8a5a0a]",
    success: "text-[#16613c]",
    info: "text-[#153d7b]",
    neutral: "text-[#17202a]",
  };
  return classes[tone];
}
