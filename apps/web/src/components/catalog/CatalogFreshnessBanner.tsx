import { Clock3, Database, RefreshCw } from "lucide-react";
import {
  getCatalogFreshness,
  type CatalogFreshnessTone,
} from "@/lib/catalog-freshness";
import type { CatalogMetadata } from "@/types/search";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function CatalogFreshnessBanner({
  catalog,
  compact = false,
}: {
  catalog: CatalogMetadata;
  compact?: boolean;
}) {
  const freshness = getCatalogFreshness(catalog);
  const syncedAt = catalog.lastSyncedAt
    ? new Date(catalog.lastSyncedAt)
    : null;
  const Icon = catalog.status === "syncing" ? RefreshCw : Database;

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${toneClassName(freshness.tone)}`}
      role={freshness.tone === "danger" ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon
          aria-hidden="true"
          className={`mt-0.5 h-4 w-4 shrink-0 ${catalog.status === "syncing" ? "animate-spin" : ""}`}
        />
        <div className="min-w-0">
          <div className="text-sm font-bold">{freshness.label}</div>
          {!compact ? (
            <div className="mt-0.5 text-xs leading-5 opacity-85">
              {freshness.detail}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs font-semibold opacity-85">
        <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
        {syncedAt && !Number.isNaN(syncedAt.getTime())
          ? `Último dato válido: ${dateFormatter.format(syncedAt)}`
          : "Sin fecha válida"}
      </div>
    </div>
  );
}

function toneClassName(tone: CatalogFreshnessTone) {
  const classes: Record<CatalogFreshnessTone, string> = {
    success: "border-[#bfe5cf] bg-[#f4fbf7] text-[#16613c]",
    warning: "border-[#f0d2a2] bg-[#fff8e8] text-[#7a4b08]",
    danger: "border-[#e4a79f] bg-[#fff1ef] text-[#8f2d20]",
    info: "border-[#bed4f4] bg-[#f5f8ff] text-[#153d7b]",
  };

  return classes[tone];
}
