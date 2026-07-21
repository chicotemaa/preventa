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

const DECISION_BRAND_ALIASES = [
  { label: "Bon o Bon", aliases: ["bon o bon", "bonobon", "bob", "b o b", "b-o-b"] },
  { label: "Cofler", aliases: ["cofler", "cofler block"] },
  { label: "Bagley", aliases: ["bagley"] },
  { label: "Chocolinas", aliases: ["chocolinas", "chocotorta"] },
  { label: "Tatin", aliases: ["tatin", "tatín"] },
  { label: "Tofi", aliases: ["tofi"] },
  { label: "Aguila", aliases: ["aguila", "águila"] },
  { label: "Mogul", aliases: ["mogul"] },
  { label: "Topline", aliases: ["topline", "top line"] },
  { label: "Rocklets", aliases: ["rocklets"] },
  { label: "Tortuguita", aliases: ["tortuguita"] },
  { label: "Cabsha", aliases: ["cabsha"] },
  { label: "Arcor", aliases: ["arcor"] },
  { label: "Hamlet", aliases: ["hamlet"] },
  { label: "Lia", aliases: ["lia"] },
  { label: "Fulbito", aliases: ["fulbito"] },
  { label: "Terrabusi", aliases: ["terrabusi"] },
] as const;

const DECISION_VARIANT_GROUPS = [
  ["minitorta", ["minitorta", "mini torta"]],
  ["triple", ["triple", "triples"]],
  ["simple", ["simple", "simples"]],
  ["mini", ["mini", "minis"]],
  ["block", ["block", "bloc"]],
  ["mousse", ["mousse"]],
  ["chocotorta", ["chocotorta"]],
  ["negro", ["negro", "black", "chocolate con leche"]],
  ["blanco", ["blanco", "blanca"]],
  ["clasico", ["clasico", "clasica", "clasico", "clásica"]],
  ["brownie", ["brownie"]],
  ["ddl", ["ddl", "dulce de leche"]],
  ["mani", ["mani", "maní"]],
  ["frutilla", ["frutilla", "frut"]],
  ["frambuesa", ["frambuesa"]],
  ["coco", ["coco"]],
  ["goat", ["goat"]],
  ["byn", ["byn", "b&n", "b n"]],
] as const;

export type MatchQuality =
  | "match_exact"
  | "match_probable"
  | "match_weak"
  | "not_comparable";

export type PricingTone = "danger" | "warning" | "success" | "info" | "neutral";

export type CommercialPriority = "tokin" | "excel" | "market";

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
  commercialPriority: CommercialPriority;
  commercialPriorityLabel: string;
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
  confidenceScore: number | null;
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
  visibleAguiarProductsCount: number;
  visibleCompetitorProductsCount: number;
  sourceHealth: SourceHealthSummary;
  rows: CategoryDecisionRow[];
  bestWholesalePrice: CompetitorPriceCell | null;
  bestRetailPrice: CompetitorPriceCell | null;
  bestOverallPrice: CompetitorPriceCell | null;
  averageGapVsAguiarPercent: number | null;
  criticalAlertsCount: number;
  comparableRowsCount: number;
  aboveMarketRowsCount: number;
  competitiveRowsCount: number;
  opportunityRowsCount: number;
  withoutOwnEquivalentRowsCount: number;
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
  const products = consolidateProductVariants([
    ...group.tokinProducts,
    ...group.competitorProducts,
  ]);
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
    aguiarProductsCount: group.tokinProductsCount ?? group.tokinProducts.length,
    competitorProductsCount:
      group.competitorProductsCount ?? group.competitorProducts.length,
    visibleAguiarProductsCount: group.tokinProducts.length,
    visibleCompetitorProductsCount: group.competitorProducts.length,
    sourceHealth,
    rows,
    bestWholesalePrice,
    bestRetailPrice,
    bestOverallPrice,
    averageGapVsAguiarPercent: average(gapValues),
    criticalAlertsCount,
    comparableRowsCount: rows.filter((row) => row.matchQuality !== "not_comparable").length,
    aboveMarketRowsCount: rows.filter((row) => (row.gapVsAguiarPercent ?? -Infinity) > 5).length,
    competitiveRowsCount: rows.filter(
      (row) =>
        row.gapVsAguiarPercent !== null &&
        row.gapVsAguiarPercent >= -8 &&
        row.gapVsAguiarPercent <= 5,
    ).length,
    opportunityRowsCount: rows.filter(
      (row) => row.recommendation.kind === "margin_opportunity",
    ).length,
    withoutOwnEquivalentRowsCount: rows.filter((row) => !row.aguiarPrice).length,
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

