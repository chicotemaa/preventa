import { parseSpreadsheetAmount } from "./spreadsheet-values";

export type BusinessActivity = {
  unitsSold?: number;
  periodDays?: number;
  salesThrough?: string;
  stockUnits?: number;
  stockAsOf?: string;
};
const DAY = 86_400_000;

export function parseBusinessActivity(value: unknown): BusinessActivity | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const result: BusinessActivity = {};
  for (const key of ["unitsSold", "periodDays", "stockUnits"] as const) {
    if (input[key] === undefined || input[key] === null) continue;
    const n = input[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e9) return null;
    if (key === "periodDays" && (!Number.isInteger(n) || n < 1 || n > 366)) return null;
    result[key] = n;
  }
  for (const key of ["salesThrough", "stockAsOf"] as const) {
    if (input[key] === undefined || input[key] === null) continue;
    if (typeof input[key] !== "string" || !isIsoDate(input[key])) return null;
    result[key] = input[key];
  }
  return Object.keys(result).length ? result : null;
}

export function activityDateIsRecent(value: string | undefined, maxDays: number, now: number) {
  if (!value || !isIsoDate(value)) return false;
  const age = (now - Date.parse(value + "T00:00:00Z")) / DAY;
  return age >= 0 && age <= maxDays;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

function spreadsheetDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && value > 0 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * DAY).toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const local = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const date = local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : raw;
  if (!isIsoDate(date)) throw new Error("Fecha de ventas/stock invalida. Usar AAAA-MM-DD o DD/MM/AAAA.");
  return date;
}

export function readBusinessActivityColumns(headers: string[], row: unknown[]): BusinessActivity | undefined {
  const cell = (name: string) => row[headers.indexOf(name)];
  const quantity = (name: string) => {
    const raw = cell(name);
    if (raw === undefined || raw === null || raw === "") return undefined;
    if (raw === 0 || (typeof raw === "string" && /^0+([.,]0+)?$/.test(raw.trim()))) return 0;
    if (typeof raw !== "number" && (typeof raw !== "string" || !/^[\d\s.,]+$/.test(raw))) {
      throw new Error(`Cantidad invalida en ${name}.`);
    }
    const value = parseSpreadsheetAmount(raw);
    if (value === undefined || value < 0) throw new Error(`Valor invalido en ${name}. Usar cantidades en unidades, no bultos.`);
    return value;
  };
  const values = { unitsSold: quantity("unidades vendidas"), periodDays: quantity("dias del periodo"),
    salesThrough: spreadsheetDate(cell("ventas hasta")), stockUnits: quantity("stock unidades"),
    stockAsOf: spreadsheetDate(cell("fecha stock")) };
  const parsed = parseBusinessActivity(values);
  if (!parsed && Object.values(values).some((value) => value !== undefined)) throw new Error("Ventas/stock invalidos: el periodo debe tener entre 1 y 366 dias.");
  return parsed ?? undefined;
}
