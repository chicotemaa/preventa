export const PRICE_FRESH_HOURS = 36;
export const PRICE_STALE_HOURS = 72;

export function getPriceFreshness(observedAt?: string | null, now = Date.now()) {
  const timestamp = Date.parse(observedAt ?? "");
  // A future date is not evidence of a current price (allow small clock skew).
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000) {
    return { status: "unknown" as const, label: "Sin fecha verificable", ageHours: null };
  }
  const ageHours = Math.max(0, now - timestamp) / 3_600_000;
  if (ageHours <= PRICE_FRESH_HOURS) {
    return { status: "fresh" as const, label: "Vigente", ageHours };
  }
  return ageHours <= PRICE_STALE_HOURS
    ? { status: "aging" as const, label: "Actualizar precio", ageHours }
    : { status: "stale" as const, label: "Precio desactualizado", ageHours };
}

export function isPriceFresh(observedAt?: string | null, now = Date.now()) {
  return getPriceFreshness(observedAt, now).status === "fresh";
}

export function formatPriceObservation(observedAt?: string | null) {
  const date = new Date(observedAt ?? "");
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Cordoba",
      }).format(date)
    : "Sin fecha";
}
