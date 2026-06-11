import type {
  CategorySearchGroup,
  ProductSearchResult,
  SourceSearchStatus,
} from "@/types/search";
import {
  compareSourcePriority,
  getSourceChannel,
  getSourceConfig,
  getSourceDisplayName,
  sourceHasData,
  sourcePriorityConfig,
  type ExpectedSourceStatus,
  type SourceChannel,
  type SourcePriorityConfig,
} from "@/lib/source-priority";

export type MatchQuality =
  | "match_exact"
  | "match_probable"
  | "match_weak"
  | "not_comparable";

export type PricingTone = "danger" | "warning" | "success" | "info" | "neutral";

export type PricingRecommendation = {
  kind:
    | "load_aguiar"
    | "insufficient_reference"
    | "compete"
    | "monitor"
    | "maintain"
    | "margin_opportunity"
    | "review_match"
    | "limited_coverage";
  label: string;
  reason: string;
  tone: PricingTone;
  targetPrice: number | null;
};

export type PricingAlert = {
  severity: "critical" | "warning" | "info";
  label: string;
  message: string;
};

export type CompetitorPriceCell = {
  product: ProductSearchResult;
  price: number;
  sourceId: string;
  sourceName: string;
  channel: SourceChannel;
  hasPromo: boolean;
};

export type SourceHealthItem = {
  sourceId: string;
  displayName: string;
  channel: SourceChannel;
  priority: number;
  criticalForDecision: boolean;
  primaryReference: boolean;
  expected: boolean;
  status: ExpectedSourceStatus;
  statusLabel: string;
  message: string;
  resultsCount: number;
  durationMs: number;
};

export type SourceHealthSummary = {
  items: SourceHealthItem[];
  total: number;
  withData: number;
  withoutData: number;
  pending: number;
  criticalMissing: SourceHealthItem[];
};

export type CategoryDecisionRow = {
  id: string;
  clusterName: string;
  brand: string;
  presentationLabel: string;
  categoryName: string;
  aguiarPrice: CompetitorPriceCell | null;
  bestWholesale: CompetitorPriceCell | null;
  bestRetail: CompetitorPriceCell | null;
  bestOverall: CompetitorPriceCell | null;
  averageWholesalePrice: number | null;
  averageRetailPrice: number | null;
  gapVsAguiarPercent: number | null;
  gapVsBestOverallPercent: number | null;
  winningChannel: SourceChannel | null;
  winningSourceName: string | null;
  confidenceScore: number;
  matchQuality: MatchQuality;
  sourcesWithPrice: number;
  hasPromo: boolean;
  recommendation: PricingRecommendation;
  alerts: PricingAlert[];
  products: ProductSearchResult[];
};

export type CategoryPricingDashboard = {
  familyName: string;
  searchedAt: string;
  totalProducts: number;
  aguiarProductsCount: number;
  competitorProductsCount: number;
  sourceHealth: SourceHealthSummary;
  rows: CategoryDecisionRow[];
  bestWholesalePrice: CompetitorPriceCell | null;
  bestRetailPrice: CompetitorPriceCell | null;
  bestOverallPrice: CompetitorPriceCell | null;
  averageGapVsAguiarPercent: number | null;
  criticalAlertsCount: number;
  recommendation: PricingRecommendation;
};

export type CategoryDecisionFilter =
  | "all"
  | "mayoristas"
  | "minoristas"
  | "alerts"
  | "critical_gap"
  | "opportunities"
  | "missing_aguiar"
  | "weak_match"
  | "sources_with_data";

export type CategoryDecisionSort =
  | "gap_desc"
  | "wholesale_price"
  | "retail_price"
  | "confidence_desc"
  | "winning_source"
  | "brand"
  | "presentation";

