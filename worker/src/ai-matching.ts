import { config } from "./config.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizeProductName } from "./normalizers.js";
import type { TargetBrand } from "./brands.js";
import type {
  PriceListAiMatchDiagnostic,
  PriceListInputItem,
  ProductSearchResult,
} from "./types.js";
import { getComparisonPrice } from "./unit-pricing.js";

export type AiMatchCandidate = {
  query: string;
  product: ProductSearchResult;
};

type AiMatchRequest = {
  item: PriceListInputItem;
  expectedBrand?: TargetBrand;
  candidates: AiMatchCandidate[];
};

type AiMatchDecision = {
  match: boolean;
  selectedCandidateId: string;
  confidenceScore: number;
  reason: string;
  warnings: string[];
};

type RankedAiCandidate = AiMatchCandidate & {
  candidateId: string;
  localScore: number;
};

export async function findAiAssistedProductMatch({
  item,
  expectedBrand,
  candidates,
}: AiMatchRequest): Promise<{
  product: ProductSearchResult | null;
  query: string | null;
  diagnostic: PriceListAiMatchDiagnostic;
}> {
  if (!config.aiMatching.enabled) {
    return {
      product: null,
      query: null,
      diagnostic: {
        status: "disabled",
        candidatesCount: 0,
        reason: "AI_MATCHING_ENABLED no esta activo.",
      },
    };
  }

  if (!config.aiMatching.apiKey) {
    return {
      product: null,
      query: null,
      diagnostic: {
        status: "disabled",
        candidatesCount: 0,
        reason: "OPENAI_API_KEY no esta configurada.",
      },
    };
  }

  const rankedCandidates = rankAiCandidates(item, expectedBrand, candidates);

  if (rankedCandidates.length === 0) {
    return {
      product: null,
      query: null,
      diagnostic: {
        status: "skipped",
        model: config.aiMatching.model,
        candidatesCount: 0,
        reason: "No hay candidatos utiles para evaluar con IA.",
      },
    };
  }

  try {
    const decision = await requestAiMatchDecision(
      item,
      expectedBrand,
      rankedCandidates,
    );
    const selectedCandidate = rankedCandidates.find(
      (candidate) => candidate.candidateId === decision.selectedCandidateId,
    );
    const accepted =
      decision.match &&
      selectedCandidate &&
      decision.confidenceScore >= config.aiMatching.minConfidence;

    if (!accepted) {
      return {
        product: null,
        query: null,
        diagnostic: {
          status: "rejected",
          model: config.aiMatching.model,
          candidatesCount: rankedCandidates.length,
          selectedProductName: selectedCandidate?.product.rawName ?? null,
          confidenceScore: normalizeAiConfidence(decision.confidenceScore),
          reason: decision.reason,
        },
      };
    }

    return {
      product: {
        ...selectedCandidate.product,
        confidenceScore: normalizeAiConfidence(decision.confidenceScore) ?? 0,
      },
      query: selectedCandidate.query,
      diagnostic: {
        status: "matched",
        model: config.aiMatching.model,
        candidatesCount: rankedCandidates.length,
        selectedProductName: selectedCandidate.product.rawName,
        confidenceScore: normalizeAiConfidence(decision.confidenceScore),
        reason: decision.reason,
      },
    };
  } catch (error) {
    return {
      product: null,
      query: null,
      diagnostic: {
        status: "failed",
        model: config.aiMatching.model,
        candidatesCount: rankedCandidates.length,
        errorMessage:
          error instanceof Error ? error.message : "Error ejecutando IA.",
      },
    };
  }
}

function rankAiCandidates(
  item: PriceListInputItem,
  expectedBrand: TargetBrand | undefined,
  candidates: AiMatchCandidate[],
) {
  const dedupedCandidates = new Map<string, AiMatchCandidate>();

  for (const candidate of candidates) {
    const key = [
      candidate.product.sourceId,
      candidate.product.normalizedName,
      candidate.product.price.toFixed(2),
      getComparisonPrice(candidate.product).toFixed(2),
    ].join("|");

    if (!dedupedCandidates.has(key)) {
      dedupedCandidates.set(key, candidate);
    }
  }

  return Array.from(dedupedCandidates.values())
    .map((candidate, index) => ({
      ...candidate,
      candidateId: `c${index + 1}`,
      localScore: scoreCandidateLocally(item, expectedBrand, candidate.product),
    }))
    .filter((candidate) => candidate.localScore >= 25)
    .sort((first, second) => {
      if (second.localScore !== first.localScore) {
        return second.localScore - first.localScore;
      }

      return getComparisonPrice(first.product) - getComparisonPrice(second.product);
    })
    .slice(0, config.aiMatching.maxCandidates);
}

function scoreCandidateLocally(
  item: PriceListInputItem,
  expectedBrand: TargetBrand | undefined,
  product: ProductSearchResult,
) {
  const itemText = [item.description, item.rubro].filter(Boolean).join(" ");
  const productText = [product.brand, product.category, product.rawName]
    .filter(Boolean)
    .join(" ");
  const textScore = Math.max(
    calculateConfidenceScore(item.description ?? "", productText),
    calculateConfidenceScore(itemText, productText),
  );
  const brandScore =
    expectedBrand && productLooksLikeBrand(product, expectedBrand) ? 18 : 0;
  const identifierScore = productHasInputIdentifier(item, product) ? 100 : 0;

  return Math.max(identifierScore, Math.min(100, textScore + brandScore));
}

