import type { Browser } from "playwright";
import {
  extractProductsFromCucherSupabase,
  extractProductsFromLaAnonimaHtml,
  extractProductsFromStaticHtml,
  extractProductsFromVtexApi,
  extractProductsFromWooCommercePmwJson,
} from "./api-extractors.js";
import { launchBrowser } from "./browser.js";
import { extractProductsFromCarrefourComerciante } from "./carrefour-comerciante.js";
import { extractProductsFromCarrefourAuth } from "./carrefour.js";
import { config } from "./config.js";
import {
  extractProductsAutomatically,
  extractProductsFromTextLines,
  extractProductsWithSelectors,
} from "./extractors.js";
import { extractProductsFromMaxiconsumoAuth } from "./maxiconsumo.js";
import { normalizeQuery } from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import { compareSourcePriority } from "./source-priority.js";
import { scrapingSources } from "./sources/argentina.js";
import { productIsInStock } from "./stock.js";
import { extractProductsFromTokin } from "./tokin.js";
import { extractProductsFromVeaAuth } from "./vea.js";
import { extractProductsFromYaguarAuth } from "./yaguar.js";
import { getComparisonPrice } from "./unit-pricing.js";
import type {
  ProductSearchResult,
  ScrapingSource,
  SearchResponse,
  SearchSourceResult,
  SourceSearchStatus,
} from "./types.js";
import { buildSearchUrl } from "./url.js";

type SearchSourceOptions = {
  filterByConfidence?: boolean;
  limitResults?: boolean;
};

const AGUIAR_TOKIN_SOURCE_ID = "aguiar-arcor-resistencia";

export async function runLiveSearch(query: string): Promise<SearchResponse> {
  const startedAt = Date.now();
  const normalizedQuery = normalizeQuery(query);
  const activeSources = getActiveSources();
  const apiLikeSources = activeSources.filter((source) => !sourceNeedsBrowser(source));
  const browserSources = activeSources
    .filter(sourceNeedsBrowser)
    .sort(compareBrowserSourcePriority);
  const apiLikeSourceResults = await Promise.all(
    apiLikeSources.map((source) => searchSource(source, query)),
  );
  const browserSourceResults: SearchSourceResult[] = [];

  for (const source of browserSources) {
    browserSourceResults.push(await searchSource(source, query));
  }

  const sourceResults = [...apiLikeSourceResults, ...browserSourceResults];
  const sources = sourceResults.map((result) => result.status);
  const results = dedupeResults(
    sourceResults
      .flatMap((result) => result.results)
      .filter(
        (result) => result.confidenceScore >= config.minConfidenceScore,
      ),
  ).sort(compareLiveSearchResults);

  return {
    query,
    normalizedQuery,
    searchedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    results,
    sources,
  };
}

export function getActiveSources() {
  return scrapingSources.filter((source) => source.enabled !== false);
}

export function sourceNeedsBrowser(source: ScrapingSource) {
  return ![
    "carrefour_vtex_auth",
    "maxiconsumo_auth",
    "laanonima_html",
    "tokin",
    "vea_vtex_auth",
    "vtex_api",
    "static_html",
    "woocommerce_pmw_json",
    "cucher_supabase",
  ].includes(source.sourceKind ?? "playwright");
}

function compareLiveSearchResults(
  first: ProductSearchResult,
  second: ProductSearchResult,
) {
  const firstIsTokin = first.sourceId === AGUIAR_TOKIN_SOURCE_ID;
  const secondIsTokin = second.sourceId === AGUIAR_TOKIN_SOURCE_ID;

  if (firstIsTokin !== secondIsTokin) {
    return firstIsTokin ? -1 : 1;
  }

  const sourcePriority = compareSourcePriority(first, second);

  if (sourcePriority !== 0) {
    return sourcePriority;
  }

  return getComparisonPrice(first) - getComparisonPrice(second);
}

function compareBrowserSourcePriority(first: ScrapingSource, second: ScrapingSource) {
  return getBrowserSourcePriority(first) - getBrowserSourcePriority(second);
}

function getBrowserSourcePriority(source: ScrapingSource) {
  if (source.sourceKind === "tokin") {
    return 0;
  }

  if (source.sourceKind === "maxiconsumo_auth") {
    return 1;
  }

  return 2;
}

