"use client";

import type { CategoryDecisionRow, PricingTone } from "@/lib/category-pricing";
import { formatMatchQualityLabel } from "@/lib/category-pricing";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function CategoryDecisionTable({
  rows,
  onOpenDetail,
}: {
  rows: CategoryDecisionRow[];
  onOpenDetail: (rowId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#526170]">
        No hay productos para los filtros aplicados.
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-auto rounded-md border border-[#d9dee7] bg-white xl:block">
        <table className="min-w-[1320px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#edf1f5] text-[11px] uppercase tracking-[0.05em] text-[#526170]">
            <tr>
              <th className="w-[270px] px-3 py-3">Producto / cluster</th>
              <th className="w-[120px] px-3 py-3">Marca</th>
              <th className="w-[120px] px-3 py-3">Presentacion</th>
              <th className="w-[125px] px-3 py-3">Aguiar</th>
              <th className="w-[145px] px-3 py-3">Mejor mayorista</th>
              <th className="w-[145px] px-3 py-3">Mejor minorista</th>
              <th className="w-[145px] px-3 py-3">Mejor general</th>
              <th className="w-[135px] px-3 py-3">Dif. vs mercado</th>
              <th className="w-[105px] px-3 py-3">Canal</th>
              <th className="w-[130px] px-3 py-3">Ganador</th>
              <th className="w-[105px] px-3 py-3">Confianza</th>
              <th className="w-[190px] px-3 py-3">Accion</th>
              <th className="w-[100px] px-3 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e9ef]">
            {rows.map((row) => (
              <tr key={row.id} className={rowToneClassName(row.recommendation.tone)}>
                <td className="px-3 py-3 align-top">
                  <div className="line-clamp-2 font-semibold leading-5 text-[#17202a]">
                    {row.clusterName}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.hasPromo ? <PromoChip /> : null}
                    {row.alerts.slice(0, 2).map((alert) => (
                      <span
                        key={`${row.id}-${alert.label}`}
                        className={alertChipClassName(alert.severity)}
                      >
                        {alert.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 align-top font-medium text-[#526170]">
                  {row.brand}
                </td>
                <td className="px-3 py-3 align-top text-[#526170]">
                  {row.presentationLabel}
                </td>
                <td className="px-3 py-3 align-top">
                  <PriceCell cell={row.aguiarPrice} />
                </td>
                <td className="px-3 py-3 align-top">
                  <PriceCell cell={row.bestWholesale} />
                </td>
                <td className="px-3 py-3 align-top">
                  <PriceCell cell={row.bestRetail} />
                </td>
                <td className="px-3 py-3 align-top">
                  <PriceCell cell={row.bestOverall} />
                </td>
                <td className="px-3 py-3 align-top">
                  <GapCell value={row.gapVsAguiarPercent} tone={row.recommendation.tone} />
                </td>
                <td className="px-3 py-3 align-top">
                  {row.winningChannel ? <ChannelChip channel={row.winningChannel} /> : "-"}
                </td>
                <td className="px-3 py-3 align-top font-medium text-[#17202a]">
                  {row.winningSourceName ?? "-"}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="font-semibold text-[#17202a]">{row.confidenceScore}</div>
                  <div className="text-[11px] text-[#667789]">
                    {formatMatchQualityLabel(row.matchQuality)}
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <span className={recommendationChipClassName(row.recommendation.tone)}>
                    {row.recommendation.label}
                  </span>
                  {row.recommendation.targetPrice ? (
                    <div className="mt-1 text-[11px] font-medium text-[#526170]">
                      Objetivo {currencyFormatter.format(row.recommendation.targetPrice)}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(row.id)}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-[#d9dee7] bg-white px-2.5 text-xs font-semibold text-[#153d7b] transition hover:border-[#153d7b] hover:bg-[#f5f8ff]"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 xl:hidden">
        {rows.map((row) => (
          <article
            key={`mobile-${row.id}`}
            className={`rounded-md border border-[#d9dee7] p-3 ${rowToneClassName(row.recommendation.tone)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="line-clamp-2 text-sm font-bold leading-5 text-[#17202a]">
                  {row.clusterName}
                </h4>
                <div className="mt-1 text-xs text-[#667789]">
                  {row.brand} · {row.presentationLabel}
                </div>
              </div>
              <span className={recommendationChipClassName(row.recommendation.tone)}>
                {row.recommendation.label}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MobileMetric label="Aguiar" value={formatCellPrice(row.aguiarPrice)} />
              <MobileMetric label="Mayorista" value={formatCellPrice(row.bestWholesale)} />
              <MobileMetric label="Minorista" value={formatCellPrice(row.bestRetail)} />
              <MobileMetric
                label="Dif. vs mercado"
                value={
                  row.gapVsAguiarPercent === null
                    ? "-"
                    : `${percentFormatter.format(row.gapVsAguiarPercent)}%`
                }
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {row.winningChannel ? <ChannelChip channel={row.winningChannel} /> : null}
              <span className="text-xs font-medium text-[#526170]">
                {row.winningSourceName ?? "Sin ganador"}
              </span>
              {row.hasPromo ? <PromoChip /> : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenDetail(row.id)}
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border border-[#d9dee7] bg-white text-sm font-semibold text-[#153d7b]"
            >
              Ver detalle
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function PriceCell({ cell }: { cell: CategoryDecisionRow["bestOverall"] }) {
  if (!cell) {
    return <span className="text-[#9aa5b1]">-</span>;
  }

  return (
    <div>
      <div className="font-bold text-[#17202a]">{currencyFormatter.format(cell.price)}</div>
      <div className="mt-0.5 line-clamp-1 text-[11px] text-[#667789]">
        {cell.sourceName}
      </div>
      {cell.hasPromo ? <div className="mt-1"><PromoChip /></div> : null}
    </div>
  );
}

function GapCell({ value, tone }: { value: number | null; tone: PricingTone }) {
  if (value === null) {
    return <span className="text-[#9aa5b1]">-</span>;
  }

  return (
    <span className={gapClassName(tone)}>
      {value > 0 ? "+" : ""}
      {percentFormatter.format(value)}%
    </span>
  );
}

function ChannelChip({ channel }: { channel: CategoryDecisionRow["winningChannel"] }) {
  if (!channel) {
    return null;
  }

  const label = channel === "own" ? "Propio" : channel === "mayorista" ? "Mayorista" : "Minorista";
  const className =
    channel === "own"
      ? "bg-[#edf3ff] text-[#153d7b]"
      : channel === "mayorista"
        ? "bg-[#eaf7ef] text-[#16613c]"
        : "bg-[#fff4e8] text-[#8a4b12]";

  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-bold ${className}`}>
      {label}
    </span>
  );
}

function PromoChip() {
  return (
    <span className="inline-flex rounded bg-[#eaf2ff] px-2 py-0.5 text-[11px] font-bold text-[#153d7b]">
      Promo detectada
    </span>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/70 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#667789]">
        {label}
      </div>
      <div className="mt-1 font-bold text-[#17202a]">{value}</div>
    </div>
  );
}

function formatCellPrice(cell: CategoryDecisionRow["bestOverall"]) {
  return cell ? currencyFormatter.format(cell.price) : "-";
}

function rowToneClassName(tone: PricingTone) {
  if (tone === "danger") {
    return "bg-[#fff4f2]";
  }

  if (tone === "warning") {
    return "bg-[#fff8e8]";
  }

  if (tone === "info") {
    return "bg-[#f1f7ff]";
  }

  if (tone === "success") {
    return "bg-[#f4fbf7]";
  }

  return "bg-white";
}

function recommendationChipClassName(tone: PricingTone) {
  const base = "inline-flex rounded px-2 py-1 text-[11px] font-bold";

  if (tone === "danger") {
    return `${base} bg-[#fee2dc] text-[#9b2f1c]`;
  }

  if (tone === "warning") {
    return `${base} bg-[#fff0c2] text-[#73510b]`;
  }

  if (tone === "info") {
    return `${base} bg-[#dbeafe] text-[#153d7b]`;
  }

  if (tone === "success") {
    return `${base} bg-[#dff5e8] text-[#16613c]`;
  }

  return `${base} bg-[#edf1f5] text-[#526170]`;
}

function gapClassName(tone: PricingTone) {
  const base = "inline-flex rounded px-2 py-1 text-xs font-bold";

  if (tone === "danger") {
    return `${base} bg-[#fee2dc] text-[#9b2f1c]`;
  }

  if (tone === "warning") {
    return `${base} bg-[#fff0c2] text-[#73510b]`;
  }

  if (tone === "info") {
    return `${base} bg-[#dbeafe] text-[#153d7b]`;
  }

  return `${base} bg-[#dff5e8] text-[#16613c]`;
}

function alertChipClassName(severity: "critical" | "warning" | "info") {
  const base = "inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold";

  if (severity === "critical") {
    return `${base} bg-[#fee2dc] text-[#9b2f1c]`;
  }

  if (severity === "warning") {
    return `${base} bg-[#fff0c2] text-[#73510b]`;
  }

  return `${base} bg-[#dbeafe] text-[#153d7b]`;
}