export function buildCategoryPricingDashboard({
  group,
  sources,
  searchedAt,
}: {
  group: CategorySearchGroup;
  sources: SourceSearchStatus[];
  searchedAt: string;
}): CategoryPricingDashboard {
  const products = [...group.tokinProducts, ...group.competitorProducts];
  const sourceHealth = buildSourceHealthSummary(sources);
  const criticalMissing = sourceHealth.criticalMissing;
  const rows = buildDecisionRows(products, group.categoryName, criticalMissing);
  const gapValues = rows
    .map((row) => row.gapVsAguiarPercent)
    .filter((value): value is number => typeof value === "number");

  const bestWholesalePrice = findBestCell(rows.map((row) => row.bestWholesale));
  const bestRetailPrice = findBestCell(rows.map((row) => row.bestRetail));
  const bestOverallPrice = findBestCell(rows.map((row) => row.bestOverall));
  const criticalAlertsCount =
    rows.reduce(
      (count, row) =>
        count + row.alerts.filter((alert) => alert.severity === "critical").length,
      0,
    ) + criticalMissing.length;

  return {
    familyName: group.categoryName,
    searchedAt,
    totalProducts: group.totalProducts,
    aguiarProductsCount: group.tokinProducts.length,
    competitorProductsCount: group.competitorProducts.length,
    sourceHealth,
    rows,
    bestWholesalePrice,
    bestRetailPrice,
    bestOverallPrice,
    averageGapVsAguiarPercent: average(gapValues),
    criticalAlertsCount,
    recommendation: buildCategoryRecommendation(rows, sourceHealth),
  };
}

export function filterAndSortDecisionRows(
  rows: CategoryDecisionRow[],
  filter: CategoryDecisionFilter,
  sort: CategoryDecisionSort,
  searchTerm: string,
) {
  const normalizedSearchTerm = normalizeDecisionText(searchTerm);

  return rows
    .filter((row) => rowMatchesFilter(row, filter))
    .filter((row) => {
      if (!normalizedSearchTerm) {
        return true;
      }

      return normalizeDecisionText(
        [
          row.clusterName,
          row.brand,
          row.presentationLabel,
          row.winningSourceName,
          row.recommendation.label,
        ].join(" "),
      ).includes(normalizedSearchTerm);
    })
    .sort((first, second) => compareRows(first, second, sort));
}

export function formatMatchQualityLabel(quality: MatchQuality) {
  if (quality === "match_exact") {
    return "Exacto";
  }

  if (quality === "match_probable") {
    return "Probable";
  }

  if (quality === "match_weak") {
    return "Dudoso";
  }

  return "No comparable";
}

export function getComparablePrice(product: ProductSearchResult) {
  return normalizeNumber(product.comparisonPrice) ?? product.price;
}

function buildDecisionRows(
  products: ProductSearchResult[],
  categoryName: string,
  criticalMissing: SourceHealthItem[],
) {
  const clusters = new Map<string, ProductSearchResult[]>();

  for (const product of products) {
    const key = buildClusterKey(product, categoryName);
    clusters.set(key, [...(clusters.get(key) ?? []), product]);
  }

  return Array.from(clusters.entries())
    .map(([id, clusterProducts]) =>
      buildDecisionRow(id, categoryName, clusterProducts, criticalMissing),
    )
    .sort((first, second) => compareRows(first, second, "gap_desc"));
}

