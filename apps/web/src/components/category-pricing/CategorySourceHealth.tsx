"use client";

import type { SourceChannel } from "@/lib/source-priority";
import type { SourceHealthSummary, SourceHealthItem } from "@/lib/category-pricing";

export function CategorySourceHealth({ summary }: { summary: SourceHealthSummary }) {
  const visibleItems = summary.items.filter((item) => item.expected || item.resultsCount > 0);
  const ownItems = visibleItems.filter((item) => item.channel === "own");
  const wholesaleItems = visibleItems.filter((item) => item.channel === "mayorista");
  const retailItems = visibleItems.filter((item) => item.channel === "minorista");

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e5e9ef] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.05em] text-[#17202a]">
            Cobertura de fuentes
          </h3>
          <p className="mt-1 text-sm text-[#667789]">
            Maxiconsumo Chaco queda como referencia mayorista principal del NEA.
            Las fuentes esperadas no se ocultan aunque no tengan datos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <MetricChip label="Con datos" value={summary.withData} tone="success" />
          <MetricChip label="Sin datos" value={summary.withoutData} tone="neutral" />
          <MetricChip label="Pendientes" value={summary.pending} tone="warning" />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-3">
        <SourceHealthGroup title="Fuente propia" items={ownItems} />
        <SourceHealthGroup title="Mayoristas prioritarios" items={wholesaleItems} emphasized />
        <SourceHealthGroup title="Minoristas de referencia" items={retailItems} />
      </div>
    </section>
  );
}

function SourceHealthGroup({
  title,
  items,
  emphasized = false,
}: {
  title: string;
  items: SourceHealthItem[];
  emphasized?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <div
        className={
          emphasized
            ? "mb-2 flex items-center justify-between rounded bg-[#eaf7ef] px-3 py-2 text-xs font-black uppercase tracking-[0.05em] text-[#16613c]"
            : "mb-2 px-1 text-xs font-black uppercase tracking-[0.05em] text-[#667789]"
        }
      >
        <span>{title}</span>
        {emphasized ? <span>{items.filter((item) => item.status === "ok").length} con datos</span> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SourceHealthCard key={item.sourceId} item={item} />
        ))}
      </div>
    </div>
  );
}

function SourceHealthCard({ item }: { item: SourceHealthItem }) {
  return (
    <article className="rounded-md border border-[#e5e9ef] bg-[#fffdfa] px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-[#17202a]">{item.displayName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <ChannelChip channel={item.channel} />
            {item.primaryReference ? (
              <span className="rounded bg-[#e8f3ff] px-2 py-0.5 text-[10px] font-bold text-[#16477f]">
                Prioritaria NEA
              </span>
            ) : null}
            {item.criticalForDecision ? (
              <span className="rounded bg-[#fff0c2] px-2 py-0.5 text-[10px] font-bold text-[#73510b]">
                Critica
              </span>
            ) : null}
          </div>
        </div>
        <span className={sourceStatusClassName(item.status)}>{item.statusLabel}</span>
      </div>
      <div className="mt-2 text-xs text-[#667789]">
        {item.resultsCount} resultados · {item.durationMs} ms
      </div>
      {item.status !== "ok" || item.message ? (
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-[#73510b]">{item.message}</p>
      ) : null}
    </article>
  );
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "neutral";
}) {
  const toneClassName =
    tone === "success"
      ? "bg-[#e6f6ed] text-[#16613c]"
      : tone === "warning"
        ? "bg-[#fff0c2] text-[#73510b]"
        : "bg-[#edf1f5] text-[#526170]";

  return (
    <span className={`inline-flex rounded px-2.5 py-1 ${toneClassName}`}>
      {label}: {value}
    </span>
  );
}

function ChannelChip({ channel }: { channel: SourceChannel }) {
  const label = channel === "own" ? "Propio" : channel === "mayorista" ? "Mayorista" : "Minorista";
  const className =
    channel === "own"
      ? "bg-[#edf3ff] text-[#153d7b]"
      : channel === "mayorista"
        ? "bg-[#eaf7ef] text-[#16613c]"
        : "bg-[#fff4e8] text-[#8a4b12]";

  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${className}`}>
      {label}
    </span>
  );
}

function sourceStatusClassName(status: SourceHealthItem["status"]) {
  const base = "shrink-0 rounded px-2 py-1 text-[10px] font-bold";

  if (status === "ok") {
    return `${base} bg-[#dff5e8] text-[#16613c]`;
  }

  if (status === "requires_login" || status === "pending" || status === "not_configured") {
    return `${base} bg-[#fff0c2] text-[#73510b]`;
  }

  if (status === "timeout" || status === "failed") {
    return `${base} bg-[#fee2dc] text-[#9b2f1c]`;
  }

  return `${base} bg-[#edf1f5] text-[#526170]`;
}
