export type SearchRequest = {
  query: string;
};

export type ProductSearchResult = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  sku?: string | null;
  barcodes?: string[];
  brand?: string;
  rawName: string;
  normalizedName: string;
  price: number;
  currency: "ARS";
  productUrl: string | null;
  imageUrl: string | null;
  confidenceScore: number;
};

export type SourceSearchStatus = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  status: "success" | "failed" | "timeout" | "no_results";
  resultsCount: number;
  errorMessage?: string;
  durationMs: number;
};

export type PendingSourceStatus = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  status:
    | "requires_login"
    | "no_public_catalog"
    | "no_public_prices"
    | "out_of_scope";
  message: string;
};

export type CatalogRegion = {
  id: "argentina" | "nea";
  name: string;
  scopeLabel: string;
  provinces?: string[];
};

export type SearchResponse = {
  query: string;
  normalizedQuery: string;
  searchedAt: string;
  durationMs: number;
  results: ProductSearchResult[];
  sources: SourceSearchStatus[];
  catalog?: CatalogMetadata;
};

export type PriceListInputItem = {
  rowNumber: number;
  rubro?: string;
  description?: string;
  code?: string;
  ean13Di?: string;
  ean13Bu?: string;
  currentPrice?: number;
  currentCost?: number;
};

export type PriceListRequest = {
  items: PriceListInputItem[];
  persist?: boolean;
};

export type PriceListSourcePrice = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  price: number;
  currency: "ARS";
  productName: string;
  productUrl: string | null;
  confidenceScore: number;
};

export type PriceListItemResult = {
  input: PriceListInputItem;
  queryUsed: string | null;
  status: "matched" | "not_found";
  bestPrice: number | null;
  bestSource: PriceListSourcePrice | null;
  sourcePrices: PriceListSourcePrice[];
  matchedCount: number;
};

export type PriceListResponse = {
  searchedAt: string;
  durationMs: number;
  itemsCount: number;
  matchedCount: number;
  unmatchedCount: number;
  sources: SourceSearchStatus[];
  catalog: CatalogMetadata;
  results: PriceListItemResult[];
  persistence?: {
    enabled: boolean;
    requested?: boolean;
    saved?: boolean;
    runId?: string;
    errorMessage?: string;
  };
};

export type PriceListRunSummary = {
  id: string;
  listName: string;
  status: string;
  weekStart: string | null;
  searchedAt: string;
  createdAt: string;
  durationMs: number;
  itemsCount: number;
  matchedCount: number;
  unmatchedCount: number;
};

export type PriceListRunSource = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  status: string;
  resultsCount: number;
  durationMs: number;
  sourceUrl: string | null;
  dataOrigin: string | null;
  sourceScope: string | null;
  errorMessage: string | null;
};

export type PriceListRunItem = {
  id: string;
  rowNumber: number;
  rubro: string | null;
  description: string | null;
  code: string | null;
  ean13Di: string | null;
  ean13Bu: string | null;
  currentPrice: number | null;
  currentCost: number | null;
  matchStatus: "matched" | "not_found";
  bestPrice: number | null;
  bestSourceName: string | null;
  bestSourceType: "mayorista" | "minorista" | null;
  bestProductName: string | null;
  bestProductUrl: string | null;
  bestConfidenceScore: number | null;
  marginPercent: number | null;
  gapPercent: number | null;
  suggestedPrice: number | null;
  decisionStatus: string;
  decisionLabel: string;
  matchedCount: number;
  sourcePrices: PriceListSourcePrice[];
};

export type PriceListRunDetail = {
  run: PriceListRunSummary;
  sources: PriceListRunSource[];
  items: PriceListRunItem[];
};

export type PriceListHistoryResponse = {
  enabled: boolean;
  runs: PriceListRunSummary[];
  errorMessage?: string;
};

export type PriceListRunDetailResponse = {
  enabled: boolean;
  detail: PriceListRunDetail | null;
  errorMessage?: string;
};

export type PriceEvolutionPoint = {
  runId: string;
  searchedAt: string;
  createdAt: string;
  araPrice: number | null;
  referencePrice: number | null;
  suggestedPrice: number | null;
  bestSourceName: string | null;
  gapPercent: number | null;
  decisionLabel: string;
  sourcePrices: PriceListSourcePrice[];
};

export type PriceEvolutionProduct = {
  productKey: string;
  description: string;
  rubro: string | null;
  code: string | null;
  ean13Di: string | null;
  ean13Bu: string | null;
  points: PriceEvolutionPoint[];
  sourceNames: string[];
};

export type PriceEvolutionResponse = {
  enabled: boolean;
  products: PriceEvolutionProduct[];
  runs: PriceListRunSummary[];
  errorMessage?: string;
};

export type CatalogMetadata = {
  status: "empty" | "syncing" | "ready" | "failed";
  region: CatalogRegion;
  brands: string[];
  lastSyncedAt: string | null;
  durationMs: number | null;
  productsCount: number;
  sources: SourceSearchStatus[];
  pendingSources: PendingSourceStatus[];
  errorMessage?: string;
};
