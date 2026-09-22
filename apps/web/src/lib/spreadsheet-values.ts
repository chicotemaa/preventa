export function parseSpreadsheetAmount(
  value: string | number | null | undefined,
) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  const cleaned = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/(?!^)-/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") {
    return undefined;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const commaCount = countOccurrences(cleaned, ",");
  const dotCount = countOccurrences(cleaned, ".");
  const commaDecimals = cleaned.length - lastComma - 1;
  const dotDecimals = cleaned.length - lastDot - 1;
  const decimalSeparator =
    lastComma > lastDot &&
    (lastDot >= 0 || (commaCount === 1 && commaDecimals !== 3))
      ? ","
      : lastDot > lastComma &&
          (lastComma >= 0 || (dotCount === 1 && dotDecimals !== 3))
        ? "."
        : null;
  let normalized = cleaned;

  if (decimalSeparator === ",") {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (decimalSeparator === ".") {
    normalized = cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned.replace(/[.,]/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}
