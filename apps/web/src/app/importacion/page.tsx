"use client";

import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";
import type {
  PriceListInputItem,
  PriceListItemResult,
  PriceListResponse,
  PriceListSourcePrice,
} from "@/types/search";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export default function ImportacionPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [response, setResponse] = useState<PriceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [persistForEvolution, setPersistForEvolution] = useState(false);

  const summary = useMemo(() => {
    if (!response) {
      return null;
    }

    return {
      total: response.itemsCount,
      withPrice: response.matchedCount,
      withoutPrice: response.unmatchedCount,
      sourcesWithData: new Set(
        response.results.flatMap((result) =>
          result.sourcePrices.map((sourcePrice) => sourcePrice.sourceId),
        ),
      ).size,
    };
  }, [response]);

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
        throw new Error("No se encontraron artículos válidos en la planilla.");
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

      setResponse(payload as PriceListResponse);
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
                trae Precio Aguiar, se usa como referencia propia.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#df2e38] px-4 text-sm font-semibold text-white transition hover:bg-[#bd1f2a]">
                <Upload className="h-4 w-4" />
                Importar
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
                onClick={() => response && downloadPriceListCsv(response)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-4 text-sm font-semibold text-[#17202a] transition hover:border-[#153d7b] hover:text-[#153d7b] disabled:cursor-not-allowed disabled:text-[#a99f99]"
              >
                <Download className="h-4 w-4" />
                Resultado
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
              onChange={(event) => setPersistForEvolution(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#df2e38]"
            />
            <span>
              <span className="block text-sm font-semibold text-[#17202a]">
                Guardar esta carga para evolución
              </span>
              <span className="mt-1 block text-sm text-[#667789]">
                Activá esto solo si querés dejar esta lista como referencia
                semanal.
              </span>
            </span>
          </label>

          {fileName ? (
            <div className="mt-4 rounded-md bg-[#fff8f2] px-4 py-3 text-sm text-[#6f625d]">
              {fileName} {itemsCount > 0 ? `· ${itemsCount} artículos` : ""}
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
        </section>

        {summary ? (
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Artículos" value={summary.total} />
            <Metric label="Con precio" value={summary.withPrice} />
            <Metric label="Sin precio" value={summary.withoutPrice} />
            <Metric label="Fuentes con datos" value={summary.sourcesWithData} />
          </section>
        ) : null}

        {response ? <ImportResults response={response} /> : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-[#17202a]">{value}</div>
    </div>
  );
}

function ImportResults({ response }: { response: PriceListResponse }) {
  return (
    <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-[#17202a]">
          Resultado de importación
        </h2>
        <p className="text-sm text-[#667789]">
          Artículos ordenados por estado. Cada carta muestra el mejor precio y
          hasta cinco comparaciones.
        </p>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {response.results.map((result) => (
          <ImportResultCard
            key={`${result.input.rowNumber}-${result.input.code ?? ""}`}
            result={sortResultPrices(result)}
          />
        ))}
      </div>
    </section>
  );
}

function ImportResultCard({ result }: { result: PriceListItemResult }) {
  const comparisons = result.sourcePrices.slice(0, 5);

  return (
    <article className="rounded-md border border-[#d9dee7] bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#17202a]">
            {result.input.description || "Artículo sin descripción"}
          </h3>
          <div className="mt-1 text-xs text-[#667789]">
            {result.input.rubro || "-"} · {result.input.code || "-"} ·{" "}
            {result.input.ean13Di || result.input.ean13Bu || "sin EAN"}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
            result.status === "matched"
              ? "bg-[#e4f6ed] text-[#16613c]"
              : "bg-[#fff1ef] text-[#8f2d20]"
          }`}
        >
          {result.status === "matched" ? "Con precio" : "Sin precio"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[#dbe7df] bg-[#f4fbf7] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Mejor precio
          </div>
          <div className="mt-1 text-lg font-extrabold text-[#173d2f]">
            {formatCurrency(result.bestPrice)}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            {result.bestSource?.storeName ?? "sin fuente"}
          </div>
        </div>
        <div className="rounded-md border border-[#eadbd3] bg-[#fff8f2] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#526170]">
            Precio Aguiar
          </div>
          <div className="mt-1 text-lg font-extrabold text-[#7a4a16]">
            {formatCurrency(normalizeOptionalNumber(result.input.currentPrice))}
          </div>
          <div className="mt-1 text-xs text-[#667789]">
            cargado en la lista
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {comparisons.length === 0 ? (
          <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-3 text-sm text-[#667789] sm:col-span-2">
            No hay comparaciones para este artículo.
          </div>
        ) : (
          comparisons.map((sourcePrice) => (
            <SourcePriceCard
              key={`${sourcePrice.sourceId}-${sourcePrice.productName}`}
              sourcePrice={sourcePrice}
            />
          ))
        )}
      </div>
    </article>
  );
}

function SourcePriceCard({
  sourcePrice,
}: {
  sourcePrice: PriceListSourcePrice;
}) {
  return (
    <div className="rounded-md border border-[#e5e9ef] bg-[#f8fafc] px-3 py-2">
      <div className="text-sm font-semibold text-[#17202a]">
        {sourcePrice.storeName}
      </div>
      <div className="mt-1 text-base font-bold text-[#173d2f]">
        {formatCurrency(getComparablePrice(sourcePrice))}
      </div>
      <div className="mt-1 line-clamp-2 text-xs text-[#667789]">
        {sourcePrice.productName}
      </div>
      {sourcePrice.priceCondition ||
      sourcePrice.packageQuantity ||
      sourcePrice.alternatePrices?.length ? (
        <div className="mt-2 text-xs leading-4 text-[#667789]">
          {sourcePrice.priceCondition ? <div>{sourcePrice.priceCondition}</div> : null}
          {sourcePrice.packageQuantity && sourcePrice.packageQuantity > 1 ? (
            <div>
              Bulto: {sourcePrice.packageLabel ?? `pack x ${sourcePrice.packageQuantity}`} ·{" "}
              {formatCurrency(sourcePrice.price)}
            </div>
          ) : null}
          {sourcePrice.alternatePrices?.map((alternatePrice) => (
            <div key={`${alternatePrice.label}-${alternatePrice.price}`}>
              {alternatePrice.label}: {formatCurrency(alternatePrice.price)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
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
      "No se encontraron columnas Rubro, Descripción Larga y Código.",
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
      rubro: readCell(row, rubroIndex),
      description: readCell(row, descriptionIndex),
      code: readCell(row, codeIndex),
      ean13Di: cleanSpreadsheetIdentifier(readCell(row, eanDiIndex)),
      ean13Bu: cleanSpreadsheetIdentifier(readCell(row, eanBuIndex)),
      currentPrice: parseSpreadsheetAmount(readCell(row, currentPriceIndex)),
    }))
    .filter(
      (item) =>
        Boolean(item.description) ||
        Boolean(item.code) ||
        Boolean(item.ean13Di) ||
        Boolean(item.ean13Bu),
    );
}

function downloadPriceListCsv(response: PriceListResponse) {
  const headers = [
    "Rubro",
    "Descripcion",
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Precio Aguiar",
    "Estado",
    "Mejor precio",
    "Mejor fuente",
    "Producto encontrado",
    "Comparaciones",
  ];
  const rows = response.results.map((result) => {
    const sortedResult = sortResultPrices(result);
    return [
      sortedResult.input.rubro ?? "",
      sortedResult.input.description ?? "",
      sortedResult.input.code ?? "",
      sortedResult.input.ean13Di ?? "",
      sortedResult.input.ean13Bu ?? "",
      formatCsvAmount(normalizeOptionalNumber(sortedResult.input.currentPrice)),
      sortedResult.status === "matched" ? "Con precio" : "Sin precio",
      formatCsvAmount(sortedResult.bestPrice),
      sortedResult.bestSource?.storeName ?? "",
      sortedResult.bestSource?.productName ?? "",
      sortedResult.sourcePrices.map(formatSourceCsvPrice).join(" | "),
    ];
  });

  downloadCsv("precios-lista", [headers, ...rows]);
}

function downloadAguiarCsv(response: PriceListResponse) {
  const headers = [
    "Codigo",
    "EAN 13 DI",
    "EAN 13 BU",
    "Descripcion",
    "Rubro",
    "Precio Aguiar",
  ];
  const rows = response.results.map((result) => [
    result.input.code ?? "",
    result.input.ean13Di ?? "",
    result.input.ean13Bu ?? "",
    result.input.description ?? "",
    result.input.rubro ?? "",
    formatCsvAmount(normalizeOptionalNumber(result.input.currentPrice)),
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

function sortResultPrices(result: PriceListItemResult): PriceListItemResult {
  const sourcePrices = [...result.sourcePrices].sort(
    (first, second) => getComparablePrice(first) - getComparablePrice(second),
  );
  const bestSource = sourcePrices[0] ?? null;

  return {
    ...result,
    sourcePrices,
    bestSource,
    bestPrice: bestSource ? getComparablePrice(bestSource) : null,
    status:
      bestSource || normalizeOptionalNumber(result.input.currentPrice)
        ? "matched"
        : "not_found",
  };
}

function getComparablePrice(price: PriceListSourcePrice) {
  return normalizeOptionalNumber(price.comparisonPrice) ?? price.price;
}

function formatSourceCsvPrice(sourcePrice: PriceListSourcePrice) {
  return `${sourcePrice.storeName}: ${getComparablePrice(sourcePrice).toFixed(2)}`;
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

function csvEscape(value: string | number) {
  const text = String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
