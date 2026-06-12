"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { CarrefourComercianteSessionValidationResponse } from "@/types/search";

const statusStyles: Record<
  CarrefourComercianteSessionValidationResponse["status"],
  string
> = {
  authorized: "border-[#b8dec8] bg-[#f0fbf4] text-[#17633a]",
  private_prices: "border-[#f1c18e] bg-[#fff7ed] text-[#8a4a10]",
  missing_cookie: "border-[#d9dee7] bg-[#f8fafc] text-[#526170]",
  logged_out: "border-[#f1c18e] bg-[#fff7ed] text-[#8a4a10]",
  no_public_products: "border-[#d9dee7] bg-[#f8fafc] text-[#526170]",
  failed: "border-[#efb8b0] bg-[#fff1ef] text-[#9b2f1c]",
};

export default function ConfiguracionPage() {
  const [cookie, setCookie] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [query, setQuery] = useState("alfajor");
  const [result, setResult] =
    useState<CarrefourComercianteSessionValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const envPreview = useMemo(
    () => [
      "CARREFOUR_COMERCIANTE_ENABLED=true",
      "CARREFOUR_COMERCIANTE_COOKIE=<cookie validada>",
      "CARREFOUR_COMERCIANTE_USER_AGENT=<user-agent validado>",
      "CARREFOUR_COMERCIANTE_REGION=CHACO",
      "CARREFOUR_COMERCIANTE_SELLER_ID=506",
      "CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio",
    ],
    [],
  );

  async function validateSession(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError(null);
    setResult(null);
    setIsValidating(true);

    try {
      const response = await fetch(
        "/api/source-sessions/carrefour-comerciante/validate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cookie: cookie.trim() || undefined,
            userAgent: userAgent.trim() || undefined,
            query: query.trim() || "alfajor",
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo validar la sesión.");
      }

      setResult(payload as CarrefourComercianteSessionValidationResponse);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo validar la sesión.",
      );
    } finally {
      setIsValidating(false);
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
            Configuración de fuentes
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/88 sm:text-base">
            Control de sesiones para fuentes mayoristas con precios privados.
          </p>
        </div>
      </section>

      <section className="flex w-full flex-col gap-4 px-3 py-4 sm:px-4 md:py-5 lg:px-6">
        <section className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#17202a]">
                <KeyRound className="h-5 w-5 text-[#df2e38]" />
                Carrefour Comerciante
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#667789]">
                La validación se hace server-side y no guarda la cookie en el
                navegador ni en el repositorio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => validateSession()}
              disabled={isValidating}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-4 text-sm font-semibold text-[#17202a] transition hover:border-[#153d7b] hover:text-[#153d7b] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
              Validar sesión actual
            </button>
          </div>

          <form onSubmit={validateSession} className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#17202a]">
                Cookie de sesión
              </span>
              <textarea
                value={cookie}
                onChange={(event) => setCookie(event.target.value)}
                rows={5}
                placeholder="PHPSESSID=...; cf_clearance=...; ..."
                className="min-h-[130px] w-full resize-y rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 py-2 font-mono text-xs text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
              />
            </label>

            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#17202a]">
                  User-Agent
                </span>
                <input
                  value={userAgent}
                  onChange={(event) => setUserAgent(event.target.value)}
                  placeholder="Mozilla/5.0 ..."
                  className="h-11 rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 text-sm text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#17202a]">
                  Consulta de prueba
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-11 rounded-md border border-[#d9dee7] bg-[#fffdfa] px-3 text-sm font-semibold text-[#17202a] outline-none transition focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={isValidating}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#153d7b] px-5 text-sm font-bold text-white transition hover:bg-[#0f3165] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
                {isValidating ? "Validando..." : "Validar cookie"}
              </button>
              <p className="text-xs leading-5 text-[#667789]">
                Si el campo queda vacío, se valida la cookie cargada en el
                entorno del worker.
              </p>
            </div>
          </form>

          {error ? (
            <div className="mt-4 rounded-md border border-[#efb8b0] bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#9b2f1c]">
              {error}
            </div>
          ) : null}
        </section>

        {result ? <ValidationResult result={result} envPreview={envPreview} /> : null}
      </section>
    </main>
  );
}

function ValidationResult({
  result,
  envPreview,
}: {
  result: CarrefourComercianteSessionValidationResponse;
  envPreview: string[];
}) {
  const Icon = result.ok ? CheckCircle2 : XCircle;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
        <div
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold ${statusStyles[result.status]}`}
        >
          <Icon className="h-4 w-4" />
          {statusLabel(result.status)}
        </div>

        <h2 className="mt-4 text-lg font-bold text-[#17202a]">
          Resultado de validación
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#526170]">{result.message}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Productos" value={result.productsCount} />
          <Metric label="Con precio" value={result.visiblePriceProductsCount} />
          <Metric label="Privados" value={result.privateProductsCount} />
          <Metric label="Tiempo" value={`${result.durationMs} ms`} />
        </div>

        <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
            Próximo paso
          </div>
          <div className="mt-1 text-sm font-semibold text-[#17202a]">
            {result.nextAction}
          </div>
        </div>

        {result.sampleProducts.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-md border border-[#d9dee7]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#f8fafc] text-xs uppercase tracking-[0.06em] text-[#667789]">
                <tr>
                  <th className="px-3 py-2 font-bold">Producto detectado</th>
                  <th className="px-3 py-2 font-bold">EAN</th>
                  <th className="px-3 py-2 text-right font-bold">Precio</th>
                </tr>
              </thead>
              <tbody>
                {result.sampleProducts.map((product) => (
                  <tr
                    key={`${product.name}-${product.barcode ?? "sin-ean"}`}
                    className="border-t border-[#edf0f4]"
                  >
                    <td className="px-3 py-2 font-semibold text-[#17202a]">
                      {product.name}
                    </td>
                    <td className="px-3 py-2 text-[#667789]">
                      {product.barcode ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-[#17202a]">
                      {product.price ? formatCurrency(product.price) : "Privado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <aside className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold text-[#17202a]">
          Variables para producción
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#667789]">
          Cuando la validación dé OK, cargar estos valores en el entorno del
          worker y redeployar.
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-[#17202a] p-3 text-xs leading-5 text-white">
          {envPreview.join("\n")}
        </pre>
        <div className="mt-4 rounded-md border border-[#f1c18e] bg-[#fff7ed] px-4 py-3 text-sm leading-6 text-[#8a4a10]">
          La cookie vence. Si Carrefour vuelve a mostrar precios privados,
          repetir la validación y actualizar la variable.
        </div>
      </aside>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-[#d9dee7] bg-white px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-[#17202a]">{value}</div>
    </div>
  );
}

function statusLabel(
  status: CarrefourComercianteSessionValidationResponse["status"],
) {
  const labels: Record<
    CarrefourComercianteSessionValidationResponse["status"],
    string
  > = {
    authorized: "Sesión válida",
    private_prices: "Precios privados",
    missing_cookie: "Falta cookie",
    logged_out: "Sesión no autorizada",
    no_public_products: "Sin productos públicos",
    failed: "Error",
  };

  return labels[status];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}
