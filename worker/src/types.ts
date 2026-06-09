import type { Page } from "playwright";

export type StoreType = "mayorista" | "minorista";

export type SearchRequest = {
  query: string;
};

export type ProductSearchResult = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  sku?: string | null;
  barcodes?: string[];
  brand?: string;
  category?: string;
  rawName: string;
  normalizedName: string;
  price: number;
  comparisonPrice?: number;
  priceCondition?: string | null;
  alternatePrices?: AlternatePrice[];
  packageQuantity?: number | null;
  packageLabel?: string | null;
  availability?: "in_stock" | "out_of_stock" | "unknown";
  stockQuantity?: number | null;
  currency: "ARS";
  productUrl: string | null;
  imageUrl: string | null;
  confidenceScore: number;
};

export type AlternatePrice = {
  label: string;
  price: number;
  comparisonPrice?: number | null;
};

export type SourceSearchStatus = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
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
  storeType: StoreType;
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

export type CategorySearchResponse = {
  query: string;
  normalizedQuery: string;
  searchedAt: string;
  durationMs: number;
  groups: CategorySearchGroup[];
  sources: SourceSearchStatus[];
};

export type CategorySearchGroup = {
  id: string;
  categoryName: string;
  matchedTerms: string[];
  confidenceScore: number;
  totalProducts: number;
  tokinProducts: ProductSearchResult[];
  competitorProducts: ProductSearchResult[];
  tokinBrands: CategoryBrandSummary[];
  competitorBrands: CategoryBrandSummary[];
  minTokinPrice: number | null;
  minCompetitorPrice: number | null;
};

export type CategoryBrandSummary = {
  brand: string;
  productsCount: number;
  minPrice: number | null;
  sourceNames: string[];
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

export type PriceListSourcePrice = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  price: number;
  comparisonPrice?: number;
  priceCondition?: string | null;
  alternatePrices?: AlternatePrice[];
  packageQuantity?: number | null;
  packageLabel?: string | null;
  category?: string;
  currency: "ARS";
  productName: string;
  productUrl: string | null;
  confidenceScore: number;
};

export type PriceListRejectReason =
  | "brand_mismatch"
  | "score_below_threshold"
  | "presentation_or_flavor_mismatch"
  | "no_candidates";

export type PriceListRejectedCandidate = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  productName: string;
  productUrl: string | null;
  reason: PriceListRejectReason;
  baseScore: number;
  finalScore: number;
};

export type PriceListQueryDiagnostic = {
  query: string;
  sourceResultsCount?: number;
  candidatesCount: number;
  matchesCount: number;
  rejectedCount: number;
  topRejected: PriceListRejectedCandidate[];
};

export type PriceListDirectSourceDiagnostics = {
  sourceId: string;
  storeName: string;
  status: "skipped" | "matched" | "no_results" | "failed";
  queriesTried: string[];
  matchedQuery: string | null;
  queryDiagnostics: PriceListQueryDiagnostic[];
  priceNormalization?: PriceListPriceNormalizationDiagnostic;
  aiMatch?: PriceListAiMatchDiagnostic;
  errorMessage?: string;
};

export type PriceListPriceNormalizationDiagnostic = {
  status: "normalized" | "rejected";
  originalPrice: number;
  normalizedPrice?: number | null;
  referencePrice?: number | null;
  packageQuantity?: number | null;
  productName: string;
  reason: string;
};

export type PriceListAiMatchDiagnostic = {
  status: "disabled" | "skipped" | "matched" | "rejected" | "failed";
  model?: string;
  candidatesCount: number;
  selectedProductName?: string | null;
  confidenceScore?: number | null;
  reason?: string;
  errorMessage?: string;
};

export type PriceListMatchDiagnostics = {
  expectedBrand: string | null;
  queriesTried: string[];
  matchedQuery: string | null;
  queryDiagnostics: PriceListQueryDiagnostic[];
  aguiarPriceNormalization?: PriceListPriceNormalizationDiagnostic;
  directAguiar?: PriceListDirectSourceDiagnostics;
};

export type PriceListItemResult = {
  input: PriceListInputItem;
  queryUsed: string | null;
  status: "matched" | "not_found";
  bestPrice: number | null;
  bestSource: PriceListSourcePrice | null;
  sourcePrices: PriceListSourcePrice[];
  matchedCount: number;
  diagnostics?: PriceListMatchDiagnostics;
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

export type CatalogSnapshot = CatalogMetadata & {
  products: ProductSearchResult[];
};

export type ScrapingSource = {
  id: string;
  storeName: string;
  storeType: StoreType;
  city: string;
  sourceUrl?: string;
  dataOrigin?: string;
  sourceScope?: string;
  sourceKind?:
    | "playwright"
    | "carrefour_vtex_auth"
    | "maxiconsumo_auth"
    | "laanonima_html"
    | "static_html"
    | "text_lines"
    | "tokin"
    | "vea_vtex_auth"
    | "vtex_api"
    | "yaguar_auth"
    | "woocommerce_pmw_json";
  searchUrlTemplate: string;
  requiresJavascript: boolean;
  catalogSearchMode?: "query" | "full_page";
  maxCards?: number;
  enabled?: boolean;
  disabledReason?: string;
  disabledKind?: PendingSourceStatus["status"];
  selectors?: {
    productCard: string;
    name: string;
    price: string;
    image?: string;
    link?: string;
  };
};

export type QueryType = "sku" | "barcode" | "text";

export type SearchSourceResult = {
  results: ProductSearchResult[];
  status: SourceSearchStatus;
};

export type ExtractorContext = {
  page: Page;
  source: ScrapingSource;
};