function buildDecisionRow(
  id: string,
  categoryName: string,
  products: ProductSearchResult[],
  criticalMissing: SourceHealthItem[],
): CategoryDecisionRow {
  const sortedProducts = [...products].sort(compareProductsForCluster);
  const aguiarPrice = findBestProductCell(
    sortedProducts.filter((product) => getSourceChannel(product) === "own"),
  );
  const wholesalePrices = sortedProducts.filter(
    (product) => getSourceChannel(product) === "mayorista",
  );
  const retailPrices = sortedProducts.filter(
    (product) => getSourceChannel(product) === "minorista",
  );
  const bestWholesale = findBestProductCell(wholesalePrices);
  const bestRetail = findBestProductCell(retailPrices);
  const bestMarket = findBestCell([bestWholesale, bestRetail]);
  const bestOverall = findBestCell([aguiarPrice, bestWholesale, bestRetail]);
  const confidenceScore = Math.round(average(products.map((product) => product.confidenceScore)) ?? 0);
  const matchQuality = determineMatchQuality(products, aguiarPrice, bestMarket);
  const gapVsAguiarPercent =
    aguiarPrice && bestMarket
      ? calculateGapPercent(aguiarPrice.price, bestMarket.price)
      : null;
  const rowBase = {
    id,
    clusterName: buildClusterName(sortedProducts),
    brand: buildBrandLabel(sortedProducts),
    presentationLabel: buildPresentationLabel(sortedProducts),
    categoryName,
    aguiarPrice,
    bestWholesale,
    bestRetail,
    bestOverall,
    averageWholesalePrice: average(wholesalePrices.map(getComparablePrice)),
    averageRetailPrice: average(retailPrices.map(getComparablePrice)),
    gapVsAguiarPercent,
    gapVsBestOverallPercent:
      aguiarPrice && bestOverall
        ? calculateGapPercent(aguiarPrice.price, bestOverall.price)
        : null,
    winningChannel: bestMarket?.channel ?? bestOverall?.channel ?? null,
    winningSourceName: bestMarket?.sourceName ?? bestOverall?.sourceName ?? null,
    confidenceScore,
    matchQuality,
    sourcesWithPrice: new Set(
      sortedProducts
        .filter((product) => getSourceChannel(product) !== "own")
        .map((product) => product.sourceId),
    ).size,
    hasPromo: sortedProducts.some(detectPromo),
    products: sortedProducts,
  };
  const alerts = buildAlerts(rowBase, criticalMissing);
  const recommendation = buildRowRecommendation(rowBase, alerts, criticalMissing);

  return {
    ...rowBase,
    alerts,
    recommendation,
  };
}

function buildSourceHealthSummary(sources: SourceSearchStatus[]): SourceHealthSummary {
  const usedSourceIds = new Set<string>();
  const items: SourceHealthItem[] = [];

  for (const config of sourcePriorityConfig.filter(
    (source) => source.expectedInDashboard,
  )) {
    const source = findSourceForConfig(sources, config);
    usedSourceIds.add(source?.sourceId ?? config.sourceId);
    items.push(buildSourceHealthItem(config, source));
  }

  for (const source of sources) {
    if (usedSourceIds.has(source.sourceId)) {
      continue;
    }

    items.push(buildSourceHealthItem(null, source));
  }

  const sortedItems = items.sort(compareSourceHealthItems);
  const withData = sortedItems.filter((item) => item.status === "ok").length;
  const pending = sortedItems.filter((item) =>
    ["pending", "requires_login", "not_configured", "no_public_prices"].includes(
      item.status,
    ),
  ).length;

  return {
    items: sortedItems,
    total: sortedItems.length,
    withData,
    withoutData: Math.max(0, sortedItems.length - withData),
    pending,
    criticalMissing: sortedItems.filter(
      (item) =>
        item.criticalForDecision &&
        item.channel === "mayorista" &&
        item.status !== "ok",
    ),
  };
}

function buildSourceHealthItem(
  config: SourcePriorityConfig | null,
  source: SourceSearchStatus | undefined,
): SourceHealthItem {
  const displayName =
    config?.displayName ?? (source ? getSourceDisplayName(source) : "Fuente");
  const channel = config?.channel ?? (source ? getSourceChannel(source) : "minorista");
  const status = classifySourceStatus(source, config);

  return {
    sourceId: source?.sourceId ?? config?.sourceId ?? displayName,
    displayName,
    channel,
    priority: config?.priority ?? 999,
    criticalForDecision: config?.criticalForDecision ?? false,
    primaryReference: config?.primaryReference ?? false,
    expected: Boolean(config?.expectedInDashboard),
    status,
    statusLabel: getSourceStatusLabel(status),
    message: buildSourceHealthMessage(status, source, config),
    resultsCount: source?.resultsCount ?? 0,
    durationMs: source?.durationMs ?? 0,
  };
}

