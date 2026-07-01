"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CarrefourComercianteCatalogSyncResponse,
  CarrefourComercianteSessionSaveResponse,
  CarrefourComercianteSessionValidationResponse,
  SourceSessionState,
} from "@/types/search";

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
  const [sessionState, setSessionState] = useState<SourceSessionState | null>(
    null,
  );
  const [syncResult, setSyncResult] =
    useState<CarrefourComercianteCatalogSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [commerceData, setCommerceData] = useState({
    name: "",
    document: "",
    phone: "",
    email: "",
  });

  const envPreview = useMemo(
    () => [
      "CARREFOUR_COMERCIANTE_ENABLED=true",
      "SOURCE_SESSION_SECRET=<clave larga para cifrar sesiones>",
      "CARREFOUR_COMERCIANTE_REGION=CHACO",
      "CARREFOUR_COMERCIANTE_SELLER_ID=506",
      "CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio",
    ],
    [],
  );

  useEffect(() => {
    void loadSessionState();
  }, []);

  async function loadSessionState() {
    try {
      const response = await fetch("/api/source-sessions", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        sources: SourceSessionState[];
      };
      setSessionState(
        payload.sources.find(
          (source) => source.sourceId === "carrefour-comerciante-maxi",
        ) ?? null,
      );
    } catch {
      setSessionState(null);
    }
  }

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
      void loadSessionState();
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

  async function saveSession() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/source-sessions/carrefour-comerciante/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cookie: cookie.trim(),
            userAgent: userAgent.trim(),
            query: query.trim() || "alfajor",
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        if (payload.validation) {
          setResult(payload.validation as CarrefourComercianteSessionValidationResponse);
        }

        throw new Error(payload.error ?? "No se pudo guardar la sesión.");
      }

      const savePayload = payload as CarrefourComercianteSessionSaveResponse;
      setResult(savePayload.validation);
      setSessionState(savePayload.session);
      setCookie("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la sesión.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function connectFromBackend() {
    setError(null);
    setResult(null);
    setSyncResult(null);
    setIsConnecting(true);

    try {
      const response = await fetch(
        "/api/source-sessions/carrefour-comerciante/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...commerceData,
            query: query.trim() || "alfajor",
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        if (payload.validation) {
          setResult(
            payload.validation as CarrefourComercianteSessionValidationResponse,
          );
        }

        throw new Error(
          payload.error ??
            "No se pudo conectar Carrefour Comerciante desde el backend.",
        );
      }

      const savePayload = payload as CarrefourComercianteSessionSaveResponse;
      setResult(savePayload.validation);
      setSessionState(savePayload.session);
      await loadSessionState();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo conectar Carrefour Comerciante desde el backend.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function syncCatalog() {
    setError(null);
    setSyncResult(null);
    setIsSyncing(true);

    try {
      const response = await fetch(
        "/api/source-sessions/carrefour-comerciante/sync",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxPagesPerQuery: 6,
            itemsPerPage: 24,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo sincronizar el catálogo.");
      }

      setSyncResult(payload as CarrefourComercianteCatalogSyncResponse);
      await loadSessionState();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo sincronizar el catálogo.",
      );
    } finally {
      setIsSyncing(false);
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
            La sesión se guarda del lado del worker y después se usa para
            sincronizar catálogos.
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
                La validación y el guardado se hacen server-side. La cookie no
                queda en el navegador ni en el repositorio.
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

          <ValidationSummary result={result} isBusy={isValidating || isConnecting || isSaving} />

          <div className="mt-5 rounded-md border border-[#d9dee7] bg-[#f8fafc] p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-[#667789]">
                  1. Conectar con datos del comercio
                </h3>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-[#526170]">
                  Este es el flujo recomendado. Si Carrefour autoriza precios,
                  la sesión queda guardada automáticamente del lado del worker.
                </p>
              </div>
              <button
                type="button"
                onClick={connectFromBackend}
                disabled={isConnecting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#153d7b] px-5 text-sm font-bold text-white transition hover:bg-[#0f3165] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {isConnecting ? "Conectando..." : "Conectar y guardar sesión"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
                  Nombre y apellido
                </span>
                <input
                  value={commerceData.name}
                  onChange={(event) =>
                    setCommerceData((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Opcional si está en el worker"
                  className="h-11 rounded-md border border-[#d9dee7] bg-white px-3 text-sm text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
                  CUIT / DNI
                </span>
                <input
                  value={commerceData.document}
                  onChange={(event) =>
                    setCommerceData((current) => ({
                      ...current,
                      document: event.target.value,
                    }))
                  }
                  placeholder="Opcional si está en el worker"
                  className="h-11 rounded-md border border-[#d9dee7] bg-white px-3 text-sm text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
                  Teléfono
                </span>
                <input
                  value={commerceData.phone}
                  onChange={(event) =>
                    setCommerceData((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="Opcional si está en el worker"
                  className="h-11 rounded-md border border-[#d9dee7] bg-white px-3 text-sm text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[#667789]">
                  Email
                </span>
                <input
                  value={commerceData.email}
                  onChange={(event) =>
                    setCommerceData((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="Opcional si está en el worker"
                  className="h-11 rounded-md border border-[#d9dee7] bg-white px-3 text-sm text-[#17202a] outline-none transition placeholder:text-[#9aa5b1] focus:border-[#153d7b] focus:ring-2 focus:ring-[#153d7b]/15"
                />
              </label>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#667789]">
              Usá este botón para los datos del comercio. No hace falta tocar
              “Guardar cookie validada” cuando estás usando este flujo.
            </p>
          </div>

          <form onSubmit={validateSession} className="mt-5 grid gap-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-[#667789]">
                2. Fallback técnico: validar cookie manual
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#526170]">
                Usalo solo si ya tenés una cookie de una sesión donde los
                precios se ven en el navegador.
              </p>
            </div>

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
                entorno o la sesión guardada en el worker.
              </p>
            </div>
          </form>

          <div className="mt-5 grid gap-3 border-t border-[#edf0f4] pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-[#667789]">
                3. Acciones sobre sesión manual
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#526170]">
                Este guardado usa la cookie del bloque técnico. Si conectaste
                con datos del comercio, la sesión ya queda guardada cuando
                valida correctamente.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={saveSession}
                disabled={isSaving || !cookie.trim() || !userAgent.trim()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#df2e38] px-5 text-sm font-bold text-white transition hover:bg-[#c82831] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? "Guardando..." : "Guardar cookie validada"}
              </button>
              <button
                type="button"
                onClick={syncCatalog}
                disabled={isSyncing || !sessionState?.hasSession}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#153d7b] px-5 text-sm font-bold text-white transition hover:bg-[#0f3165] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isSyncing ? "Sincronizando..." : "Sincronizar catálogo"}
              </button>
            </div>
          </div>

          {error ? (
            <div
              aria-live="polite"
              className="mt-4 rounded-md border border-[#efb8b0] bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#9b2f1c]"
            >
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-4">
              <ValidationResult result={result} envPreview={envPreview} />
            </div>
          ) : null}
        </section>

        <SessionStatus
          sessionState={sessionState}
          syncResult={syncResult}
          envPreview={envPreview}
        />
      </section>
    </main>
  );
}

function SessionStatus({
  sessionState,
  syncResult,
  envPreview,
}: {
  sessionState: SourceSessionState | null;
  syncResult: CarrefourComercianteCatalogSyncResponse | null;
  envPreview: string[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#17202a]">
          <Database className="h-5 w-5 text-[#153d7b]" />
          Estado guardado
        </h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Sesión"
            value={sessionState?.hasSession ? "Guardada" : "Sin guardar"}
          />
          <Metric
            label="Validación"
            value={sessionState?.lastValidation?.status ?? "-"}
          />
          <Metric
            label="Catálogo"
            value={sessionState?.snapshot?.productsCount ?? 0}
          />
          <Metric
            label="Storage"
            value={
              sessionState?.storageBackend === "supabase"
                ? "Supabase"
                : sessionState?.storageBackend === "file"
                  ? "Local"
                  : "-"
            }
          />
          <Metric
            label="Cifrado"
            value={sessionState?.isEncrypted ? "Sí" : "No"}
          />
        </div>

        {sessionState?.lastValidation ? (
          <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#526170]">
            {sessionState.lastValidation.message}
          </div>
        ) : null}

        {syncResult?.snapshot ? (
          <div className="mt-4 overflow-hidden rounded-md border border-[#d9dee7]">
            <div className="border-b border-[#edf0f4] bg-[#f8fafc] px-3 py-2 text-sm font-bold text-[#17202a]">
              Última sincronización
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              <Metric
                label="Productos"
                value={syncResult.snapshot.productsCount}
              />
              <Metric
                label="Con precio"
                value={syncResult.snapshot.visiblePriceProductsCount}
              />
              <Metric
                label="Privados"
                value={syncResult.snapshot.privateProductsCount}
              />
            </div>
          </div>
        ) : null}
      </div>

      <aside className="rounded-md border border-[#eadbd3] bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold text-[#17202a]">
          Producción
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#667789]">
          Para que la sesión y el catálogo sobrevivan deploys, el worker debe
          tener Supabase configurado. Si no, cae a storage local de desarrollo.
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-[#17202a] p-3 text-xs leading-5 text-white">
          {envPreview.join("\n")}
          {"\nSUPABASE_URL=<url>\nSUPABASE_SERVICE_ROLE_KEY=<service-role>\nSOURCE_SESSION_STORE_BACKEND=supabase\nSOURCE_SESSION_SECRET=<clave-larga>"}
        </pre>
      </aside>
    </section>
  );
}

function ValidationSummary({
  result,
  isBusy,
}: {
  result: CarrefourComercianteSessionValidationResponse | null;
  isBusy: boolean;
}) {
  if (isBusy) {
    return (
      <div
        aria-live="polite"
        className="mt-5 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-[#153d7b]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Validando sesión...
        </div>
        <p className="mt-1 text-sm leading-6 text-[#526170]">
          Esperá el resultado antes de guardar o sincronizar.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div
        aria-live="polite"
        className="mt-5 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3"
      >
        <div className="text-sm font-bold text-[#17202a]">
          Estado: sin validar
        </div>
        <p className="mt-1 text-sm leading-6 text-[#526170]">
          Todavía no se comprobó si Carrefour devuelve precios visibles.
        </p>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className={`mt-5 rounded-md border px-4 py-3 ${statusStyles[result.status]}`}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-base font-extrabold">
            {result.ok ? "Validó: precios visibles" : "No validó"}
          </div>
          <p className="mt-1 text-sm leading-6">{result.message}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold sm:min-w-[340px]">
          <div className="rounded-md bg-white/70 px-2 py-2">
            <div className="text-[10px] uppercase tracking-[0.06em] opacity-75">
              Productos
            </div>
            <div className="text-lg">{result.productsCount}</div>
          </div>
          <div className="rounded-md bg-white/70 px-2 py-2">
            <div className="text-[10px] uppercase tracking-[0.06em] opacity-75">
              Con precio
            </div>
            <div className="text-lg">{result.visiblePriceProductsCount}</div>
          </div>
          <div className="rounded-md bg-white/70 px-2 py-2">
            <div className="text-[10px] uppercase tracking-[0.06em] opacity-75">
              Privados
            </div>
            <div className="text-lg">{result.privateProductsCount}</div>
          </div>
        </div>
      </div>
      {!result.ok ? (
        <div className="mt-3 rounded-md bg-white/70 px-3 py-2 text-sm font-semibold">
          {result.nextAction}
        </div>
      ) : null}
    </div>
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
          {result.ok ? "Validación aprobada" : "Validación no aprobada"}
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
            <div className="border-b border-[#edf0f4] bg-[#f8fafc] px-3 py-2">
              <div className="text-sm font-bold text-[#17202a]">
                Productos detectados en la prueba
              </div>
              <div className="text-xs leading-5 text-[#667789]">
                Si figuran como privado, Carrefour encontró productos pero no
                autorizó precios para esta sesión.
              </div>
            </div>
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
        ) : (
          <div className="mt-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#526170]">
            No se detectaron productos en la consulta de prueba.
          </div>
        )}
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
