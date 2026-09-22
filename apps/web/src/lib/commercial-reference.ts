import type { PriceListItemResult, PriceListRunDetail, ProductSearchResult } from "@/types/search";
import { buildHistoryItemResult } from "./price-list-history-analysis";
import { getSourceChannel } from "./source-priority";

export type CommercialReference = {
  ambiguousMatches?: number;
  enabled: boolean;
  runId: string | null;
  listName: string | null;
  evaluatedAt: string | null;
  results: PriceListItemResult[];
  errorMessage?: string;
};

export function toCommercialReference(detail: PriceListRunDetail): CommercialReference {
  return { enabled: true, runId: detail.run.id, listName: detail.run.listName,
    evaluatedAt: detail.run.searchedAt, results: detail.items.map(buildHistoryItemResult) };
}

// Only exact unit EAN or provider SKU. No fuzzy name match or case/unit GTIN conversion.
export type ReferenceProductIdentity = Pick<ProductSearchResult, "sourceId" | "storeName" | "storeType" | "sku" | "barcodes">;

export function selectCommercialReference(products: ReferenceProductIdentity[], reference: CommercialReference) {
  const byEan = new Map<string, Set<number>>();
  const byCode = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, key: string, index: number) => {
    if (key) map.set(key, new Set([...(map.get(key) ?? []), index]));
  };
  reference.results.forEach((row, index) => {
    add(byEan, identifier(row.input.ean13Di), index);
    add(byCode, identifier(row.input.code), index);
  });
  const selected = new Set<number>();
  let ambiguous = 0;
  for (const product of products) {
    const candidates = new Set<number>();
    for (const ean of product.barcodes ?? []) {
      for (const index of byEan.get(identifier(ean)) ?? []) candidates.add(index);
    }
    if (getSourceChannel(product) === "own") {
      for (const index of byCode.get(identifier(product.sku).replace(/^ARC-/, "")) ?? []) candidates.add(index);
    }
    if (candidates.size === 1) selected.add([...candidates][0]);
    else if (candidates.size > 1) ambiguous++;
  }
  return { results: [...selected].sort((a, b) => a - b).map(index => reference.results[index]), ambiguous };
}

function identifier(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}