function buildSourceHealthMessage(
  status: ExpectedSourceStatus,
  source: SourceSearchStatus | undefined,
  config: SourcePriorityConfig | null,
) {
  if (source && status === "ok") {
    if (config?.fallbackStatus === "requires_login") {
      return "Fuente consultada con credenciales configuradas.";
    }

    return config?.fallbackMessage ?? "Fuente consultada con datos.";
  }

  if (source && status === "sin_datos") {
    if (config?.sourceId === "yaguar-chaco-tienda-auth") {
      return "Yaguar acepto las credenciales, pero la tienda no expuso productos para esta busqueda. Revisar que la cuenta tenga catalogo/precios habilitados para Chaco o que no requiera seleccion adicional de sucursal.";
    }

    return "Fuente consultada, sin productos utiles para esta busqueda.";
  }

  if (source?.errorMessage) {
    return source.errorMessage;
  }

  return config?.fallbackMessage ?? getSourceStatusLabel(status);
}

function classifySourceStatus(
  source: SourceSearchStatus | undefined,
  config: SourcePriorityConfig | null,
): ExpectedSourceStatus {
  if (!source) {
    return config?.fallbackStatus ?? "pending";
  }

  if (sourceHasData(source)) {
    return "ok";
  }

  if (source.status === "timeout") {
    return "timeout";
  }

  if (source.status === "no_results" || source.status === "success") {
    return "sin_datos";
  }

  const error = normalizeDecisionText(source.errorMessage ?? "");

  if (config?.fallbackStatus && source.durationMs === 0) {
    return config.fallbackStatus;
  }

  if (/login|credencial|autentic|cuenta/.test(error)) {
    return "requires_login";
  }

  if (/no expone|sin catalogo|sin precio|precios publicos/.test(error)) {
    return "no_public_prices";
  }

  return "failed";
}

function findSourceForConfig(
  sources: SourceSearchStatus[],
  config: SourcePriorityConfig,
) {
  return sources.find((source) => getSourceConfig(source)?.sourceId === config.sourceId);
}

function compareSourceHealthItems(first: SourceHealthItem, second: SourceHealthItem) {
  const channelRank = getSourceHealthChannelRank(first) - getSourceHealthChannelRank(second);

  if (channelRank !== 0) {
    return channelRank;
  }

  const firstHasData = first.status === "ok";
  const secondHasData = second.status === "ok";

  if (firstHasData !== secondHasData) {
    return firstHasData ? -1 : 1;
  }

  if (first.priority !== second.priority) {
    return first.priority - second.priority;
  }

  return first.displayName.localeCompare(second.displayName, "es");
}

function getSourceHealthChannelRank(source: SourceHealthItem) {
  if (source.channel === "own") {
    return 0;
  }

  return source.channel === "mayorista" ? 1 : 2;
}