function productLooksLikeBrand(product: ProductSearchResult, brand: TargetBrand) {
  const normalizedText = normalizeProductName(
    [product.brand, product.rawName].filter(Boolean).join(" "),
  );

  return brand.aliases.some((alias) => {
    const normalizedAlias = normalizeProductName(alias);

    if (!normalizedAlias) {
      return false;
    }

    return normalizedAlias.includes(" ")
      ? normalizedText.includes(normalizedAlias)
      : normalizedText.split(/\s+/).includes(normalizedAlias);
  });
}

function productHasInputIdentifier(
  item: PriceListInputItem,
  product: ProductSearchResult,
) {
  const itemIdentifiers = [item.ean13Di, item.ean13Bu, item.code]
    .map(cleanIdentifier)
    .filter(Boolean);
  const productIdentifiers = [product.sku, ...(product.barcodes ?? [])]
    .map(cleanIdentifier)
    .filter(Boolean);

  return itemIdentifiers.some((identifier) =>
    productIdentifiers.includes(identifier),
  );
}

async function requestAiMatchDecision(
  item: PriceListInputItem,
  expectedBrand: TargetBrand | undefined,
  candidates: RankedAiCandidate[],
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.aiMatching.timeoutMs,
  );

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      body: JSON.stringify({
        model: config.aiMatching.model,
        input: [
          {
            role: "system",
            content:
              "Sos un analista de matching de productos para una distribuidora. Devolves solo JSON. Acepta un match solo si es el mismo producto vendible: misma marca o linea, mismo tipo, sabor compatible y presentacion compatible. Si el Excel trae pack/bulto y el candidato es unidad del mismo producto, puede ser match. Rechaza marcas, sabores o presentaciones incompatibles.",
          },
          {
            role: "user",
            content: JSON.stringify({
              item: {
                rubro: item.rubro ?? null,
                description: item.description ?? null,
                code: item.code ?? null,
                ean13Di: item.ean13Di ?? null,
                ean13Bu: item.ean13Bu ?? null,
              },
              expectedBrand: expectedBrand?.name ?? null,
              candidates: candidates.map((candidate) => ({
                id: candidate.candidateId,
                query: candidate.query,
                localScore: candidate.localScore,
                productName: candidate.product.rawName,
                brand: candidate.product.brand ?? null,
                category: candidate.product.category ?? null,
                sku: candidate.product.sku ?? null,
                barcodes: candidate.product.barcodes ?? [],
                price: getComparisonPrice(candidate.product),
                packageLabel: candidate.product.packageLabel ?? null,
              })),
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "price_list_match_decision",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "match",
                "selectedCandidateId",
                "confidenceScore",
                "reason",
                "warnings",
              ],
              properties: {
                match: { type: "boolean" },
                selectedCandidateId: { type: "string" },
                confidenceScore: {
                  type: "number",
                  minimum: 0,
                  maximum: 100,
                },
                reason: { type: "string" },
                warnings: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
        },
        temperature: 0,
        max_output_tokens: 260,
      }),
      headers: {
        Authorization: `Bearer ${config.aiMatching.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new Error(getOpenAiErrorMessage(payload, response.status));
    }

    return parseAiMatchDecision(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiMatchDecision(payload: unknown): AiMatchDecision {
  const text = extractResponseText(payload);

  if (!text) {
    throw new Error("La IA no devolvio texto parseable.");
  }

  const parsed = JSON.parse(text) as Partial<AiMatchDecision>;

  if (
    typeof parsed.match !== "boolean" ||
    typeof parsed.selectedCandidateId !== "string" ||
    typeof parsed.confidenceScore !== "number" ||
    typeof parsed.reason !== "string" ||
    !Array.isArray(parsed.warnings)
  ) {
    throw new Error("La IA devolvio un JSON de matching incompleto.");
  }

  return {
    match: parsed.match,
    selectedCandidateId: parsed.selectedCandidateId,
    confidenceScore: parsed.confidenceScore,
    reason: parsed.reason,
    warnings: parsed.warnings.filter(
      (warning): warning is string => typeof warning === "string",
    ),
  };
}

function extractResponseText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ text?: string; type?: string }>;
    }>;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((text): text is string => typeof text === "string" && text.length > 0);
}

function getOpenAiErrorMessage(payload: unknown, status: number) {
  const errorPayload = payload as {
    error?: { message?: string };
  } | null;

  return errorPayload?.error?.message
    ? `OpenAI ${status}: ${errorPayload.error.message}`
    : `OpenAI respondio ${status}.`;
}

function normalizeAiConfidence(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null;
}

function cleanIdentifier(value: string | number | null | undefined) {
  const normalizedValue = String(value ?? "").replace(/\D/g, "");
  return normalizedValue && normalizedValue !== "0" ? normalizedValue : "";
}
