import type {
  PriceListInputItem,
  PriceListPersistenceResult,
  PriceListResponse,
} from "@/types/search";

const PRICE_LIST_BATCH_SIZE = 10;

export type PriceListBatchProgress = {
  completedBatches: number;
  totalBatches: number;
  processedItems: number;
  totalItems: number;
};

export async function evaluatePriceListInBatches({
  items,
  persist,
  onProgress,
}: {
  items: PriceListInputItem[];
  persist: boolean;
  onProgress?: (progress: PriceListBatchProgress) => void;
}) {
  const startedAt = Date.now();
  const batches = chunkItems(items, PRICE_LIST_BATCH_SIZE);
  const responses: PriceListResponse[] = [];
  let processedItems = 0;

  onProgress?.({
    completedBatches: 0,
    totalBatches: batches.length,
    processedItems: 0,
    totalItems: items.length,
  });

  for (const [index, batch] of batches.entries()) {
    const response = await fetch("/api/price-list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: batch, persist: false }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error ??
          `No se pudo evaluar el lote ${index + 1} de ${batches.length}.`,
      );
    }

    responses.push(payload as PriceListResponse);
    processedItems += batch.length;
    onProgress?.({
      completedBatches: index + 1,
      totalBatches: batches.length,
      processedItems,
      totalItems: items.length,
    });
  }

  const mergedResponse = mergePriceListResponses(
    responses,
    items.length,
    Date.now() - startedAt,
  );

  if (persist) {
    mergedResponse.persistence = await saveMergedPriceList(mergedResponse);
  }

  return mergedResponse;
}

function chunkItems(items: PriceListInputItem[], batchSize: number) {
  const batches: PriceListInputItem[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

function mergePriceListResponses(
  responses: PriceListResponse[],
  itemsCount: number,
  durationMs: number,
): PriceListResponse {
  const results = responses
    .flatMap((response) => response.results)
    .sort((first, second) => first.input.rowNumber - second.input.rowNumber);
  const matchedCount = results.filter((result) => result.status === "matched").length;
  const fallbackResponse = responses[0];

  return {
    searchedAt: new Date().toISOString(),
    durationMs,
    itemsCount,
    matchedCount,
    unmatchedCount: itemsCount - matchedCount,
    sources: fallbackResponse?.sources ?? [],
    catalog: fallbackResponse?.catalog ?? {
      status: "empty",
      region: {
        id: "argentina",
        name: "Argentina",
        scopeLabel: "Nacional",
      },
      brands: [],
      lastSyncedAt: null,
      durationMs: null,
      productsCount: 0,
      sources: [],
      pendingSources: [],
    },
    results,
    persistence: {
      enabled: false,
      requested: false,
      saved: false,
    },
  };
}

async function saveMergedPriceList(response: PriceListResponse) {
  const saveResponse = await fetch("/api/price-list/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ response }),
  });
  const payload = (await saveResponse.json().catch(() => null)) as
    | { persistence?: PriceListPersistenceResult; error?: string }
    | null;

  if (!saveResponse.ok) {
    return {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage: payload?.error ?? "No se pudo guardar la lista para evolución.",
    };
  }

  return (
    payload?.persistence ?? {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage: "El guardado no devolvio estado.",
    }
  );
}