function buildAlerts(
  row: Omit<CategoryDecisionRow, "alerts" | "recommendation">,
  criticalMissing: SourceHealthItem[],
): PricingAlert[] {
  const alerts: PricingAlert[] = [];

  if (!row.aguiarPrice && row.bestOverall) {
    alerts.push({
      severity: "warning",
      label: "Sin Aguiar",
      message: "Hay mercado, pero falta precio propio para decidir.",
    });
  }

  if (row.matchQuality === "match_weak" || row.matchQuality === "not_comparable") {
    alerts.push({
      severity: "warning",
      label: "Match dudoso",
      message: "Revisar equivalencia de marca/presentacion antes de decidir.",
    });
  }

  if (
    row.gapVsAguiarPercent !== null &&
    row.bestWholesale &&
    row.gapVsAguiarPercent > 10
  ) {
    alerts.push({
      severity: "critical",
      label: "Diferencia critica",
      message: "Aguiar esta mas de 10% arriba del mejor mayorista.",
    });
  } else if (
    row.gapVsAguiarPercent !== null &&
    row.gapVsAguiarPercent > 5
  ) {
    alerts.push({
      severity: "warning",
      label: "Arriba del mercado",
      message: "Aguiar esta por encima de la referencia disponible.",
    });
  }

  if (row.bestRetail && row.bestWholesale && row.bestRetail.price < row.bestWholesale.price) {
    alerts.push({
      severity: "critical",
      label: "Minorista bajo mayorista",
      message: "El mejor minorista esta por debajo del mejor mayorista.",
    });
  }

  if (row.gapVsAguiarPercent !== null && row.gapVsAguiarPercent < -8) {
    alerts.push({
      severity: "info",
      label: "Margen",
      message: "Aguiar esta por debajo del mercado; puede haber oportunidad de margen.",
    });
  }

  if (row.hasPromo) {
    alerts.push({
      severity: "info",
      label: "Promo detectada",
      message: "Hay condiciones promocionales, pack o bulto en alguna fuente.",
    });
  }

  if (criticalMissing.length > 0) {
    alerts.push({
      severity: "warning",
      label: "Cobertura limitada",
      message: `Faltan fuentes criticas: ${criticalMissing
        .map((source) => source.displayName)
        .slice(0, 3)
        .join(", ")}.`,
    });
  }

  return alerts;
}

function buildRowRecommendation(
  row: Omit<CategoryDecisionRow, "alerts" | "recommendation">,
  alerts: PricingAlert[],
  criticalMissing: SourceHealthItem[],
): PricingRecommendation {
  const hasWeakMatch =
    row.matchQuality === "match_weak" || row.matchQuality === "not_comparable";
  const hasOnlyRetail = Boolean(row.bestRetail && !row.bestWholesale);
  const hasCriticalCoverageGap = criticalMissing.length > 0;

  if (!row.aguiarPrice && row.bestOverall) {
    return {
      kind: "load_aguiar",
      label: "Cargar precio Aguiar",
      reason: "Existe referencia de mercado, pero no hay precio propio.",
      tone: "warning",
      targetPrice: null,
    };
  }

  if (!row.bestOverall || !row.aguiarPrice) {
    return {
      kind: "insufficient_reference",
      label: "Sin referencia suficiente",
      reason: "No hay datos comparables suficientes para decidir.",
      tone: "neutral",
      targetPrice: null,
    };
  }

  if (hasWeakMatch) {
    return {
      kind: "review_match",
      label: "Revisar equivalencia",
      reason: "El match no es lo bastante confiable para sugerir una accion fuerte.",
      tone: "neutral",
      targetPrice: null,
    };
  }

  if (hasOnlyRetail) {
    return {
      kind: "limited_coverage",
      label: "Referencia debil",
      reason: "Solo hay minoristas; usar como senal, no como precio objetivo firme.",
      tone: "neutral",
      targetPrice: null,
    };
  }

  const minoristaBajoMayorista = alerts.some(
    (alert) => alert.label === "Minorista bajo mayorista",
  );

  if (minoristaBajoMayorista) {
    return {
      kind: "review_match",
      label: "Revisar canal/precio",
      reason: "Hay minorista debajo del mayorista; validar promo o equivalencia.",
      tone: "danger",
      targetPrice: null,
    };
  }

  if (hasCriticalCoverageGap && (row.gapVsAguiarPercent ?? 0) > 5) {
    return {
      kind: "limited_coverage",
      label: "Validar cobertura",
      reason: "Faltan mayoristas criticos; evitar baja automatica hasta completar datos.",
      tone: "warning",
      targetPrice: null,
    };
  }

  if (row.gapVsAguiarPercent !== null && row.gapVsAguiarPercent > 10) {
    return {
      kind: "compete",
      label: "Competir: baja o promo",
      reason: "Aguiar esta mas de 10% arriba del mejor mayorista confiable.",
      tone: "danger",
      targetPrice: row.bestWholesale ? roundMoney(row.bestWholesale.price * 0.99) : null,
    };
  }

  if (row.gapVsAguiarPercent !== null && row.gapVsAguiarPercent > 5) {
    return {
      kind: "monitor",
      label: "Monitorear / ajustar",
      reason: "Aguiar esta entre 5% y 10% arriba de la referencia.",
      tone: "warning",
      targetPrice: row.bestWholesale ? roundMoney(row.bestWholesale.price) : null,
    };
  }

  if (row.gapVsAguiarPercent !== null && row.gapVsAguiarPercent < -8) {
    return {
      kind: "margin_opportunity",
      label: "Oportunidad de margen",
      reason: "Aguiar esta por debajo del mercado; revisar captura de margen.",
      tone: "info",
      targetPrice: null,
    };
  }

  return {
    kind: "maintain",
    label: "Mantener",
    reason: "Aguiar esta dentro del rango competitivo de +/-5%.",
    tone: "success",
    targetPrice: null,
  };
}

