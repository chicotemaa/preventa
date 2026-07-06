"use client";

import { Clipboard, Loader2, UploadCloud } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type ImportResponse = {
  ok?: boolean;
  importedCount?: number;
  acceptedCount?: number;
  message?: string;
  error?: string;
  snapshot?: {
    productsCount: number;
    visiblePriceProductsCount: number;
    syncedAt: string;
    queries: string[];
  } | null;
};

const extractorScript = String.raw`(() => {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const parsePrice = (value) => {
    const match = normalize(value).match(/\$\s*([0-9.]+(?:,[0-9]{1,2})?)/);
    if (!match) return null;
    const price = Number(match[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(price) && price > 0 ? price : null;
  };
  const findName = (lines, priceIndex) => {
    const candidates = lines
      .slice(0, Math.max(priceIndex, 1))
      .filter((line) => !/^cod\.?/i.test(line))
      .filter((line) => !/^\$\s*/.test(line))
      .filter((line) => !/añadir|agregar|carrito|final|unidad|bulto/i.test(line));
    return candidates[candidates.length - 1] || "";
  };
  const cards = Array.from(
    document.querySelectorAll("article, li, [class*='product'], [class*='Product'], [class*='card'], .vtex-product-summary-2-x-container")
  );
  const seen = new Set();
  const products = [];

  for (const card of cards) {
    const rawText = card.innerText || "";
    if (!/\$\s*[0-9]/.test(rawText)) continue;

    const lines = rawText
      .split(/\n+/)
      .map(normalize)
      .filter(Boolean);
    const priceIndex = lines.findIndex((line) => /\$\s*[0-9]/.test(line));
    const price = parsePrice(lines[priceIndex]);
    const name = normalize(findName(lines, priceIndex));
    if (!name || !price) continue;

    const sku =
      (rawText.match(/Cod\.?\s*([A-Z0-9-]+)/i) || rawText.match(/SKU\s*([A-Z0-9-]+)/i) || [])[1] || null;
    const imageUrl = card.querySelector("img")?.src || null;
    const productUrl = card.querySelector("a[href]")?.href || location.href;
    const key = name + "|" + price + "|" + (sku || "");
    if (seen.has(key)) continue;
    seen.add(key);

    products.push({
      name,
      price,
      sku,
      imageUrl,
      productUrl,
      priceCondition: "Carrefour Comerciante - importado desde navegador autorizado",
    });
  }

  const query =
    document.querySelector("input[type='search'], input[name='q'], input[placeholder*='Buscar' i]")?.value ||
    new URLSearchParams(location.search).get("q") ||
    "carrefour-comerciante";
  const payload = {
    mode: "append",
    query,
    sourceUrl: location.href,
    products: products.slice(0, 120),
  };

  copy(JSON.stringify(payload, null, 2));
  console.log("Productos copiados:", payload);
})();`;

export default function CarrefourImportPage() {
  const [payloadText, setPayloadText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [query, setQuery] = useState("alfajor");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const parsedPreview = useMemo(() => {
    if (!payloadText.trim()) {
      return { count: 0, valid: false };
    }

    try {
      const parsed = JSON.parse(payloadText) as {
        products?: unknown[];
        query?: string;
      };
      return {
        count: Array.isArray(parsed.products) ? parsed.products.length : 0,
        valid: Array.isArray(parsed.products),
        query: parsed.query,
      };
    } catch {
      return { count: 0, valid: false };
    }
  }, [payloadText]);

  async function importPayload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsImporting(true);

    try {
      const parsed = JSON.parse(payloadText) as Record<string, unknown>;
      const response = await fetch(
        "/api/source-sessions/carrefour-comerciante/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parsed,
            mode,
            query: query.trim() || parsed.query || "carrefour-comerciante",
          }),
        },
      );
      const data = (await response.json()) as ImportResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo importar el lote.");
      }

      setResult(data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo importar el lote.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  async function copyScript() {
    await navigator.clipboard.writeText(extractorScript);
  }

  return (
    <main className="min-h-screen bg-[#fff8f2]">
      <section className="bg-[#153d7b] px-4 py-7 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
            Configuración
          </p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-4xl">
            Importar Carrefour Comerciante
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/85 sm:text-base">
            Usá este flujo cuando Carrefour muestra precios en tu navegador,
            pero el worker solo recibe precios privados. La importación se
            guarda server-side y queda disponible para catálogo.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1400px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:px-8">
        <aside className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-[#17202a]">Paso a paso</h2>
          <ol className="mt-3 grid gap-3 text-sm leading-6 text-[#526170]">
            <li>1. Abrí Carrefour Comerciante y verificá que veas precios.</li>
            <li>2. Buscá una familia, por ejemplo “alfajor”.</li>
            <li>3. Pegá el script en la consola del navegador.</li>
            <li>4. Volvé acá, pegá el JSON copiado e importá el lote.</li>
          </ol>

          <button
            type="button"
            onClick={copyScript}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#153d7b] px-4 text-sm font-bold text-white transition hover:bg-[#0f3165]"
          >
            <Clipboard className="h-4 w-4" />
            Copiar script extractor
          </button>

          <pre className="mt-4 max-h-[360px] overflow-auto rounded-md border border-[#d9dee7] bg-[#f8fafc] p-3 text-[11px] leading-5 text-[#17202a]">
            {extractorScript}
          </pre>
        </aside>

        <form
          onSubmit={importPayload}
          className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm"
        >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#17202a]">
                Consulta / familia
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 rounded-md border border-[#d9dee7] px-3 text-sm font-semibold text-[#17202a] outline-none focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#17202a]">
                Modo
              </span>
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value === "replace" ? "replace" : "append")
                }
                className="h-11 rounded-md border border-[#d9dee7] px-3 text-sm font-semibold text-[#17202a] outline-none focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
              >
                <option value="append">Agregar lote</option>
                <option value="replace">Reemplazar catálogo</option>
              </select>
            </label>

            <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-3 py-2 text-sm">
              <div className="font-bold text-[#17202a]">
                {parsedPreview.count} productos
              </div>
              <div className="text-xs text-[#667789]">
                {parsedPreview.valid ? "JSON válido" : "Sin JSON válido"}
              </div>
            </div>
          </div>

          <label className="mt-4 grid gap-2">
            <span className="text-sm font-semibold text-[#17202a]">
              JSON del lote
            </span>
            <textarea
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              rows={18}
              placeholder='{"query":"alfajor","products":[{"name":"...","price":1234.56}]}'
              className="w-full resize-y rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 py-2 font-mono text-xs text-[#17202a] outline-none focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
            />
          </label>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={isImporting || !parsedPreview.valid}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#df2e38] px-5 text-sm font-bold text-white transition hover:bg-[#c82831] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {isImporting ? "Importando..." : "Importar lote"}
            </button>
            <p className="text-xs leading-5 text-[#667789]">
              Máximo 120 productos por lote. Para más productos, repetí con modo
              “Agregar lote”.
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-[#efb8b0] bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#9b2f1c]">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-4 rounded-md border border-[#b8dec8] bg-[#f0fbf4] px-4 py-3 text-sm leading-6 text-[#17633a]">
              <div className="font-bold">
                {result.message ?? "Lote importado."}
              </div>
              <div>
                Importados: {result.importedCount ?? 0} · Aceptados:{" "}
                {result.acceptedCount ?? 0} · Catálogo:{" "}
                {result.snapshot?.productsCount ?? 0}
              </div>
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
