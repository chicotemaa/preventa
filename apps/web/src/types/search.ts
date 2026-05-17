export type SearchRequest = {
  query: string;
};

export type ProductSearchResult = {
  sourceId: string;
  storeName: string;
  storeType: "mayorista" | "minorista";
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
  id: "nea";
  name: string;
  provinces: string[];
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