export async function searchSource(
  source: ScrapingSource,
  query: string,
  browser?: Browser,
  options: SearchSourceOptions = {},
): Promise<SearchSourceResult> {
  const startedAt = Date.now();

  if (source.enabled === false) {
    return {
      results: [],
      status: buildStatus(
        source,
        "failed",
        0,
        startedAt,
        source.disabledReason ?? "Fuente deshabilitada.",
      ),
    };
  }

  if (source.sourceKind === "vtex_api") {
    return withTimeout(
      runApiSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "carrefour_vtex_auth") {
    return withTimeout(
      runCarrefourVtexAuthSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "carrefour_comerciante") {
    return withTimeout(
      runCarrefourComercianteSourceSearch(source, query, startedAt, options),
      config.carrefourComerciante.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "vea_vtex_auth") {
    return withTimeout(
      runVeaVtexAuthSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "laanonima_html") {
    return withTimeout(
      runLaAnonimaHtmlSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "static_html") {
    return withTimeout(
      runStaticHtmlSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "woocommerce_pmw_json") {
    return withTimeout(
      runWooCommercePmwJsonSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "cucher_supabase") {
    return withTimeout(
      runCucherSupabaseSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "tokin") {
    return withTimeout(
      runTokinSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "maxiconsumo_auth") {
    return withTimeout(
      runMaxiconsumoAuthSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  if (source.sourceKind === "yaguar_auth") {
    return withTimeout(
      runYaguarAuthSourceSearch(source, query, startedAt, options),
      config.sourceTimeoutMs,
    ).catch((error) => {
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");

      return {
        results: [],
        status: buildStatus(
          source,
          isTimeout ? "timeout" : "failed",
          0,
          startedAt,
          error instanceof Error ? error.message : "Error desconocido",
        ),
      };
    });
  }

  const ownedBrowser = browser ?? (await launchBrowser());
  const page = await ownedBrowser.newPage();
  page.setDefaultTimeout(config.sourceTimeoutMs);

  try {
    return await withTimeout(
      runSourceSearch(page, source, query, startedAt, options),
      config.sourceTimeoutMs,
    );
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      error.message.toLowerCase().includes("timeout");

    return {
      results: [],
      status: buildStatus(
        source,
        isTimeout ? "timeout" : "failed",
        0,
        startedAt,
        error instanceof Error ? error.message : "Error desconocido",
      ),
    };
  } finally {
    await page.close().catch(() => undefined);

    if (!browser) {
      await ownedBrowser.close().catch(() => undefined);
    }
  }
}

async function runStaticHtmlSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const rawResults = await extractProductsFromStaticHtml(url, source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runApiSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const rawResults = await extractProductsFromVtexApi(url, source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runVeaVtexAuthSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromVeaAuth(source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runCarrefourVtexAuthSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromCarrefourAuth(source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runCarrefourComercianteSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromCarrefourComerciante(source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runLaAnonimaHtmlSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const rawResults = await extractProductsFromLaAnonimaHtml(url, source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runWooCommercePmwJsonSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const rawResults = await extractProductsFromWooCommercePmwJson(url, source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runCucherSupabaseSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const rawResults = await extractProductsFromCucherSupabase(url, source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runTokinSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromTokin(source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runMaxiconsumoAuthSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromMaxiconsumoAuth(source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

async function runYaguarAuthSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromYaguarAuth(source, query);
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;
  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
      results.length > 0
        ? undefined
        : "Yaguar fue consultado con las credenciales configuradas, pero no devolvio productos para esta busqueda.",
    ),
  };
}

async function runSourceSearch(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.sourceTimeoutMs,
  });

  if (source.requiresJavascript) {
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {
      return undefined;
    });
  }

  const extractedResults =
    source.sourceKind === "text_lines"
      ? []
      : source.selectors
        ? await extractProductsWithSelectors(page, source, query)
        : await extractProductsAutomatically(page, source, query);
  const textLineResults =
    source.sourceKind === "text_lines" || extractedResults.length === 0
      ? await extractProductsFromTextLines(page, source, query)
      : [];
  const rawResults = [...extractedResults, ...textLineResults];
  const shouldFilterByConfidence = options.filterByConfidence ?? true;
  const shouldLimitResults = options.limitResults ?? true;

  const dedupedResults = dedupeResults(
    rawResults.filter((result) =>
      shouldFilterByConfidence
        ? result.confidenceScore >= config.minConfidenceScore
        : true,
    ),
  );
  const results = shouldLimitResults
    ? dedupedResults.slice(0, config.maxResultsPerSource)
    : dedupedResults;

  return {
    results,
    status: buildStatus(
      source,
      results.length > 0 ? "success" : "no_results",
      results.length,
      startedAt,
    ),
  };
}

function buildStatus(
  source: ScrapingSource,
  status: SourceSearchStatus["status"],
  resultsCount: number,
  startedAt: number,
  errorMessage?: string,
): SourceSearchStatus {
  return {
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    status,
    resultsCount,
    errorMessage,
    durationMs: Date.now() - startedAt,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() =>
    clearTimeout(timeout),
  );
}

function dedupeResults(results: ProductSearchResult[]) {
  const seen = new Set<string>();
  const deduped: ProductSearchResult[] = [];

  for (const result of results) {
    if (!productIsInStock(result)) {
      continue;
    }

    const key = [
      result.sourceId,
      result.normalizedName,
      result.price.toFixed(2),
      getComparisonPrice(result).toFixed(2),
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(result);
    }
  }

  return deduped;
}
