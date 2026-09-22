import type {
  PriceListReviewResponse,
  PriceListRunDetailResponse,
} from "@/types/search";
import { getProductMatchOverrides } from "./match-overrides";
import { getActiveEvaluationIds } from "./commercial-reference-data";
import { isSupabaseConfigured } from "./supabase-admin";
import {
  getPriceListRunDetail,
} from "./price-list-history";

export async function getPriceListReviewData(): Promise<PriceListReviewResponse> {
  if (!isSupabaseConfigured()) {
    return {
      enabled: false,
      currentDetail: null,
      previousDetail: null,
      overrides: [],
    };
  }

  let comparableRuns: Array<{ id: string }>;
  try {
    comparableRuns = await getActiveEvaluationIds();
  } catch {
    return {
      enabled: true,
      currentDetail: null,
      previousDetail: null,
      overrides: [],
      errorMessage: "No se pudo cargar la ultima evaluacion Excel.",
    };
  }

  const currentRun = comparableRuns[0] ?? null;
  const previousRun = comparableRuns[1] ?? null;
  const [currentResponse, previousResponse, overridesResponse] = await Promise.all([
    currentRun
      ? getPriceListRunDetail(currentRun.id)
      : Promise.resolve<PriceListRunDetailResponse>({
          enabled: true,
          detail: null,
        }),
    previousRun
      ? getPriceListRunDetail(previousRun.id)
      : Promise.resolve<PriceListRunDetailResponse>({
          enabled: true,
          detail: null,
        }),
    getProductMatchOverrides(),
  ]);

  return {
    enabled: true,
    currentDetail: currentResponse.detail,
    previousDetail: previousResponse.detail,
    overrides: overridesResponse.overrides,
    migrationRequired: overridesResponse.migrationRequired,
    errorMessage:
      currentResponse.errorMessage ??
      previousResponse.errorMessage ??
      (overridesResponse.migrationRequired
        ? undefined
        : overridesResponse.errorMessage),
  };
}
