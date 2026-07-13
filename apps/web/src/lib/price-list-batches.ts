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

type PriceListApiPayload =
  | PriceListResponse
  | { persistence?: PriceListPersistenceResult; error?: string }
  | { error?: string; rawText?: string }
  | null;

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
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getPayloadError(payload) ??
          buildInvalidResponseMessage(
            index + 1,
            batches.length,
            getRawResponseText(payload),
          ),
      );
    }

    if (!isPriceListResponse(payload)) {
      throw new Error(
        buildInvalidResponseMessage(
          index + 1,
          batches.length,
          getRawResponseText(payload),
        ),
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
  const payload = await readJsonResponse(saveResponse);

  if (!saveResponse.ok) {
    return {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage:
        getPayloadError(payload) ?? "No se pudo guardar la lista para evolución.",
    };
  }

  return (
    getPayloadPersistence(payload) ?? {
      enabled: true,
      requested: true,
      saved: false,
      errorMessage: "El guardado no devolvio estado.",
    }
  );
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as PriceListApiPayload;
  } catch {
    return { rawText: text };
  }
}

function getPayloadError(payload: PriceListApiPayload) {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : null;
}

function getRawResponseText(payload: PriceListApiPayload) {
  return payload &&
    typeof payload === "object" &&
    "rawText" in payload &&
    typeof payload.rawText === "string"
    ? payload.rawText
    : undefined;
}

function getPayloadPersistence(payload: PriceListApiPayload) {
  return payload &&
    typeof payload === "object" &&
    "persistence" in payload
    ? payload.persistence
    : null;
}

function isPriceListResponse(value: unknown): value is PriceListResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<PriceListResponse>;
  return (
    typeof response.searchedAt === "string" &&
    typeof response.durationMs === "number" &&
    typeof response.itemsCount === "number" &&
    typeof response.matchedCount === "number" &&
    typeof response.unmatchedCount === "number" &&
    Array.isArray(response.sources) &&
    Array.isArray(response.results) &&
    Boolean(response.catalog)
  );
}

function buildInvalidResponseMessage(
  batchNumber: number,
  totalBatches: number,
  rawText?: string,
) {
  const preview = rawText?.replace(/\s+/g, " ").trim().slice(0, 120);

  return [
    `El servidor devolvio una respuesta no valida en el lote ${batchNumber}/${totalBatches}.`,
    preview ? `Respuesta recibida: ${preview}` : null,
    "Reintentá la importación; si se repite, el worker o Vercel está cortando ese lote.",
  ]
    .filter(Boolean)
    .join(" ");
}
