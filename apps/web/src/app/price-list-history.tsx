"use client";

import { Eye, History, Loader2, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { PriceHistoryDecisionPanel } from "@/components/price-history/PriceHistoryDecisionPanel";
import type {
  PriceListHistoryResponse,
  PriceListRunDetail,
  PriceListRunDetailResponse,
  PriceListRunSummary,
} from "@/types/search";

export function PriceListHistory() {
  const [runs, setRuns] = useState<PriceListRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PriceListRunDetail | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setIsLoadingRuns(true);
    setError(null);

    try {
      const response = await fetch("/api/price-list/history", {
        cache: "no-store",
      });
      const payload = (await response.json()) as PriceListHistoryResponse;

      if (!response.ok || payload.errorMessage) {
        throw new Error(payload.errorMessage ?? "No se pudo cargar el historial.");
      }

      setIsEnabled(payload.enabled);
      setRuns(payload.runs);

      if (payload.runs.length === 0) {
        setSelectedRunId(null);
        setDetail(null);
        return;
      }

      const nextRunId =
        selectedRunId && payload.runs.some((run) => run.id === selectedRunId)
          ? selectedRunId
          : payload.runs[0].id;
      setSelectedRunId(nextRunId);
      await loadDetail(nextRunId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar el historial.",
      );
    } finally {
      setIsLoadingRuns(false);
    }
  }

  async function loadDetail(runId: string) {
    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await fetch(`/api/price-list/history/${runId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as PriceListRunDetailResponse;

      if (!response.ok || payload.errorMessage) {
        throw new Error(payload.errorMessage ?? "No se pudo cargar el detalle.");
      }

      if (!payload.detail) {
        setRuns((currentRuns) =>
          currentRuns.filter((run) => run.id !== runId),
        );
        setSelectedRunId(null);
        setDetail(null);
        return;
      }

      setSelectedRunId(runId);
      setDetail(payload.detail);
    } catch (caughtError) {
      setDetail(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cargar el detalle.",
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function archiveSelectedRun() {
    if (!detail || isArchiving) {
      return;
    }

    const confirmed = window.confirm(
      "Esta carga anterior dejará de aparecer en el historial. No se eliminan sus datos. ¿Continuar?",
    );

    if (!confirmed) {
      return;
    }

    setIsArchiving(true);
    setError(null);

    try {
      const response = await fetch(`/api/price-list/history/${detail.run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const payload = (await response.json()) as {
        archived?: boolean;
        errorMessage?: string;
      };

      if (!response.ok || !payload.archived) {
        throw new Error(payload.errorMessage ?? "No se pudo archivar la carga.");
      }

      setSelectedRunId(null);
      setDetail(null);
      await loadHistory();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo archivar la carga.",
      );
    } finally {
      setIsArchiving(false);
    }
  }

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  return (
    <section className="overflow-hidden rounded-md border border-[#eadbd3] bg-white shadow-[0_14px_40px_rgba(77,41,25,0.08)]">
      <header className="flex flex-col justify-between gap-3 border-b border-[#eadbd3] px-4 py-4 sm:px-5 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-[#171717]">
            <History className="h-5 w-5 text-[#df2e38]" />
            Historial de decisiones
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667789]">
            Revisá cada carga con Excel y Tokin por separado, priorizando la
            comparación contra mayoristas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={isLoadingRuns}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#dec8bd] bg-white px-3 text-sm font-semibold text-[#171717] transition hover:border-[#275fbd] hover:text-[#275fbd] disabled:cursor-not-allowed disabled:text-[#a99f99] sm:w-fit"
        >
          {isLoadingRuns ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </button>
      </header>

      {!isEnabled ? (
        <StateMessage>
          Historial disponible cuando Supabase esté configurado.
        </StateMessage>
      ) : null}

      {error ? (
        <div className="m-4 rounded-md border border-[#e4a79f] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f2d20]">
          {error}
        </div>
      ) : null}

      {isLoadingRuns ? (
        <div className="m-4 flex items-center gap-2 rounded-md border border-[#eadbd3] bg-[#fffdfa] px-4 py-3 text-sm text-[#6f625d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial...
        </div>
      ) : null}

      {!isLoadingRuns && isEnabled && runs.length === 0 ? (
        <StateMessage>
          Todavía no hay listas guardadas. En Importación activá “Guardar esta
          carga para evolución”.
        </StateMessage>
      ) : null}

      {runs.length > 0 ? (
        <div className="grid min-w-0 xl:grid-cols-[300px_minmax(0,1fr)]">
          <RunList
            runs={runs}
            selectedRunId={selectedRunId}
            onSelect={(runId) => void loadDetail(runId)}
          />

          <div className="min-w-0 border-t border-[#d9dee7] xl:border-l xl:border-t-0">
            {isLoadingDetail ? (
              <div className="flex items-center gap-2 px-4 py-5 text-sm text-[#526170]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando detalle...
              </div>
            ) : detail ? (
              <PriceHistoryDecisionPanel
                key={detail.run.id}
                detail={detail}
                isArchiving={isArchiving}
                onArchive={() => void archiveSelectedRun()}
              />
            ) : selectedRun ? (
              <div className="px-4 py-5 text-sm text-[#526170]">
                Seleccioná una carga para ver el detalle.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RunList({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: PriceListRunSummary[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <aside
      aria-label="Cargas guardadas"
      className="max-h-[420px] overflow-auto bg-white xl:max-h-[980px]"
    >
      {runs.map((run) => {
        const isSelected = selectedRunId === run.id;

        return (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            aria-pressed={isSelected}
            className={`flex w-full items-start justify-between gap-3 border-b border-[#e5e9ef] px-4 py-3 text-left transition ${
              isSelected ? "bg-[#edf3ff]" : "bg-white hover:bg-[#f8fafc]"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#17202a]">
                {formatRunTitle(run)}
              </span>
              <span className="mt-1 block text-xs text-[#667789]">
                {formatDate(run.createdAt)}
              </span>
              <span className="mt-2 block text-xs text-[#526170]">
                {typeof run.ownPriceCount !== "number"
                  ? `${run.matchedCount}/${run.itemsCount} con mercado · carga anterior`
                  : `${run.ownPriceCount}/${run.itemsCount} con precio propio`}
              </span>
              {typeof run.missingOwnPriceCount === "number" && run.missingOwnPriceCount > 0 ? (
                <span className="mt-1 block text-xs font-semibold text-[#8a5a0a]">
                  {run.missingOwnPriceCount} sin referencia propia
                </span>
              ) : null}
            </span>
            <Eye
              aria-hidden="true"
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                isSelected ? "text-[#275fbd]" : "text-[#9aa5b1]"
              }`}
            />
          </button>
        );
      })}
    </aside>
  );
}

function StateMessage({ children }: { children: ReactNode }) {
  return (
    <div className="m-4 rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#526170]">
      {children}
    </div>
  );
}

function formatRunTitle(run: PriceListRunSummary) {
  return run.weekStart ? `Semana ${formatShortDate(run.weekStart)}` : run.listName;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
