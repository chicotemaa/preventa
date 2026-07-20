import type {
  PriceListReviewResponse,
  PriceListRunDetailResponse,
} from "@/types/search";
import { getProductMatchOverrides } from "./match-overrides";
import {
  getPriceListHistory,
  getPriceListRunDetail,
} from "./price-list-history";

export async function getPriceListReviewData(): Promise<PriceListReviewResponse> {
  const history = await getPriceListHistory();

  if (!history.enabled) {
    return {
      enabled: false,
      currentDetail: null,
      previousDetail: null,
      overrides: [],
    };
  }

  if (history.errorMessage) {
    return {
      enabled: true,
      currentDetail: null,
      previousDetail: null,
      overrides: [],
      errorMessage: history.errorMessage,
    };
  }

  const comparableRuns = history.runs.filter(
    (run) => typeof run.ownPriceCount === "number" && run.ownPriceCount > 0,
  );
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