function buildCategoryRecommendation(
  rows: CategoryDecisionRow[],
  sourceHealth: SourceHealthSummary,
): PricingRecommendation {
  const rowsWithGap = rows.filter((row) => row.gapVsAguiarPercent !== null);
  const averageGapValue = average(
    rowsWithGap.map((row) => row.gapVsAguiarPercent as number),
  );
  const criticalRows = rows.filter((row) =>
    row.alerts.some((alert) => alert.severity === "critical"),
  );

  if (sourceHealth.criticalMissing.length >= 3) {
    return {
      kind: "limited_coverage",
      label: "Decision limitada por cobertura",
      reason: "Faltan mayoristas criticos para cerrar estrategia de categoria.",
      tone: "warning",
      targetPrice: null,
    };
  }

  if (rows.some((row) => !row.aguiarPrice && row.bestOverall)) {
    return {
      kind: "load_aguiar",
      label: "Completar precios Aguiar",
      reason: "Hay productos con mercado y sin precio propio.",
      tone: "warning",
      targetPrice: null,
    };
  }

  if (criticalRows.length > 0) {
    return {
      kind: "compete",
      label: "Revisar productos criticos",
      reason: `${criticalRows.length} clusters tienen alertas criticas de precio o canal.`,
      tone: "danger",
      targetPrice: null,
    };
  }

  if (averageGapValue !== null && averageGapValue > 5) {
    return {
      kind: "monitor",
      label: "Ajuste selectivo",
      reason: "La diferencia promedio muestra a Aguiar por encima del mercado.",
      tone: "warning",
      targetPrice: null,
    };
  }

  if (averageGapValue !== null && averageGapValue < -8) {
    return {
      kind: "margin_opportunity",
      label: "Oportunidad de margen categoria",
      reason: "Aguiar aparece por debajo de la referencia en promedio.",
      tone: "info",
      targetPrice: null,
    };
  }

  return {
    kind: "maintain",
    label: "Categoria competitiva",
    reason: "No se detectan alertas criticas con la cobertura actual.",
    tone: "success",
    targetPrice: null,
  };
}

function rowMatchesFilter(row: CategoryDecisionRow, filter: CategoryDecisionFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "mayoristas") {
    return Boolean(row.bestWholesale);
  }

  if (filter === "minoristas") {
    return Boolean(row.bestRetail);
  }

  if (filter === "alerts") {
    return row.alerts.length > 0;
  }

  if (filter === "critical_gap") {
    return row.alerts.some((alert) => alert.label === "Diferencia critica");
  }

  if (filter === "opportunities") {
    return row.recommendation.kind === "margin_opportunity";
  }

  if (filter === "missing_aguiar") {
    return !row.aguiarPrice;
  }

  if (filter === "weak_match") {
    return row.matchQuality === "match_weak" || row.matchQuality === "not_comparable";
  }

  return row.sourcesWithPrice > 0;
}

