import { formatPriceObservation, getPriceFreshness } from "@/lib/price-freshness";

export function PriceFreshnessLabel({ observedAt }: { observedAt?: string | null }) {
  const freshness = getPriceFreshness(observedAt);
  return (
    <span className={`block text-xs leading-5 ${freshness.status === "fresh" ? "text-emerald-800" : "text-amber-800"}`}>
      {freshness.label}{freshness.status !== "unknown" ? ` · Consultado ${formatPriceObservation(observedAt)}` : ""}
    </span>
  );
}
