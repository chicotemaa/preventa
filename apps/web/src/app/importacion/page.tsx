"use client";

import { formatPriceObservation, getPriceFreshness } from "@/lib/price-freshness";

import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { type ChangeEvent, useMemo, useState } from "react";
import { CatalogFreshnessBanner } from "@/components/catalog/CatalogFreshnessBanner";
import { ImportDecisionTable } from "@/components/price-list/ImportDecisionTable";
import {
  evaluatePriceListInBatches,
  savePriceListForHistory,
  type PriceListBatchProgress,
} from "@/lib/price-list-batches";
import {
  analyzePriceListDecision,
  getPriceListComparablePrice,
  getPriceListExcelPrice,
  getPriceListOwnPrice,
  getPriceListSuggestedAction,
  getPriceListTokinPrice,
  sortPriceListResultPrices,
  type PriceListDecisionTone,
} from "@/lib/price-list-decision";
import { summarizePriceListOwnPrices } from "@/lib/price-list-own-price-summary";
import { parseSpreadsheetAmount } from "@/lib/spreadsheet-values";
import { readBusinessActivityColumns } from "@/lib/business-activity";
import { analyzePricingImpact } from "@/lib/pricing-impact";
import type {
  PendingSourceStatus,
  PriceListInputItem,
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
  SourceSearchStatus,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const COMPARISON_SLOTS = 8;
const COMPARISON_FIELD_LABELS = [
  "Fuente",
  "Canal",
  "Precio unitario/equiv",
  "Precio bulto/lista",
  "Detalle precio",
  "Producto",
  "Link",
  "Consulta precio",
  "Vigencia",
] as const;
type WorkbookCellValue = string | number;
type WorkbookRow = WorkbookCellValue[];
export default function ImportacionPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [response, setResponse] = useState<PriceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingForEvolution, setIsSavingForEvolution] = useState(false);
  const [persistForEvolution, setPersistForEvolution] = useState(false);
  const [batchProgress, setBatchProgress] =
    useState<PriceListBatchProgress | null>(null);

  const summary = useMemo(() => {
    if (!response) {
      return null;
    }

    const ownPrices = summarizePriceListOwnPrices(response.results);
    const marketReferenceCount = response.results.filter((result) => {
      const commercial = analyzePriceListDecision(result).commercial;
      return Boolean(
        commercial.bestWholesalePrice || commercial.bestRetailPrice,
      );
    }).length;

    return {
      total: response.itemsCount,
      withMarketPrice: marketReferenceCount,
      sourcesWithData: new Set(
        response.results.flatMap((result) =>
          result.sourcePrices.map((sourcePrice) => sourcePrice.sourceId),
        ),
      ).size,
      ...ownPrices,
    };
  }, [response]);

  async function handleSaveForEvolution() {
    if (!response || isSavingForEvolution) {
      return;
    }

    setIsSavingForEvolution(true);
    setError(null);

    try {
      const persistence = await savePriceListForHistory(response);
      setResponse((current) =>
        current === response ? { ...current, persistence } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la carga para evolución.",
      );
    } finally {
      setIsSavingForEvolution(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || isLoading || isSavingForEvolution) {
      return;
    }

    setFileName(file.name);
    setResponse(null);
    setError(null);
    setBatchProgress(null);
    setIsLoading(true);

    try {
      const items = await parsePriceListFile(file);

      if (items.length === 0) {
        throw new Error("No se encontraron artículos válidos en la planilla.");
      }

      setItemsCount(items.length);
      const payload = await evaluatePriceListInBatches({
        items,
        persist: persistForEvolution,
        onProgress: setBatchProgress,
      });

      setResponse(payload);
    } catch (caughtError) {
      setItemsCount(0);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo evaluar la lista.",
      );
    } finally {
      setIsLoading(false);
      setBatchProgress(null);
    }
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
            Importación de lista
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/88 sm:text-base">
            Cargá el Excel semanal, compará precios y descargá el resultado
            operativo.
          </p>
        </div>
      </section>

      <section className="flex w-full flex-col gap-4 px-3 py-4 sm:px-4 md:py-5 lg:px-6">
        <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#17202a]">
                <FileSpreadsheet className="h-5 w-5 text-[#df2e38]" />
                Buscar por importación
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#667789]">
                El archivo debe incluir Rubro, Descripción, Código y EAN. Si
                trae Precio Aguiar, ese valor se usa como precio de venta.
                Tokin queda visible como referencia proveedor Arcor y nunca
                reemplaza al precio del Excel.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
              <label className={`inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#df2e38] px-4 text-sm font-semibold text-white transition ${isLoading || isSavingForEvolution ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[#bd1f2a]"}`}>
                <Upload className="h-4 w-4" />
                Importar
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={isLoading || isSavingForEvolution}
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
              <button
                type="button"
                disabled={!response}
                onClick={() => response && downloadPriceListXlsx(response)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-4 text-sm font-semibold text-[#17202a] transition hover:border-[#153d7b] hover:text-[#153d7b] disabled:cursor-not-allowed disabled:text-[#a99f99]"
              >
                <Download className="h-4 w-4" />
                Resultado XLSX
              </button>
              <button
                type="button"
                disabled={!response}
                onClick={() => response && downloadAguiarCsv(response)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#153d7b] bg-[#f5f8ff] px-4 text-sm font-semibold text-[#153d7b] transition hover:bg-[#eaf2ff] disabled:cursor-not-allowed disabled:border-[#dec8bd] disabled:bg-white disabled:text-[#a99f99]"
              >
                <Download className="h-4 w-4" />
                Aguiar
              </button>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3">
            <input
              type="checkbox"
              checked={persistForEvolution}
              disabled={isLoading || isSavingForEvolution}
              onChange={(event) => setPersistForEvolution(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#df2e38]"
            />
            <span>
              <span className="block text-sm font-semibold text-[#17202a]">
                Guardar esta carga para evolución
              </span>
              <span className="mt-1 block text-sm text-[#667789]">
                Se guarda al terminar solo si existe al menos un precio en el
                Excel. La referencia proveedor Tokin se conserva por separado.
              </span>
            </span>
          </label>

          {fileName ? (
            <div className="mt-4 rounded-md bg-[#fff8f2] px-4 py-3 text-sm text-[#6f625d]">
              {fileName} {itemsCount > 0 ? `· ${itemsCount} artículos` : ""}
            </div>
          ) : null}

          {isLoading ? (
            <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 rounded-md border border-[#eadbd3] bg-[#fffdfa] px-4 py-3 text-sm text-[#6f625d]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {formatBatchProgress(batchProgress)}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="mt-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
              {error}
            </div>
          ) : null}

          {response && summary ? (
            <div className="mt-4 space-y-3">
              <CatalogFreshnessBanner catalog={response.catalog} />
              <HistorySavePanel
                response={response}
                ownPriceCount={summary.ownPriceCount}
                missingOwnPriceCount={summary.missingOwnPriceCount}
                itemsCount={summary.itemsCount}
                isSaving={isSavingForEvolution}
                onSave={() => void handleSaveForEvolution()}
              />
            </div>
          ) : null}
        </section>

        {summary ? (
          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            <Metric label="Artículos" value={summary.total} />
            <Metric label="Con precio Excel" value={summary.excelPriceCount} />
            <Metric label="Referencia Tokin" value={summary.tokinPriceCount} />
            <Metric
              label="Falta precio Excel"
              value={summary.missingOwnPriceCount}
              tone={summary.missingOwnPriceCount > 0 ? "warning" : "success"}
            />
            <Metric label="Con mercado" value={summary.withMarketPrice} />
            <Metric label="Fuentes con datos" value={summary.sourcesWithData} />
          </section>
        ) : null}

        {response ? <ImportDecisionTable response={response} onCostConditionsChange={isSavingForEvolution ? undefined : (rowNumber, costConditions) => {
          setResponse((current) => current ? {
            ...current,
            persistence: undefined,
            results: current.results.map((row) => row.input.rowNumber === rowNumber ? { ...row, costConditions } : row),
          } : current);
        }} /> : null}
      </section>
    </main>
  );
}

function HistorySavePanel({
  response,
  ownPriceCount,
  missingOwnPriceCount,
  itemsCount,
  isSaving,
  onSave,
}: {
  response: PriceListResponse;
  ownPriceCount: number;
  missingOwnPriceCount: number;
  itemsCount: number;
  isSaving: boolean;
  onSave: () => void;
}) {
  const persistence = response.persistence;
  const saved = persistence?.saved === true;
  const cannotSave = ownPriceCount === 0;

  return (
    <section className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-bold text-[#17202a]">
            Precios base para evolución
          </div>
          <p className="mt-1 text-sm leading-5 text-[#667789]">
            {cannotSave
              ? "No se puede guardar todavía: ningún artículo tiene precio comercial en el Excel."
              : missingOwnPriceCount > 0
                ? `${ownPriceCount}/${itemsCount} artículos tienen precio en el Excel. La carga se puede guardar, pero quedará marcada para revisión.`
                : `Los ${itemsCount} artículos tienen precio Excel y están listos para historial.`}
          </p>
        </div>
        <button
          type="button"
          disabled={cannotSave || saved || isSaving}
          onClick={onSave}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#153d7b] px-4 text-sm font-bold text-white transition hover:bg-[#0f2f61] disabled:cursor-not-allowed disabled:bg-[#a8b4c7]"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CircleCheck className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isSaving ? "Guardando..." : saved ? "Guardada" : "Guardar en historial"}
        </button>
      </div>

      {persistence?.requested && persistence.errorMessage ? (
        <div className="mt-3 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-3 py-2 text-sm text-[#8f2d20]">
          {persistence.errorMessage}
        </div>
      ) : null}

      {saved ? (
        <div className="mt-3 rounded-md border border-[#bfe5cf] bg-[#f4fbf7] px-3 py-2 text-sm text-[#16613c]">
          Carga guardada: Excel quedó como precio de venta y Tokin como costo
          proveedor. Ya está disponible en Historial y Evolución.
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: PriceListDecisionTone;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${metricToneClassName(tone)}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[#17202a]">{value}</div>
    </div>
  );
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

function formatBatchProgress(progress: PriceListBatchProgress | null) {
  if (!progress) {
    return "Preparando evaluacion por lotes...";
  }

  return `Evaluando lote ${progress.completedBatches}/${progress.totalBatches} · ${progress.processedItems}/${progress.totalItems} articulos`;
}

async function parsePriceListFile(file: File): Promise<PriceListInputItem[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    // Preserve CSV dates/identifiers; automatic date coercion can shift the day by timezone.
    raw: true,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  }) as Array<Array<string | number | null>>;
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map((cell) => normalizeColumnName(cell));
    return (
      headers.includes("rubro") &&
      headers.some((header) => header.includes("descripcion")) &&
      headers.some((header) =>
        ["codigo", "code", "articulo"].includes(header),
      )
    );
  });

  if (headerIndex === -1) {
    throw new Error(
      "No se encontraron columnas Rubro, Descripción Larga y Código.",
    );
  }

  const headers = rows[headerIndex].map((cell) => normalizeColumnName(cell));
  const businessIndex = findColumn(headers, ["negocio"]);
  const rubroIndex = findColumn(headers, ["rubro"]);
  const segmentIndex = findColumn(headers, ["segmento"]);
  const subrubroIndex = findColumn(headers, ["subrubro"]);
  const lineIndex = findColumn(headers, ["linea", "línea"]);
  const descriptionIndex = findColumn(headers, [
    "descripcion larga",
    "descripcion articulos",
    "descripcion articulo",
    "descripcion",
    "description",
  ]);
  const codeIndex = findColumn(headers, ["codigo", "code", "articulo"]);
  const uxbIndex = findColumn(headers, [
    "uxb",
    "u x b",
    "unidades por bulto",
    "unidades x bulto",
  ]);
  const eanDiIndex = findColumn(headers, [
    "ean 13 di",
    "ean13 di",
    "ean di",
    "ean 13 unidad",
    "ean13 unidad",
  ]);
  const eanBuIndex = findColumn(headers, [
    "ean 13 bu",
    "ean13 bu",
    "ean bu",
    "ean 13 display",
    "ean 13 dispaly",
    "ean13 display",
    "ean13 dispaly",
  ]);
  const currentPriceIndex = findColumn(headers, [
    "precio aguiar",
    "precio ara",
    "precio x unid",
    "precio por unidad",
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
      business: readCell(row, businessIndex),
      rubro: readCell(row, rubroIndex),
      segment: readCell(row, segmentIndex),
      subrubro: readCell(row, subrubroIndex),
      line: readCell(row, lineIndex),
      description: readCell(row, descriptionIndex),
      code: readCell(row, codeIndex),
      uxb: readCell(row, uxbIndex),
      ean13Di: cleanSpreadsheetIdentifier(readCell(row, eanDiIndex)),
      ean13Bu: cleanSpreadsheetIdentifier(readCell(row, eanBuIndex)),
      currentPrice: parseSpreadsheetAmount(row[currentPriceIndex]),
      businessActivity: readBusinessActivityColumns(headers, row),
    }))
    .filter(
      (item) =>
        Boolean(item.description) ||
        Boolean(item.code) ||
        Boolean(item.ean13Di) ||
        Boolean(item.ean13Bu),
    );
}

async function downloadPriceListXlsx(response: PriceListResponse) {
  const XLSX = await import("xlsx");
  const sortedResults = response.results.map(sortPriceListResultPrices);
  const headers = [
    "Negocio",
    "Rubro",
    "Segmento",
    "Subrubro",
    "Linea",
    "Articulo",
    "Descripcion ARTICULOS",
    "UxB",
    "Precio de venta Excel",
    "Referencia proveedor Tokin",
    "Venta bulto Excel",
    "Referencia bulto Tokin",
    "Recargo sobre costo ajustado %",
    "Margen ajustado estimado %",
    "Resultado ajustado estimado $",
    "Piso precio margen objetivo",
    "Estado costo Tokin",
    "Ean 13 Unidad",
    "Ean 13 Dispaly",
    "Estado",
    "Accion sugerida",
    "Mejor mayorista",
    "Fuente mayorista",
    "Promedio mayorista",
    "Diferencia Excel vs mejor mayorista %",
    "Diferencia Excel vs mejor mayorista $",
    "Diferencia Excel vs promedio mayorista %",
    "Mejor minorista",
    "Fuente minorista",
    "Referencia prioritaria",
    "Fuente referencia",
    "Canal referencia",
    "Producto encontrado",
    "Link producto",
    "Confianza",
    ...buildComparisonHeaders(),
    "Consulta precio Tokin", "Vigencia Tokin", "Consulta mejor mayorista",
    "Costo ajustado unitario", "Venta neta unitaria", "Dif. publicada Excel vs Tokin %",
    "Condiciones confirmadas", "IVA Tokin incluido", "IVA compra %", "IVA compra recuperable %",
    "IVA Excel incluido", "IVA venta %", "Descuento adicional %", "Bonificacion adicional %",
    "Flete por unidad", "Financiacion %", "Otros costos por unidad", "Margen objetivo %", "Alcance del margen",
    "Unidades vendidas", "Dias del periodo", "Ventas hasta", "Stock unidades", "Fecha stock",
    "Volumen equivalente 30 dias", "Venta Excel 30 dias $", "Contribucion estimada 30 dias $",
    "Exposicion de precio 30 dias $", "Mediana mayorista regular con stock $", "Fuentes para impacto",
    "Cobertura stock dias", "Stock a costo ajustado $", "Alcance del impacto",
  ];
  const rows = sortedResults.map((sortedResult) => {
    const excelPrice = getPriceListExcelPrice(sortedResult);
    const tokinPrice = getPriceListTokinPrice(sortedResult);
    const decision = analyzePriceListDecision(sortedResult);
    const commercial = decision.commercial;
    const impact = analyzePricingImpact(sortedResult, decision);
    const bestMayorista = commercial.bestWholesale;
    const bestMinorista = commercial.bestRetail;
    const comparisons = sortedResult.sourcePrices
      .slice(0, COMPARISON_SLOTS)
      .flatMap(formatSourceXlsxComparisonCells);
    const comparisonCells = [
      ...comparisons,
      ...Array.from(
        {
          length:
            COMPARISON_SLOTS * COMPARISON_FIELD_LABELS.length -
            comparisons.length,
        },
        () => "",
      ),
    ];

    return [
      sortedResult.input.business ?? "",
      sortedResult.input.rubro ?? "",
      sortedResult.input.segment ?? "",
      sortedResult.input.subrubro ?? "",
      sortedResult.input.line ?? "",
      sortedResult.input.code ?? "",
      sortedResult.input.description ?? "",
      parseNumberOrText(sortedResult.input.uxb),
      excelPrice ?? "",
      tokinPrice ?? "",
      commercial.excelPackagePrice ?? "",
      commercial.supplierPackageCost ?? "",
      commercial.markupRatio ?? "",
      commercial.grossMarginRatio ?? "",
      commercial.grossProfitAmount ?? "",
      commercial.minimumPriceForTargetMargin ?? "",
      formatSupplierCostStatus(commercial.supplierCostStatus),
      sortedResult.input.ean13Di ?? "",
      sortedResult.input.ean13Bu ?? "",
      sortedResult.status === "matched" ? "Con referencias" : "Sin datos",
      getPriceListSuggestedAction(sortedResult),
      commercial.bestWholesalePrice ?? "",
      bestMayorista?.storeName ?? "",
      commercial.averageWholesalePrice ?? "",
      commercial.gapVsBestWholesaleRatio ?? "",
      commercial.differenceVsBestWholesale ?? "",
      commercial.gapVsAverageWholesaleRatio ?? "",
      commercial.bestRetailPrice ?? "",
      bestMinorista?.storeName ?? "",
      decision.referencePrice ?? "",
      decision.referenceSource?.storeName ?? "",
      decision.referenceSource
        ? formatStoreType(decision.referenceSource.storeType)
        : "",
      sortedResult.bestSource?.productName ?? "",
      sortedResult.bestSource?.productUrl ?? "",
      sortedResult.bestSource?.confidenceScore ?? "",
      ...comparisonCells,
      formatPriceObservation(sortedResult.ownPrice?.tokinObservedAt),
      getPriceFreshness(sortedResult.ownPrice?.tokinObservedAt).label,
      formatPriceObservation(bestMayorista?.observedAt),
      commercial.effectiveUnitCost ?? "", commercial.costBreakdown?.netSalePrice ?? "", commercial.listPriceMarkupRatio ?? "",
      sortedResult.costConditions?.confirmedAt ?? "",
      sortedResult.costConditions ? (sortedResult.costConditions.purchaseTaxBasis === "included" ? "Si" : "No") : "Sin confirmar",
      ...(["purchaseVatPercent", "recoverableVatPercent"] as const).map((key) => sortedResult.costConditions ? sortedResult.costConditions[key] / 100 : ""),
      sortedResult.costConditions ? (sortedResult.costConditions.saleTaxBasis === "included" ? "Si" : "No") : "Sin confirmar",
      ...(["saleVatPercent", "discountPercent", "bonusPercent"] as const).map((key) => sortedResult.costConditions ? sortedResult.costConditions[key] / 100 : ""),
      sortedResult.costConditions?.freightPerUnit ?? "",
      sortedResult.costConditions ? sortedResult.costConditions.financingPercent / 100 : "",
      sortedResult.costConditions?.otherCostsPerUnit ?? "",
      sortedResult.costConditions ? sortedResult.costConditions.targetMarginPercent / 100 : "",
      commercial.economicsReason,
      sortedResult.input.businessActivity?.unitsSold ?? "", sortedResult.input.businessActivity?.periodDays ?? "",
      sortedResult.input.businessActivity?.salesThrough ?? "", sortedResult.input.businessActivity?.stockUnits ?? "",
      sortedResult.input.businessActivity?.stockAsOf ?? "", impact.monthlyUnits ?? "", impact.monthlySales ?? "",
      impact.monthlyContribution ?? "", impact.priceExposure ?? "", impact.referencePrice ?? "", impact.referenceCount,
      impact.stockCoverDays ?? "", impact.stockValue ?? "", impact.reason,
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = buildHumanOutputColumnWidths(headers.length);
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: headers.length - 1 },
    }),
  };

  applyHumanOutputFormats(
    worksheet as Record<string, unknown>,
    rows.length,
    headers,
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Comparacion precios");

  const diagnosticRows = buildDiagnosticRows(response, sortedResults);
  const diagnosticWorksheet = XLSX.utils.aoa_to_sheet(diagnosticRows);
  diagnosticWorksheet["!cols"] = [
    { wch: 24 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 42 },
    { wch: 32 },
    { wch: 42 },
    { wch: 54 },
  ];
  XLSX.utils.book_append_sheet(workbook, diagnosticWorksheet, "Diagnostico");

  const noMatchRows = buildNoMatchRows(sortedResults);
  const noMatchWorksheet = XLSX.utils.aoa_to_sheet(noMatchRows);
  noMatchWorksheet["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 34 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 26 },
    { wch: 42 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(workbook, noMatchWorksheet, "Sin match");

  XLSX.writeFile(
    workbook,
    `lista-human-comparada-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

function downloadAguiarCsv(response: PriceListResponse) {
  const headers = [
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Descripcion",
    "Rubro",
    "Precio de venta Excel",
  ];
  const rows = response.results.map((result) => [
    result.input.code ?? "",
    result.input.ean13Di ?? "",
    result.input.ean13Bu ?? "",
    result.input.description ?? "",
    result.input.rubro ?? "",
    formatCsvAmount(getPriceListOwnPrice(result)),
  ]);

  downloadCsv("aguiar-precios", [headers, ...rows]);
}

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildComparisonHeaders() {
  return Array.from({ length: COMPARISON_SLOTS }, (_, index) =>
    COMPARISON_FIELD_LABELS.map((label) => `Comp ${index + 1} ${label}`),
  ).flat();
}

function formatSourceXlsxComparisonCells(
  sourcePrice: PriceListSourcePrice,
): WorkbookRow {
  return [
    sourcePrice.storeName,
    formatStoreType(sourcePrice.storeType),
    getPriceListComparablePrice(sourcePrice),
    getPackageOrListPrice(sourcePrice) ?? "",
    buildPriceDetail(sourcePrice),
    sourcePrice.productName,
    sourcePrice.productUrl ?? "",
    formatPriceObservation(sourcePrice.observedAt),
    getPriceFreshness(sourcePrice.observedAt).label,
  ];
}

function getPackageOrListPrice(sourcePrice: PriceListSourcePrice) {
  const comparablePrice = getPriceListComparablePrice(sourcePrice);
  const packageLikePrice =
    sourcePrice.packageQuantity && sourcePrice.packageQuantity > 1;
  const hasDifferentComparablePrice =
    Math.abs(sourcePrice.price - comparablePrice) > 0.01;

  return packageLikePrice || hasDifferentComparablePrice
    ? sourcePrice.price
    : null;
}

function buildPriceDetail(sourcePrice: PriceListSourcePrice) {
  const details = [
    sourcePrice.priceCondition,
    sourcePrice.packageQuantity && sourcePrice.packageQuantity > 1
      ? sourcePrice.packageLabel ?? `bulto x ${sourcePrice.packageQuantity}`
      : null,
    ...(sourcePrice.alternatePrices ?? []).map((alternatePrice) => {
      const comparablePrice =
        normalizeOptionalNumber(alternatePrice.comparisonPrice) ??
        alternatePrice.price;
      return `${alternatePrice.label}: ${currencyFormatter.format(comparablePrice)}`;
    }),
  ].filter(Boolean);

  return details.join(" | ");
}

function formatStoreType(storeType: PriceListSourcePrice["storeType"]) {
  return storeType === "mayorista" ? "Mayorista" : "Minorista";
}

function formatSupplierCostStatus(
  status: ReturnType<typeof analyzePriceListDecision>["commercial"]["supplierCostStatus"],
) {
  const labels = {
    comparable: "Comparable por unidad",
    normalized: "Normalizado a unidad",
    missing: "Sin costo comparable",
    rejected: "Presentacion no comparable",
    outdated: "Actualizar costo / fecha sin verificar",
  } as const;

  return labels[status];
}

function buildHumanOutputColumnWidths(columnsCount: number) {
  const widths = [
    16, 18, 22, 22, 30, 10, 34, 10, 16, 16, 16, 16, 18, 18, 22, 16, 16, 14,
    26, 16, 22, 16, 20, 18, 18, 20, 16, 22, 16, 22, 14, 34, 28, 11,
  ];

  return Array.from({ length: columnsCount }, (_, index) => ({
    wch: widths[index] ?? 42,
  }));
}

function applyHumanOutputFormats(
  worksheet: Record<string, unknown>,
  rowsCount: number,
  headers: string[],
) {
  const currencyHeaders = new Set([
    "Precio de venta Excel",
    "Referencia proveedor Tokin",
    "Venta bulto Excel",
    "Referencia bulto Tokin",
    "Resultado ajustado estimado $",
    "Costo ajustado unitario", "Venta neta unitaria", "Flete por unidad", "Otros costos por unidad",
    "Piso precio margen objetivo",
    "Mejor mayorista",
    "Promedio mayorista",
    "Diferencia Excel vs mejor mayorista $",
    "Mejor minorista",
    "Referencia prioritaria",
  ]);
  const currencyColumns = headers.flatMap((header, index) =>
    currencyHeaders.has(header) ||
    header.endsWith("Precio unitario/equiv") ||
    header.endsWith("Precio bulto/lista")
      ? [index + 1]
      : [],
  );
  const percentColumns = headers.flatMap((header, index) =>
    header.endsWith("%") ? [index + 1] : [],
  );
  const integerColumns = headers.flatMap((header, index) =>
    header === "UxB" || header === "Confianza" ? [index + 1] : [],
  );

  for (let rowIndex = 2; rowIndex <= rowsCount + 1; rowIndex += 1) {
    for (const columnIndex of currencyColumns) {
      setCellFormat(worksheet, rowIndex, columnIndex, '"$"#,##0.00');
    }

    for (const columnIndex of percentColumns) {
      setCellFormat(worksheet, rowIndex, columnIndex, '0.0%');
    }

    for (const columnIndex of integerColumns) {
      setCellFormat(worksheet, rowIndex, columnIndex, '0');
    }
  }
}

function setCellFormat(
  worksheet: Record<string, unknown>,
  rowIndex: number,
  columnIndex: number,
  format: string,
) {
  const cellAddress = `${columnLetter(columnIndex)}${rowIndex}`;
  const cell = worksheet[cellAddress] as { z?: string } | undefined;

  if (cell) {
    cell.z = format;
  }
}

function columnLetter(columnIndex: number) {
  let remaining = columnIndex;
  let label = "";

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    label = String.fromCharCode(65 + modulo) + label;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return label;
}

function buildDiagnosticRows(
  response: PriceListResponse,
  results: PriceListItemResult[],
): WorkbookRow[] {
  const sourcesWithData = response.sources.filter(
    (source) => source.resultsCount > 0,
  ).length;
  const mayoristaSourcesWithData = response.sources.filter(
    (source) => source.storeType === "mayorista" && source.resultsCount > 0,
  ).length;
  const noMatchCount = results.filter((result) => shouldSendToNoMatch(result)).length;

  return [
    ["Resumen"],
    ["Fecha busqueda", formatDateTime(response.searchedAt)],
    ["Duracion ms", response.durationMs],
    ["Articulos", response.itemsCount],
    ["Con precio", response.matchedCount],
    ["Sin precio", response.unmatchedCount],
    ["A revisar", noMatchCount],
    ["Fuentes consultadas", response.sources.length],
    ["Fuentes con datos", sourcesWithData],
    ["Mayoristas con datos", mayoristaSourcesWithData],
    ["Catalogo estado", response.catalog.status],
    ["Catalogo actualizado", response.catalog.lastSyncedAt ? formatDateTime(response.catalog.lastSyncedAt) : ""],
    ["Productos en catalogo", response.catalog.productsCount],
    [],
    [
      "Fuentes consultadas",
      "Canal",
      "Estado",
      "Resultados",
      "Duracion ms",
      "Origen",
      "Alcance",
      "URL",
      "Mensaje",
    ],
    ...response.sources.map(formatSourceStatusRow),
    [],
    [
      "Fuentes esperadas / pendientes",
      "Canal",
      "Estado",
      "Resultados",
      "Duracion ms",
      "Origen",
      "Alcance",
      "URL",
      "Mensaje",
    ],
    ...response.catalog.pendingSources.map(formatPendingSourceRow),
  ];
}

function formatSourceStatusRow(source: SourceSearchStatus): WorkbookRow {
  return [
    source.storeName,
    formatStoreType(source.storeType),
    formatSourceStatus(source.status),
    source.resultsCount,
    source.durationMs,
    source.dataOrigin ?? "",
    source.sourceScope ?? "",
    source.sourceUrl ?? "",
    source.errorMessage ?? "",
  ];
}

function formatPendingSourceRow(source: PendingSourceStatus): WorkbookRow {
  return [
    source.storeName,
    formatStoreType(source.storeType),
    formatPendingStatus(source.status),
    0,
    0,
    "",
    "",
    "",
    source.message,
  ];
}

function buildNoMatchRows(results: PriceListItemResult[]): WorkbookRow[] {
  const headers = [
    "Rubro",
    "Segmento",
    "Codigo",
    "Descripcion",
    "EAN unidad",
    "EAN display",
    "Estado",
    "Motivo",
    "Queries probadas",
    "Candidatos rechazados",
  ];
  const rows = results.filter(shouldSendToNoMatch).map((result) => [
    result.input.rubro ?? "",
    result.input.segment ?? "",
    result.input.code ?? "",
    result.input.description ?? "",
    result.input.ean13Di ?? "",
    result.input.ean13Bu ?? "",
    result.status === "matched" ? "Con precio/revisar" : "Sin precio",
    getNoMatchReason(result),
    (result.diagnostics?.queriesTried ?? []).slice(0, 20).join(" | "),
    formatRejectedCandidates(result),
  ]);

  return rows.length > 0
    ? [headers, ...rows]
    : [headers, ["", "", "", "", "", "", "OK", "No quedaron productos para revisar", "", ""]];
}

function shouldSendToNoMatch(result: PriceListItemResult) {
  if (result.sourcePrices.length === 0) {
    return true;
  }

  if (!getPriceListOwnPrice(result)) {
    return true;
  }

  const commercial = analyzePriceListDecision(result).commercial;
  return !commercial.bestWholesale && !commercial.bestRetail;
}

function getNoMatchReason(result: PriceListItemResult) {
  if (result.sourcePrices.length === 0) {
    return "No se encontraron precios comparables";
  }

  if (!getPriceListOwnPrice(result)) {
    return "Falta precio comercial en el Excel";
  }

  if (result.sourcePrices.every((source) => getPriceFreshness(source.observedAt).status !== "fresh")) {
    return "Precios antiguos o sin fecha verificable: actualizar referencias antes de decidir";
  }

  const commercial = analyzePriceListDecision(result).commercial;
  if (!commercial.bestWholesale && !commercial.bestRetail) {
    return "Match débil o sin confianza validada: revisar equivalencia antes de decidir";
  }

  return "Revisar manualmente";
}

function formatRejectedCandidates(result: PriceListItemResult) {
  return (result.diagnostics?.queryDiagnostics ?? [])
    .flatMap((diagnostic) => diagnostic.topRejected)
    .slice(0, 8)
    .map(
      (candidate) =>
        `${candidate.storeName}: ${candidate.productName} (${formatRejectReason(candidate.reason)}, score ${candidate.finalScore})`,
    )
    .join(" | ");
}

function formatRejectReason(reason: string) {
  const labels: Record<string, string> = {
    brand_mismatch: "marca distinta",
    score_below_threshold: "score bajo",
    presentation_or_flavor_mismatch: "presentacion/sabor distinto",
    no_candidates: "sin candidatos",
  };

  return labels[reason] ?? reason;
}

function formatSourceStatus(status: SourceSearchStatus["status"]) {
  const labels: Record<SourceSearchStatus["status"], string> = {
    success: "OK",
    failed: "Error",
    timeout: "Timeout",
    no_results: "Sin datos",
  };

  return labels[status];
}

function formatPendingStatus(status: PendingSourceStatus["status"]) {
  const labels: Record<PendingSourceStatus["status"], string> = {
    pending: "Pendiente",
    requires_login: "Requiere login",
    not_configured: "No configurada",
    no_public_catalog: "Sin catalogo publico",
    no_public_prices: "Sin precios publicos",
    out_of_scope: "Fuera de alcance",
  };

  return labels[status];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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

function readCell(row: Array<string | number | null>, columnIndex: number) {
  if (columnIndex < 0) {
    return "";
  }

  return String(row[columnIndex] ?? "").trim();
}

function cleanSpreadsheetIdentifier(value: string) {
  const cleaned = value.replace(/\D/g, "");
  return cleaned === "0" ? "" : cleaned;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function formatCurrency(value: number | null | undefined) {
  return normalizeOptionalNumber(value) === null
    ? "-"
    : currencyFormatter.format(value as number);
}

function formatCsvAmount(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}

function parseNumberOrText(value: string | undefined) {
  if (!value) {
    return "";
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : value;
}

function csvEscape(value: string | number) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