function compareRows(
  first: CategoryDecisionRow,
  second: CategoryDecisionRow,
  sort: CategoryDecisionSort,
) {
  if (sort === "wholesale_price") {
    return nullableNumber(first.bestWholesale?.price) - nullableNumber(second.bestWholesale?.price);
  }

  if (sort === "retail_price") {
    return nullableNumber(first.bestRetail?.price) - nullableNumber(second.bestRetail?.price);
  }

  if (sort === "confidence_desc") {
    return second.confidenceScore - first.confidenceScore;
  }

  if (sort === "winning_source") {
    return (first.winningSourceName ?? "zzzz").localeCompare(
      second.winningSourceName ?? "zzzz",
      "es",
    );
  }

  if (sort === "brand") {
    return first.brand.localeCompare(second.brand, "es");
  }

  if (sort === "presentation") {
    return first.presentationLabel.localeCompare(second.presentationLabel, "es");
  }

  return (
    nullableNumber(second.gapVsAguiarPercent, -Infinity) -
    nullableNumber(first.gapVsAguiarPercent, -Infinity)
  );
}

function buildClusterKey(product: ProductSearchResult, categoryName: string) {
  const brand = normalizeDecisionText(product.brand ?? inferBrandFromName(product.rawName));
  const presentation = extractPresentation(product);
  const coreName = buildCoreProductName(product, brand);

  return [normalizeDecisionText(categoryName), brand, presentation.key, coreName]
    .filter(Boolean)
    .join("|");
}

function buildCoreProductName(product: ProductSearchResult, brand: string) {
  const normalizedName = normalizeDecisionText(product.rawName)
    .replace(new RegExp(`\\b${escapeRegExp(brand)}\\b`, "g"), " ")
    .replace(/\b(alfajor|alfajores|galletitas|galleta|chocolate|jugo|polvo|pack|bulto|caja|display|unidades|unidad)\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|gr|grs|kg|ml|cc|l|lt|u|unid|uds)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizedName.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
}

function buildClusterName(products: ProductSearchResult[]) {
  const aguiarProduct = products.find((product) => getSourceChannel(product) === "own");
  return aguiarProduct?.rawName ?? products[0]?.rawName ?? "Producto";
}

function buildBrandLabel(products: ProductSearchResult[]) {
  const brands = Array.from(
    new Set(
      products
        .map((product) => product.brand ?? inferBrandFromName(product.rawName))
        .map((brand) => brand.trim())
        .filter(Boolean),
    ),
  );

  if (brands.length === 0) {
    return "Sin marca";
  }

  return brands.length === 1 ? brands[0] : "Multi marca";
}

function buildPresentationLabel(products: ProductSearchResult[]) {
  const labels = Array.from(
    new Set(products.map((product) => extractPresentation(product).label)),
  ).filter((label) => label !== "Sin presentacion");

  return labels[0] ?? "Sin presentacion";
}

function extractPresentation(product: ProductSearchResult) {
  const text = normalizeDecisionText(
    [
      product.rawName,
      product.packageLabel,
      product.priceCondition,
      product.packageQuantity ? `${product.packageQuantity} unidades` : "",
    ].join(" "),
  );
  const packMatch = text.match(
    /\b(\d+(?:[.,]\d+)?)\s*(?:x|por|\*)\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grs|kg|ml|cc|l|lt|u|unid|unidad|unidades)\b/,
  );
  const singleMatch = text.match(
    /\b(\d+(?:[.,]\d+)?)\s*(g|gr|grs|kg|ml|cc|l|lt|u|unid|unidad|unidades)\b/,
  );

  if (packMatch?.[1] && packMatch[2] && packMatch[3]) {
    return {
      key: `${packMatch[1]}x${packMatch[2]}${packMatch[3]}`,
      label: `${packMatch[1]} x ${packMatch[2]} ${normalizeUnitLabel(packMatch[3])}`,
    };
  }

  if (singleMatch?.[1] && singleMatch[2]) {
    return {
      key: `${singleMatch[1]}${singleMatch[2]}`,
      label: `${singleMatch[1]} ${normalizeUnitLabel(singleMatch[2])}`,
    };
  }

  if (product.packageQuantity && product.packageQuantity > 1) {
    return {
      key: `pack${product.packageQuantity}`,
      label: product.packageLabel ?? `bulto x ${product.packageQuantity}`,
    };
  }

  return { key: "sin-presentacion", label: "Sin presentacion" };
}

