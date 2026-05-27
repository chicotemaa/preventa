import type { Page } from "playwright";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import {
  getDataOrigin,
  getSourceScope,
  getSourceUrl,
} from "./source-metadata.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";

export async function extractProductsWithSelectors(
  page: Page,
  source: ScrapingSource,
  query = "",
): Promise<ProductSearchResult[]> {
  if (!source.selectors) {
    return extractProductsAutomatically(page, source, query);
  }

  const cards = (await page.locator(source.selectors.productCard).all()).slice(
    0,
    source.maxCards ?? 30,
  );
  const results: ProductSearchResult[] = [];

  for (const card of cards) {
    const rawName = await getInnerText(card, source.selectors.name);
    const rawPrice = await getInnerText(card, source.selectors.price);
    const price = rawPrice ? normalizePrice(rawPrice) : null;

    if (!rawName || price === null) {
      continue;
    }

    const productUrl = source.selectors.link
      ? await getAttribute(card, source.selectors.link, "href", page.url())
      : null;
    const imageUrl = source.selectors.image
      ? await getImageUrl(card, source.selectors.image, page.url())
      : await getVariantImageUrl(card, page.url());

    results.push(
      createProductResult(source, query, rawName, price, productUrl, imageUrl),
    );
  }

  if (results.length > 0) {
    return results;
  }

  return extractProductsAutomatically(page, source, query);
}

export async function extractProductsAutomatically(
  page: Page,
  source: ScrapingSource,
  query = "",
): Promise<ProductSearchResult[]> {
  const candidates = await page.evaluate(() => {
    const pricePattern = /\$\s?\d[\d.,]*/;
    const elements = Array.from(
      document.querySelectorAll("article, li, div, section"),
    );

    return elements
      .map((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
        const priceMatch = text.match(pricePattern);

        if (!priceMatch || text.length < 8 || text.length > 600) {
          return null;
        }

        const image = element.querySelector("img");
        const link = element.querySelector("a");
        const name = text
          .replace(priceMatch[0], " ")
          .replace(/\s+/g, " ")
          .trim();

        return {
          name,
          price: priceMatch[0],
          imageUrl: image?.getAttribute("src") ?? null,
          productUrl: link?.getAttribute("href") ?? null,
        };
      })
      .filter(Boolean)
      .slice(0, 80);
  });

  return candidates
    .map((candidate) => {
      if (!candidate) {
        return null;
      }

      const price = normalizePrice(candidate.price);
      if (price === null) {
        return null;
      }

      return createProductResult(
        source,
        query,
        candidate.name,
        price,
        resolveUrl(candidate.productUrl, page.url()),
        resolveUrl(candidate.imageUrl, page.url()),
      );
    })
    .filter((result): result is ProductSearchResult => result !== null);
}

export async function extractProductsFromTextLines(
  page: Page,
  source: ScrapingSource,
  query = "",
): Promise<ProductSearchResult[]> {
  const candidates = await page.evaluate(() => {
    const pricePattern = /\$\s?\d[\d.,]*/g;
    const ignored = new Set([
      "ingresar",
      "registrarse",
      "registro mayoristas",
      "email:",
      "contraseña:",
      "nuestros productos!",
      "y muchos más...",
      "y muchos mas...",
    ]);
    const lines = (document.body.innerText ?? "")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    const results: Array<{
      name: string;
      price: string;
      productUrl: string | null;
      imageUrl: string | null;
    }> = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const matches = line.match(pricePattern);

      if (!matches) {
        continue;
      }

      const name = findPreviousProductLine(lines, index, ignored);

      if (!name) {
        continue;
      }

      results.push({
        name,
        price: matches[matches.length - 1],
        productUrl: null,
        imageUrl: null,
      });
    }

    return results;

    function findPreviousProductLine(
      linesToSearch: string[],
      priceLineIndex: number,
      ignoredLines: Set<string>,
    ) {
      for (let index = priceLineIndex - 1; index >= 0; index -= 1) {
        const candidate = linesToSearch[index];
        const normalizedCandidate = candidate.toLowerCase();

        if (
          candidate.includes("$") ||
          ignoredLines.has(normalizedCandidate) ||
          candidate.length < 4 ||
          candidate.length > 160 ||
          /^[\d\s.,%-]+$/.test(candidate)
        ) {
          continue;
        }

        return candidate;
      }

      return null;
    }
  });

  return candidates.map((candidate) =>
    createProductResult(
      source,
      query,
      candidate.name,
      normalizePrice(candidate.price) ?? 0,
      candidate.productUrl,
      candidate.imageUrl,
    ),
  ).filter((result) => result.price > 0);
}

export function createProductResult(
  source: ScrapingSource,
  query: string,
  rawName: string,
  price: number,
  productUrl: string | null,
  imageUrl: string | null,
): ProductSearchResult {
  return {
    sourceId: source.id,
    storeName: source.storeName,
    storeType: source.storeType,
    sourceUrl: getSourceUrl(source),
    dataOrigin: getDataOrigin(source),
    sourceScope: getSourceScope(source),
    sku: null,
    barcodes: [],
    rawName,
    normalizedName: normalizeProductName(rawName),
    price,
    currency: "ARS",
    productUrl,
    imageUrl,
    confidenceScore: calculateConfidenceScore(query, rawName),
  };
}

async function getInnerText(
  card: ReturnType<Page["locator"]>,
  selector: string,
) {
  const locator = card.locator(selector).first();

  try {
    const text = await locator.innerText({ timeout: 1500 });
    return text.replace(/\s+/g, " ").trim() || null;
  } catch {
    return null;
  }
}

async function getAttribute(
  card: ReturnType<Page["locator"]>,
  selector: string,
  attribute: string,
  baseUrl: string,
) {
  try {
    const value = await card.locator(selector).first().getAttribute(attribute, {
      timeout: 1500,
    });
    return resolveUrl(value, baseUrl);
  } catch {
    return null;
  }
}

async function getImageUrl(
  card: ReturnType<Page["locator"]>,
  selector: string,
  baseUrl: string,
) {
  const directImageUrl = await readImageAttribute(card, selector, baseUrl);

  if (directImageUrl) {
    return directImageUrl;
  }

  return getVariantImageUrl(card, baseUrl);
}

async function readImageAttribute(
  card: ReturnType<Page["locator"]>,
  selector: string,
  baseUrl: string,
) {
  try {
    const value = await card.locator(selector).first().evaluate((element) => {
      const image = element as HTMLImageElement;
      const srcset =
        image.getAttribute("data-srcset") ?? image.getAttribute("srcset");
      const firstSrcsetUrl = srcset?.split(",")[0]?.trim().split(/\s+/)[0];

      return (
        image.currentSrc ||
        image.getAttribute("data-src") ||
        firstSrcsetUrl ||
        image.getAttribute("src")
      );
    });

    if (!value || value.startsWith("data:image/")) {
      return null;
    }

    return resolveUrl(value, baseUrl);
  } catch {
    return null;
  }
}

async function getVariantImageUrl(
  card: ReturnType<Page["locator"]>,
  baseUrl: string,
) {
  try {
    const rawVariants = await card
      .locator("[data-variants]")
      .first()
      .getAttribute("data-variants", { timeout: 1500 });

    if (!rawVariants) {
      return null;
    }

    const variants = JSON.parse(rawVariants) as Array<{ image_url?: string }>;
    const imageUrl = variants.find((variant) => variant.image_url)?.image_url;
    return resolveUrl(imageUrl, baseUrl);
  } catch {
    return null;
  }
}

function resolveUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}
