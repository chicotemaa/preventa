import { chromium, type Browser } from "playwright";
import {
  extractProductsFromRedNorteApi,
  extractProductsFromStaticHtml,
  extractProductsFromVtexApi,
  extractProductsFromWooCommercePmwJson,
} from "./api-extractors.js";
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
import { scrapingSources } from "./sources/argentina.js";
import { extractProductsFromTokin } from "./tokin.js";
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

export async function runLiveSearch(query: string): Promise<SearchResponse> {
  const startedAt = Date.now();
  const normalizedQuery = normalizeQuery(query);
  const activeSources = getActiveSources();
  const needsBrowser = activeSources.some(
    (source) =>
      ![
        "rednorte_api",
        "vtex_api",
        "static_html",
        "woocommerce_pmw_json",
      ].includes(
        source.sourceKind ?? "playwright",
      ),
  );
  const browser = needsBrowser
    ? await chromium.launch({ headless: config.headless })
    : undefined;

  try {
    const sourceResults = await Promise.all(
      activeSources.map((source) => searchSource(source, query, browser)),
    );

    const sources = sourceResults.map((result) => result.status);
    const results = dedupeResults(
      sourceResults
        .flatMap((result) => result.results)
        .filter(
          (result) => result.confidenceScore >= config.minConfidenceScore,
        ),
    ).sort((first, second) => first.price - second.price);

    return {
      query,
      normalizedQuery,
      searchedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      results,
      sources,
    };
  } finally {
    await browser?.close();
  }
}

export function getActiveSources() {
  return scrapingSources.filter((source) => source.enabled !== false);
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

  if (source.sourceKind === "rednorte_api") {
    return withTimeout(
      runRedNorteApiSourceSearch(source, query, startedAt, options),
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

  if (source.sourceKind === "tokin") {
    const ownedBrowser =
      browser ?? (await chromium.launch({ headless: config.headless }));

    try {
      return await withTimeout(
        runTokinSourceSearch(ownedBrowser, source, query, startedAt, options),
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
      if (!browser) {
        await ownedBrowser.close().catch(() => undefined);
      }
    }
  }

  if (source.sourceKind === "maxiconsumo_auth") {
    const ownedBrowser =
      browser ?? (await chromium.launch({ headless: config.headless }));

    try {
      return await withTimeout(
        runMaxiconsumoAuthSourceSearch(
          ownedBrowser,
          source,
          query,
          startedAt,
          options,
        ),
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
      if (!browser) {
        await ownedBrowser.close().catch(() => undefined);
      }
    }
  }

  const ownedBrowser =
    browser ?? (await chromium.launch({ headless: config.headless }));
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

async function runRedNorteApiSourceSearch(
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const url = buildSearchUrl(source.searchUrlTemplate, query);
  const rawResults = await extractProductsFromRedNorteApi(url, source, query);
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

async function runTokinSourceSearch(
  browser: Browser,
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromTokin(browser, source, query);
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
  browser: Browser,
  source: ScrapingSource,
  query: string,
  startedAt: number,
  options: SearchSourceOptions,
): Promise<SearchSourceResult> {
  const rawResults = await extractProductsFromMaxiconsumoAuth(
    browser,
    source,
    query,
  );
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
    const key = [
      result.sourceId,
      result.normalizedName,
      result.price.toFixed(2),
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(result);
    }
  }

  return deduped;
}
