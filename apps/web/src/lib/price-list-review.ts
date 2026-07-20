import {
  analyzeHistoryItem,
  type HistoryItemAnalysis,
} from "./price-list-history-analysis";
import {
  buildInputFingerprint,
  buildProductFingerprint,
} from "./match-overrides";
import type {
  PriceListRejectedCandidate,
  PriceListRunDetail,
  PriceListRunItem,
  PriceListSourcePrice,
  ProductMatchOverride,
} from "@/types/search";

export type PricingReviewFilter =
  | "attention"
  | "above_wholesale"
  | "competitive"
  | "opportunity"
  | "missing_own"
  | "without_wholesale"
  | "weak_match"
  | "weekly_change"
  | "all";

export type PricingReviewItem = {
  analysis: HistoryItemAnalysis;
  previousOwnPrice: number | null;
  weeklyVariationRatio: number | null;
  hasStrongWeeklyVariation: boolean;
};

export type MatchReviewCandidate = {
  key: string;
  item: PriceListRunItem;
  sourceId: string;
  storeName: string;
  productName: string;
  productUrl: string | null;
  confidenceScore: number;
  origin: "accepted" | "rejected";
  reason: string;
  overrideStatus: "confirmed" | "rejected" | null;
};

export type PricingReviewSummary = {
  total: number;
  attention: number;
  aboveWholesale: number;
  competitive: number;
  opportunities: number;
  missingOwn: number;
  withoutWholesale: number;
  weakMatch: number;
  weeklyChanges: number;
};

export type PricingReviewDashboard = {
  items: PricingReviewItem[];
  summary: PricingReviewSummary;
  equivalences: MatchReviewCandidate[];
};

export function buildPricingReviewDashboard(
  current: PriceListRunDetail,
  previous: PriceListRunDetail | null,
  overrides: ProductMatchOverride[],
): PricingReviewDashboard {
  const previousByIdentity = buildPreviousItemMap(previous?.items ?? []);
  const items = current.items.map((item) => {
    const analysis = analyzeHistoryItem(item);
    const previousItem = findPreviousItem(item, previousByIdentity);
    const currentOwnPrice = analysis.selectedOwnPrice;
    const previousOwnPrice = getSelectedOwnPrice(previousItem);
    const weeklyVariationRatio = calculateVariation(
      currentOwnPrice,
      previousOwnPrice,
    );

    return {
      analysis,
      previousOwnPrice,
      weeklyVariationRatio,
      hasStrongWeeklyVariation:
        weeklyVariationRatio !== null && Math.abs(weeklyVariationRatio) >= 0.1,
    };
  });

  return {
    items: items.sort(compareReviewItems),
    summary: summarizeReviewItems(items),
    equivalences: buildMatchReviewCandidates(current.items, overrides),
  };
}

export function filterPricingReviewItems(
  items: PricingReviewItem[],
  filter: PricingReviewFilter,
  searchTerm = "",
) {
  const normalizedSearch = normalizeText(searchTerm);

  return items.filter((item) => {
    if (!matchesFilter(item, filter)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.analysis.item.description,
      item.analysis.item.code,
      item.analysis.item.ean13Di,
      item.analysis.item.ean13Bu,
      item.analysis.item.rubro,
    ]
      .filter(Boolean)
      .some((value) => normalizeText(String(value)).includes(normalizedSearch));
  });
}

function summarizeReviewItems(items: PricingReviewItem[]): PricingReviewSummary {
  return {
    total: items.length,
    attention: items.filter(isAttentionItem).length,
    aboveWholesale: items.filter((item) =>
      ["above_wholesale_critical", "above_wholesale_warning"].includes(
        item.analysis.kind,
      ),
    ).length,
    competitive: items.filter((item) => item.analysis.kind === "competitive")
      .length,
    opportunities: items.filter(
      (item) => item.analysis.kind === "margin_opportunity",
    ).length,
    missingOwn: items.filter(
      (item) => item.analysis.kind === "missing_own_price",
    ).length,
    withoutWholesale: items.filter(
      (item) => !item.analysis.hasWholesaleReference,
    ).length,
    weakMatch: items.filter(isWeakMatch).length,
    weeklyChanges: items.filter((item) => item.hasStrongWeeklyVariation).length,
  };
}

function matchesFilter(item: PricingReviewItem, filter: PricingReviewFilter) {
  if (filter === "all") return true;
  if (filter === "attention") return isAttentionItem(item);
  if (filter === "above_wholesale") {
    return ["above_wholesale_critical", "above_wholesale_warning"].includes(
      item.analysis.kind,
    );
  }
  if (filter === "competitive") return item.analysis.kind === "competitive";
  if (filter === "opportunity") {
    return item.analysis.kind === "margin_opportunity";
  }
  if (filter === "missing_own") {
    return item.analysis.kind === "missing_own_price";
  }
  if (filter === "without_wholesale") {
    return !item.analysis.hasWholesaleReference;
  }
  if (filter === "weak_match") return isWeakMatch(item);
  return item.hasStrongWeeklyVariation;
}

function isAttentionItem(item: PricingReviewItem) {
  return (
    !["competitive", "margin_opportunity"].includes(item.analysis.kind) ||
    item.hasStrongWeeklyVariation
  );
}

function isWeakMatch(item: PricingReviewItem) {
  return (
    item.analysis.kind === "weak_match" ||
    (item.analysis.item.bestConfidenceScore !== null &&
      item.analysis.item.bestConfidenceScore < 70)
  );
}

