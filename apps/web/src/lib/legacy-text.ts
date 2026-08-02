import type { PriceListSourcePrice } from "@/types/search";

const MOJIBAKE_MARKER_PATTERN = /[\u0080-\u009f\u00c2\u00c3\ufffd]/g;

export function repairLegacyText(value: string): string;
export function repairLegacyText(value: string | null): string | null;
export function repairLegacyText(value: string | undefined): string | undefined;
export function repairLegacyText(
  value: string | null | undefined,
): string | null | undefined;
export function repairLegacyText(
  value: string | null | undefined,
): string | null | undefined {
  if (!value || !MOJIBAKE_MARKER_PATTERN.test(value)) {
    MOJIBAKE_MARKER_PATTERN.lastIndex = 0;
    return value;
  }

  MOJIBAKE_MARKER_PATTERN.lastIndex = 0;
  const codePoints = Array.from(value, (character) => character.codePointAt(0) ?? 0);

  if (codePoints.some((codePoint) => codePoint > 255)) {
    return value;
  }

  try {
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(codePoints),
    );

    return countMojibakeMarkers(repaired) < countMojibakeMarkers(value)
      ? repaired
      : value;
  } catch {
    return value;
  }
}

export function repairLegacySourcePrice(
  sourcePrice: PriceListSourcePrice,
): PriceListSourcePrice {
  return {
    ...sourcePrice,
    storeName: repairLegacyText(sourcePrice.storeName),
    productName: repairLegacyText(sourcePrice.productName),
    dataOrigin: repairLegacyText(sourcePrice.dataOrigin),
    sourceScope: repairLegacyText(sourcePrice.sourceScope),
    priceCondition: repairLegacyText(sourcePrice.priceCondition),
    packageLabel: repairLegacyText(sourcePrice.packageLabel),
    category: repairLegacyText(sourcePrice.category),
  };
}

function countMojibakeMarkers(value: string) {
  MOJIBAKE_MARKER_PATTERN.lastIndex = 0;
  const count = value.match(MOJIBAKE_MARKER_PATTERN)?.length ?? 0;
  MOJIBAKE_MARKER_PATTERN.lastIndex = 0;
  return count;
}
