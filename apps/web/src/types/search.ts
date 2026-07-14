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
    | "pending"
    | "requires_login"
    | "not_configured"
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
  tokinProductsCount?: number;
  competitorProductsCount?: number;
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

export type CarrefourComercianteSessionValidationRequest = {
  cookie?: string;
  userAgent?: string;
  query?: string;
};

export type CarrefourComercianteSessionValidationResponse = {
  ok: boolean;
  status:
    | "authorized"
    | "private_prices"
    | "missing_cookie"
    | "logged_out"
    | "no_public_products"
    | "failed";
  message: string;
  checkedAt: string;
  query: string;
  durationMs: number;
  productsCount: number;
  privateProductsCount: number;
  visiblePriceProductsCount: number;
  sampleProducts: Array<{
    name: string;
    price: number | null;
    barcode: string | null;
  }>;
  nextAction: string;
  requiredEnv: string[];
};

export type SourceSessionValidationSummary = Omit<
  CarrefourComercianteSessionValidationResponse,
  "sampleProducts" | "nextAction" | "requiredEnv"
>;

export type SourceCatalogSnapshotSummary = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  status: SourceSearchStatus["status"];
  syncedAt: string;
  durationMs: number;
  queries: string[];
  productsCount: number;
  privateProductsCount: number;
  visiblePriceProductsCount: number;
  errors: string[];
  sampleProducts: ProductSearchResult[];
};

export type SourceSessionState = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
  hasSession: boolean;
  savedAt: string | null;
  updatedAt: string | null;
  isEncrypted: boolean;
  storageBackend?: "supabase" | "file";
  lastValidation?: SourceSessionValidationSummary;
  snapshot?: SourceCatalogSnapshotSummary | null;
};

export type SourceSessionsResponse = {
  sources: SourceSessionState[];
};

export type CarrefourComercianteSessionSaveRequest = {
  cookie: string;
  userAgent: string;
  query?: string;
};

export type CarrefourComercianteSessionSaveResponse = {
  ok: boolean;
  session: SourceSessionState | null;
  validation: CarrefourComercianteSessionValidationResponse;
  message: string;
};

export type CarrefourComercianteSessionLoginRequest = {
  name?: string;
  document?: string;
  phone?: string;
  email?: string;
  query?: string;
};

export type CarrefourComercianteCatalogSyncRequest = {
  queries?: string[];
  maxPagesPerQuery?: number;
  itemsPerPage?: number;
};

export type CarrefourComercianteCatalogSyncResponse = {
  ok: boolean;
  snapshot: SourceCatalogSnapshotSummary | null;
  message: string;
};

export type PriceListInputItem = {
  rowNumber: number;
  business?: string;
  rubro?: string;
  segment?: string;
  subrubro?: string;
  line?: string;
  description?: string;
  code?: string;
  uxb?: string;
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
  storeType: "mayorista" | "minorista";
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

export type PriceListOwnPrice = {
  excelPrice: number | null;
  tokinPrice: number | null;
  selectedPrice: number | null;
  selectedSource: "tokin" | "excel" | null;
  excelVsTokinGapRatio: number | null;
};

export type PriceListItemResult = {
  input: PriceListInputItem;
  ownPrice?: PriceListOwnPrice;
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
  persistence?: PriceListPersistenceResult;
};

export type PriceListPersistenceResult = {
  enabled: boolean;
  requested?: boolean;
  saved?: boolean;
  runId?: string;
  errorMessage?: string;
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
  business: string | null;
  rubro: string | null;
  segment: string | null;
  subrubro: string | null;
  line: string | null;
  uxb: string | null;
  description: string | null;
  code: string | null;
  ean13Di: string | null;
  ean13Bu: string | null;
  currentPrice: number | null;
  ownPrice: PriceListOwnPrice | null;
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
  ownPrice: PriceListOwnPrice | null;
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
  business: string | null;
  rubro: string | null;
  segment: string | null;
  subrubro: string | null;
  line: string | null;
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
  syncStartedAt?: string | null;
  syncProgress?: CatalogSyncProgress | null;
  durationMs: number | null;
  productsCount: number;
  sources: SourceSearchStatus[];
  pendingSources: PendingSourceStatus[];
  errorMessage?: string;
};

export type CatalogSyncProgress = {
  phase:
    | "starting"
    | "full_page_sources"
    | "brands"
    | "categories"
    | "imports"
    | "persisting";
  current: string;
  completedSteps: number;
  totalSteps: number | null;
  productsFound: number;
  updatedAt: string;
};