export function formatGapExplanation(value: number | null) {
  if (value === null) {
    return "Sin comparación";
  }

  const magnitude = new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(Math.abs(value));

  if (Math.abs(value) < 0.05) {
    return "Igual al mercado";
  }

  return value > 0
    ? `Aguiar ${magnitude}% más caro`
    : `Aguiar ${magnitude}% más barato`;
}

export function countDecisionRowsByFilter(
  rows: CategoryDecisionRow[],
  filter: CategoryDecisionFilter,
) {
  return rows.filter((row) => rowMatchesFilter(row, filter)).length;
}

export function getComparablePrice(product: ProductSearchResult) {
  return normalizeNumber(product.comparisonPrice) ?? product.price;
}

export function consolidateProductVariants(products: ProductSearchResult[]) {
  const groups = new Map<string, ProductSearchResult[]>();

  for (const product of products) {
    const key = [
      product.sourceId,
      product.normalizedName || normalizeDecisionText(product.rawName),
      extractPresentation(product).key,
      product.productUrl ?? product.imageUrl ?? "",
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }

  return Array.from(groups.values()).map(consolidateProductGroup);
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
  const sortedProducts = consolidateProductVariants(products).sort(compareProductsForCluster);
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
  const bestOverall = bestMarket;
  const matchQuality = determineMatchQuality(products, aguiarPrice, bestMarket);
  const confidenceScore =
    matchQuality === "not_comparable"
      ? null
      : Math.round(
          average(
            [aguiarPrice?.product.confidenceScore, bestMarket?.product.confidenceScore].filter(
              (score): score is number => typeof score === "number",
            ),
          ) ?? 0,
        );
  const commercialPriority = determineCommercialPriority(sortedProducts);
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
    commercialPriority,
    commercialPriorityLabel: getCommercialPriorityLabel(commercialPriority),
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
    winningChannel: bestMarket?.channel ?? null,
    winningSourceName: bestMarket?.sourceName ?? null,
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

export function buildSourceHealthSummary(
  sources: SourceSearchStatus[],
): SourceHealthSummary {
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
  const pendingStatuses: ExpectedSourceStatus[] = [
    "pending",
    "requires_login",
    "not_configured",
  ];
  const pending = sortedItems.filter((item) =>
    pendingStatuses.includes(item.status),
  ).length;
  const withoutData = sortedItems.filter(
    (item) => item.status !== "ok" && !pendingStatuses.includes(item.status),
  ).length;

  return {
    items: sortedItems,
    total: sortedItems.length,
    withData,
    withoutData,
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
    if (source.errorMessage) {
      return `Datos guardados disponibles. Ultima actualizacion: ${source.errorMessage}`;
    }

    if (config?.fallbackStatus === "requires_login") {
      return "Fuente consultada con datos y credenciales configuradas.";
    }

    return "Fuente consultada con datos.";
  }

  if (source?.errorMessage) {
    return source.errorMessage;
  }

  if (source && status === "sin_datos") {
    if (config?.sourceId === "yaguar-chaco-tienda-auth") {
      return "Yaguar acepto las credenciales, pero la tienda no expuso productos para esta busqueda. Revisar que la cuenta tenga catalogo/precios habilitados para Chaco o que no requiera seleccion adicional de sucursal.";
    }

    return config?.fallbackMessage ?? "Fuente consultada, sin productos utiles para esta busqueda.";
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

  const error = normalizeDecisionText(source.errorMessage ?? "");

  if (config?.fallbackStatus && source.durationMs === 0) {
    return config.fallbackStatus;
  }

  if (
    /login|credencial|autentic|cuenta|sesion|cookie|user[ -]?agent|autorizad|precios privados/.test(
      error,
    )
  ) {
    return "requires_login";
  }

  if (/no expone|sin catalogo|sin precio|precios publicos/.test(error)) {
    return "no_public_prices";
  }

  if (source.status === "no_results" || source.status === "success") {
    return "sin_datos";
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
  _criticalMissing: SourceHealthItem[],
): PricingAlert[] {
  const alerts: PricingAlert[] = [];

  if (row.matchQuality === "match_weak") {
    alerts.push({
      severity: "warning",
      label: "Equivalencia dudosa",
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
      kind: "insufficient_reference",
      label: "Sin equivalente Aguiar",
      reason: "Es un producto de mercado sin equivalencia confirmada en el surtido propio.",
      tone: "neutral",
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

  if (criticalRows.length > 0) {
    return {
      kind: "compete",
      label: "Revisar productos criticos",
      reason:
        criticalRows.length === 1
          ? "1 grupo comparable tiene una alerta crítica de precio o canal."
          : `${criticalRows.length} grupos comparables tienen alertas críticas de precio o canal.`,
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
    return row.alerts.some((alert) => alert.severity !== "info");
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
  const commercialPriority =
    getCommercialPriorityRank(first) - getCommercialPriorityRank(second);

  if (commercialPriority !== 0) {
    return commercialPriority;
  }

  if (sort === "wholesale_price") {
    return nullableNumber(first.bestWholesale?.price) - nullableNumber(second.bestWholesale?.price);
  }

  if (sort === "retail_price") {
    return nullableNumber(first.bestRetail?.price) - nullableNumber(second.bestRetail?.price);
  }

  if (sort === "confidence_desc") {
    return nullableNumber(second.confidenceScore, -Infinity) - nullableNumber(first.confidenceScore, -Infinity);
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

function determineCommercialPriority(products: ProductSearchResult[]): CommercialPriority {
  if (products.some(isTokinOrAguiarProduct)) {
    return "tokin";
  }

  if (products.some(isExcelReferenceProduct)) {
    return "excel";
  }

  return "market";
}

function isTokinOrAguiarProduct(product: ProductSearchResult) {
  return getSourceChannel(product) === "own";
}

function isExcelReferenceProduct(product: ProductSearchResult) {
  const text = normalizeDecisionText(
    [
      product.sourceId,
      product.storeName,
      product.sourceUrl,
      product.sourceScope,
      product.dataOrigin,
      product.priceCondition,
      product.category,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    /\b(excel|xlsx|xls|csv|human)\b/.test(text) ||
    text.includes("lista importada") ||
    text.includes("lista semanal") ||
    text.includes("csv importado")
  );
}

function getCommercialPriorityLabel(priority: CommercialPriority) {
  if (priority === "tokin") {
    return "Tokin/Aguiar";
  }

  if (priority === "excel") {
    return "Lista Excel";
  }

  return "Mercado";
}

function getCommercialPriorityRank(row: CategoryDecisionRow) {
  if (row.commercialPriority === "tokin") {
    return 0;
  }

  if (row.commercialPriority === "excel") {
    return 1;
  }

  return 2;
}

function buildClusterKey(product: ProductSearchResult, categoryName: string) {
  const brand = normalizeDecisionText(getDecisionBrand(product));
  const presentation = extractPresentation(product);
  const variantSignature = buildVariantSignature(product, brand);
  const coreName = variantSignature || buildCoreProductName(product, brand);

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
        .map(getDecisionBrand)
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
    const quantity = normalizePresentationNumber(packMatch[1], text);
    const amount = normalizePresentationNumber(packMatch[2], text);
    const unit = normalizeUnitLabel(packMatch[3]);

    return {
      key: `${quantity}x${amount}${unit}`,
      label: `${quantity} x ${amount} ${unit}`,
    };
  }

  if (singleMatch?.[1] && singleMatch[2]) {
    const amount = normalizePresentationNumber(singleMatch[1], text);
    const unit = normalizeUnitLabel(singleMatch[2]);

    return {
      key: `${amount}${unit}`,
      label: `${amount} ${unit}`,
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

function normalizePresentationNumber(rawValue: string, context: string) {
  const normalizedValue = rawValue.replace(",", ".");
  const parsed = Number(normalizedValue);

  if (!Number.isFinite(parsed)) {
    return normalizedValue;
  }

  const decimalFixes: Record<number, number> = {
    294: 29.4,
    345: 34.5,
    407: 40.7,
    715: 71.5,
    735: 73.5,
  };
  const fixedValue =
    /\balfajor(?:es)?\b/.test(context) && decimalFixes[Math.round(parsed)]
      ? decimalFixes[Math.round(parsed)]
      : parsed;

  return Number.isInteger(fixedValue)
    ? String(fixedValue)
    : fixedValue.toFixed(1).replace(".", ",");
}

function findBestProductCell(products: ProductSearchResult[]) {
  return findBestCell(products.map(toPriceCell));
}

function consolidateProductGroup(products: ProductSearchResult[]): ProductSearchResult {
  if (products.length === 1) {
    return products[0]!;
  }

  const sorted = [...products].sort(
    (first, second) => getComparablePrice(first) - getComparablePrice(second),
  );
  const lowest = sorted[0]!;
  const highest = sorted.at(-1)!;
  const inferredQuantity = inferPackageQuantity(lowest, highest);
  const alternatePrices = dedupeAlternatePrices(
    sorted.flatMap((product) => [
      ...(product.alternatePrices ?? []),
      {
        label:
          product === lowest
            ? "Unidad"
            : inferredQuantity
              ? `Bulto x ${inferredQuantity}`
              : `Precio alternativo ${product.storeName}`,
        price: product.price,
        comparisonPrice: getComparablePrice(product),
      },
    ]),
  );

  if (inferredQuantity) {
    return {
      ...lowest,
      price: highest.price,
      comparisonPrice: getComparablePrice(lowest),
      packageQuantity: inferredQuantity,
      packageLabel: `bulto x ${inferredQuantity} unidades`,
      priceCondition: `Unidad y bulto detectados en ${lowest.storeName}`,
      alternatePrices,
      confidenceScore: Math.max(...products.map((product) => product.confidenceScore)),
    };
  }

  return {
    ...lowest,
    alternatePrices,
    confidenceScore: Math.max(...products.map((product) => product.confidenceScore)),
  };
}

function inferPackageQuantity(
  lowest: ProductSearchResult,
  highest: ProductSearchResult,
) {
  if (lowest === highest || getComparablePrice(lowest) <= 0 || highest.price <= lowest.price) {
    return null;
  }

  const ratio = highest.price / getComparablePrice(lowest);
  const roundedRatio = Math.round(ratio);

  return roundedRatio >= 2 && roundedRatio <= 200 && Math.abs(ratio - roundedRatio) <= 0.03
    ? roundedRatio
    : null;
}

function dedupeAlternatePrices(
  prices: NonNullable<ProductSearchResult["alternatePrices"]>,
) {
  const byPrice = new Map<string, (typeof prices)[number]>();

  for (const price of prices) {
    if (!Number.isFinite(price.price) || price.price <= 0) {
      continue;
    }

    byPrice.set(`${price.label}|${price.price}`, price);
  }

  return Array.from(byPrice.values()).sort((first, second) => first.price - second.price);
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

  return /\b(promo|promocion|oferta|2x|3x|segunda|descuento|rebaja)\b/.test(text);
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

function getDecisionBrand(product: ProductSearchResult) {
  const explicitBrand = findKnownBrand(product.rawName);

  if (explicitBrand) {
    return explicitBrand;
  }

  const productBrand = product.brand?.trim();

  if (productBrand) {
    return normalizeKnownBrandLabel(productBrand);
  }

  return inferBrandFromName(product.rawName);
}

function findKnownBrand(value: string) {
  const text = normalizeAliasText(value);
  const candidates = DECISION_BRAND_ALIASES.flatMap((brand) =>
    brand.aliases.map((alias) => ({ label: brand.label, alias })),
  ).sort((first, second) => second.alias.length - first.alias.length);

  return candidates.find((candidate) => aliasMatches(text, candidate.alias))?.label ?? null;
}

function normalizeKnownBrandLabel(value: string) {
  return findKnownBrand(value) ?? value;
}

function buildVariantSignature(product: ProductSearchResult, brand: string) {
  const text = normalizeAliasText(
    product.rawName
      .replace(new RegExp(`\\b${escapeRegExp(brand)}\\b`, "gi"), " "),
  );
  const variants = DECISION_VARIANT_GROUPS.flatMap(([variant, aliases]) =>
    aliases.some((alias) => aliasMatches(text, alias)) ? [variant] : [],
  );

  return Array.from(new Set(variants)).join("-");
}

function normalizeAliasText(value: string) {
  return normalizeDecisionText(value).replace(/-/g, " ");
}

function aliasMatches(text: string, alias: string) {
  const normalizedAlias = normalizeAliasText(alias);

  if (!normalizedAlias) {
    return false;
  }

  const pattern = normalizedAlias
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("[\\s-]+");

  return new RegExp(`\\b${pattern}\\b`, "i").test(text);
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
