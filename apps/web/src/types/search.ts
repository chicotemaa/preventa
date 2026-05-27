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