function normalizeUnitLabel(unit: string) {
  const normalizedUnit = unit.toLowerCase();

  if (["gr", "grs"].includes(normalizedUnit)) {
    return "g";
  }

  if (["lt"].includes(normalizedUnit)) {
    return "l";
  }

  if (["unid", "unidad", "unidades"].includes(normalizedUnit)) {
    return "u";
  }

  return normalizedUnit;
}

function findBestProductCell(products: ProductSearchResult[]) {
  return findBestCell(products.map(toPriceCell));
}

function findBestCell(
  cells: Array<CompetitorPriceCell | null | undefined>,
): CompetitorPriceCell | null {
  const usableCells = cells.filter(
    (cell): cell is CompetitorPriceCell =>
      cell !== null &&
      cell !== undefined &&
      Number.isFinite(cell.price) &&
      cell.price > 0,
  );

  return (
    usableCells.sort((first, second) => {
      if (first.price !== second.price) {
        return first.price - second.price;
      }

      return compareSourcePriority(first.product, second.product);
    })[0] ?? null
  );
}

function toPriceCell(product: ProductSearchResult): CompetitorPriceCell {
  return {
    product,
    price: getComparablePrice(product),
    sourceId: product.sourceId,
    sourceName: getSourceDisplayName(product),
    channel: getSourceChannel(product),
    hasPromo: detectPromo(product),
  };
}

function compareProductsForCluster(
  first: ProductSearchResult,
  second: ProductSearchResult,
) {
  const sourcePriority = compareSourcePriority(first, second);

  if (sourcePriority !== 0) {
    return sourcePriority;
  }

  return getComparablePrice(first) - getComparablePrice(second);
}

function determineMatchQuality(
  products: ProductSearchResult[],
  aguiarPrice: CompetitorPriceCell | null,
  bestMarket: CompetitorPriceCell | null,
): MatchQuality {
  if (!aguiarPrice || !bestMarket) {
    return "not_comparable";
  }

  const score = Math.round(average(products.map((product) => product.confidenceScore)) ?? 0);

  if (score >= 92) {
    return "match_exact";
  }

  if (score >= 78) {
    return "match_probable";
  }

  if (score >= 60) {
    return "match_weak";
  }

  return "not_comparable";
}

function detectPromo(product: ProductSearchResult) {
  const text = normalizeDecisionText(
    [
      product.rawName,
      product.priceCondition,
      product.packageLabel,
      ...(product.alternatePrices ?? []).map((price) => price.label),
    ].join(" "),
  );

  return (
    (product.alternatePrices?.length ?? 0) > 0 ||
    /\b(promo|oferta|2x|segunda|descuento|pack|bulto|caja|display)\b/.test(text)
  );
}

function calculateGapPercent(aguiarPrice: number, referencePrice: number) {
  if (!referencePrice) {
    return null;
  }

  return ((aguiarPrice - referencePrice) / referencePrice) * 100;
}

function average(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return null;
  }

  return finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length;
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function nullableNumber(value: number | null | undefined, fallback = Infinity) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getSourceStatusLabel(status: ExpectedSourceStatus) {
  const labels: Record<ExpectedSourceStatus, string> = {
    ok: "OK",
    sin_datos: "Sin datos",
    timeout: "Timeout",
    failed: "Error",
    pending: "Pendiente",
    requires_login: "Requiere login",
    not_configured: "No configurada",
    no_public_prices: "Sin precios publicos",
  };

  return labels[status];
}

function inferBrandFromName(value: string) {
  const tokens = normalizeDecisionText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);

  return tokens[0] ?? "";
}

function normalizeDecisionText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,*\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