function buildPreviousItemMap(items: PriceListRunItem[]) {
  const map = new Map<string, PriceListRunItem>();

  for (const item of items) {
    for (const key of getItemIdentityKeys(item)) {
      if (!map.has(key)) map.set(key, item);
    }
  }

  return map;
}

function findPreviousItem(
  item: PriceListRunItem,
  previousByIdentity: Map<string, PriceListRunItem>,
) {
  for (const key of getItemIdentityKeys(item)) {
    const previous = previousByIdentity.get(key);
    if (previous) return previous;
  }

  return null;
}

function getItemIdentityKeys(item: PriceListRunItem) {
  const keys = [
    cleanIdentifier(item.ean13Di) ? `ean:${cleanIdentifier(item.ean13Di)}` : null,
    cleanIdentifier(item.ean13Bu) ? `ean:${cleanIdentifier(item.ean13Bu)}` : null,
    cleanIdentifier(item.code) ? `code:${cleanIdentifier(item.code)}` : null,
    normalizeText(item.description ?? "")
      ? `text:${normalizeText(item.description ?? "")}`
      : null,
  ];

  return keys.filter((key): key is string => Boolean(key));
}

function getSelectedOwnPrice(item: PriceListRunItem | null) {
  return item?.ownPrice?.selectedPrice ?? item?.currentPrice ?? null;
}

function calculateVariation(current: number | null, previous: number | null) {
  if (!current || !previous) return null;
  return (current - previous) / previous;
}

function buildMatchReviewCandidates(
  items: PriceListRunItem[],
  overrides: ProductMatchOverride[],
) {
  const candidates = new Map<string, MatchReviewCandidate>();

  for (const item of items) {
    for (const sourcePrice of item.sourcePrices) {
      if (sourcePrice.confidenceScore >= 80) continue;
      addCandidate(candidates, item, sourcePrice, overrides);
    }

    for (const diagnostic of item.matchDiagnostics?.queryDiagnostics ?? []) {
      for (const rejected of diagnostic.topRejected) {
        addRejectedCandidate(candidates, item, rejected, overrides);
      }
    }
  }

  return Array.from(candidates.values()).sort((first, second) => {
    if (first.overrideStatus !== second.overrideStatus) {
      return first.overrideStatus === null ? -1 : 1;
    }
    return second.confidenceScore - first.confidenceScore;
  });
}

function addCandidate(
  candidates: Map<string, MatchReviewCandidate>,
  item: PriceListRunItem,
  candidate: PriceListSourcePrice,
  overrides: ProductMatchOverride[],
) {
  const base = buildCandidateBase(item, candidate, overrides);
  candidates.set(base.key, {
    ...base,
    confidenceScore: candidate.confidenceScore,
    origin: "accepted",
    reason: "Coincidencia aceptada automaticamente con confianza menor a 80%.",
  });
}

function addRejectedCandidate(
  candidates: Map<string, MatchReviewCandidate>,
  item: PriceListRunItem,
  candidate: PriceListRejectedCandidate,
  overrides: ProductMatchOverride[],
) {
  const base = buildCandidateBase(item, candidate, overrides);

  if (candidates.has(base.key)) return;

  candidates.set(base.key, {
    ...base,
    confidenceScore: candidate.finalScore,
    origin: "rejected",
    reason: getRejectReason(candidate.reason),
  });
}

function buildCandidateBase(
  item: PriceListRunItem,
  candidate: {
    sourceId: string;
    storeName: string;
    productName: string;
    productUrl?: string | null;
  },
  overrides: ProductMatchOverride[],
) {
  const inputFingerprint = buildInputFingerprint({
    rowNumber: item.rowNumber,
    description: item.description ?? undefined,
    rubro: item.rubro ?? undefined,
    code: item.code ?? undefined,
    ean13Di: item.ean13Di ?? undefined,
    ean13Bu: item.ean13Bu ?? undefined,
  });
  const productFingerprint = buildProductFingerprint(candidate);
  const override = overrides.find(
    (value) =>
      value.inputFingerprint === inputFingerprint &&
      value.sourceId === candidate.sourceId &&
      value.productFingerprint === productFingerprint,
  );

  return {
    key: `${inputFingerprint}|${candidate.sourceId}|${productFingerprint}`,
    item,
    sourceId: candidate.sourceId,
    storeName: candidate.storeName,
    productName: candidate.productName,
    productUrl: candidate.productUrl ?? null,
    overrideStatus: override?.status ?? null,
  };
}

function getRejectReason(reason: PriceListRejectedCandidate["reason"]) {
  const reasons: Record<PriceListRejectedCandidate["reason"], string> = {
    brand_mismatch: "La marca detectada no coincide.",
    score_below_threshold: "El nombre no alcanzo el puntaje minimo.",
    presentation_or_flavor_mismatch: "Presentacion o sabor no coinciden.",
    manual_rejected: "La equivalencia fue rechazada manualmente.",
    no_candidates: "La fuente no devolvio candidatos comparables.",
  };
  return reasons[reason];
}

function compareReviewItems(first: PricingReviewItem, second: PricingReviewItem) {
  const severity = (item: PricingReviewItem) => {
    if (item.analysis.kind === "above_wholesale_critical") return 0;
    if (item.analysis.kind === "missing_own_price") return 1;
    if (isWeakMatch(item)) return 2;
    if (item.hasStrongWeeklyVariation) return 3;
    if (item.analysis.kind === "above_wholesale_warning") return 4;
    if (item.analysis.kind === "margin_opportunity") return 5;
    return 6;
  };

  return severity(first) - severity(second);
}

function cleanIdentifier(value?: string | null) {
  return value?.replace(/\D/g, "") || value?.trim().toLowerCase() || "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
