export type CatalogSyncWindow = {
  totalTerms: number;
  offset: number;
  limit: number;
  nextOffset: number;
  complete: boolean;
};

type CatalogSyncWindowOptions = {
  maxTerms?: number;
  offset?: number;
};

export function buildCatalogSyncWindow(
  totalTerms: number,
  options: CatalogSyncWindowOptions = {},
): CatalogSyncWindow {
  const safeTotal = Math.max(0, Math.floor(totalTerms));

  if (safeTotal === 0) {
    return {
      totalTerms: 0,
      offset: 0,
      limit: 0,
      nextOffset: 0,
      complete: true,
    };
  }

  const requestedOffset = Math.max(0, Math.floor(options.offset ?? 0));
  const offset = requestedOffset % safeTotal;
  const requestedLimit = Math.max(
    1,
    Math.floor(options.maxTerms ?? safeTotal),
  );
  const limit = Math.min(requestedLimit, safeTotal - offset);
  const nextOffset = offset + limit >= safeTotal ? 0 : offset + limit;

  return {
    totalTerms: safeTotal,
    offset,
    limit,
    nextOffset,
    complete: offset === 0 && limit === safeTotal,
  };
}

export function withProcessedCatalogTerms(
  window: CatalogSyncWindow,
  processedTerms: number,
) {
  const safeProcessed = Math.max(
    0,
    Math.min(Math.floor(processedTerms), window.limit),
  );
  const reachedEnd = window.offset + safeProcessed >= window.totalTerms;

  return {
    totalTerms: window.totalTerms,
    offset: window.offset,
    processedTerms: safeProcessed,
    nextOffset: reachedEnd ? 0 : window.offset + safeProcessed,
    complete:
      window.totalTerms === 0 ||
      (window.offset === 0 && safeProcessed === window.totalTerms),
  };
}
