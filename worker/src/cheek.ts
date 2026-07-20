import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findAllowedBrand } from "./brands.js";
import { findCatalogCategory } from "./categories.js";
import { config } from "./config.js";
import { calculateConfidenceScore } from "./matching.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import type { ProductSearchResult, ScrapingSource } from "./types.js";

type OcrWord = {
  lineKey: string;
  wordNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
};

type OcrLine = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
};

export type CheekMagazineOffer = {
  name: string;
  price: number;
  page: number;
};

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_COMMAND_BUFFER = 24 * 1024 * 1024;
const MIN_OCR_CONFIDENCE = 18;
const USER_AGENT =
  "preventistas-mvp/0.1 (+https://preventa-web.vercel.app)";

export async function extractProductsFromCheekMagazine(
  source: ScrapingSource,
  query: string,
): Promise<ProductSearchResult[]> {
  const html = await fetchText(config.cheek.homeUrl, "text/html");
  const magazineUrl = extractCheekMagazineUrl(html, config.cheek.homeUrl);

  if (!magazineUrl) {
    throw new Error(
      "Cheek no publico una revista PDF reconocible en su sitio oficial.",
    );
  }

  const pdf = await fetchBinary(magazineUrl);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "cheek-magazine-"));

  try {
    const pdfPath = path.join(workDir, "revista.pdf");
    const imagePrefix = path.join(workDir, "pagina");
    await writeFile(pdfPath, pdf);
    await runCommand(
      "pdftoppm",
      [
        "-gray",
        "-jpeg",
        "-jpegopt",
        "quality=90",
        "-r",
        "220",
        pdfPath,
        imagePrefix,
      ],
      config.cheek.timeoutMs,
    );

    const imageFiles = (await readdir(workDir))
      .filter((fileName) => /^pagina-\d+\.jpg$/i.test(fileName))
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));

    if (imageFiles.length === 0) {
      throw new Error("No se pudieron renderizar las paginas de la revista Cheek.");
    }

    const offers: CheekMagazineOffer[] = [];
    const ocrTexts: string[] = [];

    for (const [index, imageFile] of imageFiles.entries()) {
      const pageNumber = index + 1;
      const imagePath = path.join(workDir, imageFile);

      if (pageNumber === 1) {
        ocrTexts.push(extractTsvText(await runTesseract(imagePath)));
      }

      const pageOcr = await extractPageColumns(
        imagePath,
        workDir,
        pageNumber,
      );

      for (const column of pageOcr) {
        ocrTexts.push(extractTsvText(column.nameTsv));
        const primaryOffers = parseCheekTsvPage(
          column.nameTsv,
          pageNumber,
          column.priceTsvs[0],
        );
        const fallbackOffers = parseCheekTsvPage(
          column.nameTsv,
          pageNumber,
          column.priceTsvs[1],
        ).filter(
          (offer) =>
            Boolean(findCatalogCategory(offer.name)) &&
            !primaryOffers.some((primaryOffer) =>
              offersDescribeSameProduct(primaryOffer, offer),
            ),
        );

        offers.push(...primaryOffers, ...fallbackOffers);
      }
    }

    const validity = extractCheekValidity(ocrTexts.join("\n"));
    const priceCondition = validity
      ? `Oferta revista Cheek · vigencia ${validity}`
      : "Oferta revista digital Cheek";

    return dedupeOffers(offers)
      .slice(0, source.maxCards ?? 400)
      .map((offer) => {
        const confidenceScore = query
          ? calculateConfidenceScore(query, offer.name)
          : 100;
        const brand = findAllowedBrand(offer.name)?.name;
        const category = findCatalogCategory(offer.name)?.name;

        return {
          sourceId: source.id,
          storeName: source.storeName,
          storeType: source.storeType,
          sourceUrl: source.sourceUrl ?? config.cheek.homeUrl,
          dataOrigin: source.dataOrigin,
          sourceScope: source.sourceScope,
          brand,
          category,
          rawName: offer.name,
          normalizedName: normalizeProductName(offer.name),
          price: offer.price,
          comparisonPrice: offer.price,
          priceCondition,
          packageQuantity: null,
          packageLabel: null,
          availability: "unknown" as const,
          currency: "ARS" as const,
          productUrl: `${magazineUrl}#page=${offer.page}`,
          imageUrl: null,
          confidenceScore,
        };
      });
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

export function extractCheekMagazineUrl(html: string, baseUrl: string) {
  const decodedHtml = html
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&");
  const absoluteMatch = decodedHtml.match(
    /https?:\/\/[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/i,
  )?.[0];

  if (absoluteMatch) {
    return absoluteMatch;
  }

  const relativeMatch = decodedHtml.match(
    /["']([^"']+\.pdf(?:\?[^"']*)?)["']/i,
  )?.[1];

  return relativeMatch ? new URL(relativeMatch, baseUrl).toString() : null;
}

export function parseCheekTsvPage(
  tsv: string,
  page: number,
  priceTsv = tsv,
): CheekMagazineOffer[] {
  const lines = buildOcrLines(tsv);
  const priceLines = buildOcrLines(priceTsv);

  if (lines.length === 0 || priceLines.length === 0) {
    return [];
  }

  const allLines = [...lines, ...priceLines];
  const pageWidth = Math.max(...allLines.map((line) => line.right), 1);
  const pageHeight = Math.max(...allLines.map((line) => line.bottom), 1);
  const offers: CheekMagazineOffer[] = [];

  for (const priceLine of priceLines) {
    for (const rawPrice of extractMagazinePriceCandidates(priceLine)) {
      const price = normalizeMagazinePrice(rawPrice);

      if (!price || price < 50 || price > 10_000_000) {
        continue;
      }

      const name = findOfferName(
        lines,
        priceLine,
        "",
        pageWidth,
        pageHeight,
      );

      if (!name) {
        continue;
      }

      offers.push({ name, price, page });
    }
  }

  return dedupeOffers(offers);
}

function extractMagazinePriceCandidates(line: OcrLine) {
  const withCurrency = [...line.text.matchAll(/\$\s*([0-9][0-9.,\s]*)/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));

  if (withCurrency.length > 0) {
    return withCurrency;
  }

  const lineHeight = line.bottom - line.top;
  const compactText = line.text.replace(/\s+/g, " ").trim();

  // Sobre fondos grises Tesseract puede perder el simbolo $, pero conserva el
  // numero grande. Exigimos altura de precio, separador de miles y ausencia de
  // unidades para no confundir presentaciones con importes.
  if (
    lineHeight < 32 ||
    compactText.length > 14 ||
    /\b(?:grs?|kg|cc|ml|lts?|uds?|unid|x)\b/i.test(compactText)
  ) {
    return [];
  }

  const match = compactText.match(/(?:^|\s)([0-9]{1,3}[.,][0-9]{3})(?:\s|$)/);
  const residue = match
    ? compactText.replace(match[0], "").replace(/[^a-z]/gi, "")
    : "";

  return match?.[1] && residue.length <= 2 ? [match[1]] : [];
}

function buildOcrLines(tsv: string): OcrLine[] {
  const words: OcrWord[] = [];

  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const fields = row.split("\t");

    if (fields.length < 12 || fields[0] !== "5") {
      continue;
    }

    const confidence = Number(fields[10]);
    const text = fields.slice(11).join("\t").trim();

    if (!text || !Number.isFinite(confidence) || confidence < MIN_OCR_CONFIDENCE) {
      continue;
    }

    const [page, block, paragraph, line] = fields.slice(1, 5);
    const left = Number(fields[6]);
    const top = Number(fields[7]);
    const width = Number(fields[8]);
    const height = Number(fields[9]);

    if (![left, top, width, height].every(Number.isFinite)) {
      continue;
    }

    words.push({
      lineKey: `${page}:${block}:${paragraph}:${line}`,
      wordNumber: Number(fields[5]) || 0,
      left,
      top,
      width,
      height,
      text,
    });
  }

  const grouped = new Map<string, OcrWord[]>();

  for (const word of words) {
    grouped.set(word.lineKey, [...(grouped.get(word.lineKey) ?? []), word]);
  }

  return [...grouped.values()]
    .map((lineWords) => {
      const orderedWords = [...lineWords].sort(
        (first, second) => first.wordNumber - second.wordNumber,
      );
      const left = Math.min(...orderedWords.map((word) => word.left));
      const top = Math.min(...orderedWords.map((word) => word.top));
      const right = Math.max(
        ...orderedWords.map((word) => word.left + word.width),
      );
      const bottom = Math.max(
        ...orderedWords.map((word) => word.top + word.height),
      );

      return {
        text: orderedWords.map((word) => word.text).join(" "),
        left,
        top,
        right,
        bottom,
        centerX: (left + right) / 2,
      };
    })
    .sort((first, second) => first.top - second.top || first.left - second.left);
}

function findOfferName(
  lines: OcrLine[],
  priceLine: OcrLine,
  prefix: string,
  pageWidth: number,
  pageHeight: number,
) {
  const maxCenterDistance = Math.max(pageWidth * 0.48, 85);
  const maxVerticalDistance = Math.max(pageHeight * 0.1, 130);
  const candidates = lines
    .filter((line) => {
      const verticalDistance = priceLine.top - line.bottom;
      return (
        verticalDistance >= -8 &&
        verticalDistance <= maxVerticalDistance &&
        Math.abs(line.centerX - priceLine.centerX) <= maxCenterDistance &&
        !line.text.includes("$") &&
        isUsefulProductText(line.text)
      );
    })
    .sort((first, second) => {
      const firstDistance = Math.max(0, priceLine.top - first.bottom);
      const secondDistance = Math.max(0, priceLine.top - second.bottom);
      return (
        firstDistance - secondDistance ||
        Math.abs(first.centerX - priceLine.centerX) -
          Math.abs(second.centerX - priceLine.centerX)
      );
    });

  const anchor = candidates[0];
  const selectedLines = anchor
    ? candidates
        .filter(
          (line) =>
            anchor.top - line.bottom <= Math.max(pageHeight * 0.045, 52) &&
            line.top <= anchor.top + 4 &&
            Math.abs(line.centerX - anchor.centerX) <=
              Math.max(pageWidth * 0.18, 60),
        )
        .slice(0, 3)
        .sort((first, second) => first.top - second.top)
        .map((line) => line.text)
    : [];

  const parts = [prefix, ...selectedLines].filter(isUsefulProductText);
  const name = cleanOfferName([...new Set(parts)].join(" "));

  return isUsefulProductText(name) ? name : null;
}

function cleanOfferName(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^a-zA-Z0-9ÁÉÍÓÚÜÑ]+/, "")
    .replace(/[^a-zA-Z0-9ÁÉÍÓÚÜÑ.,/+%()\-\s]+$/u, "")
    .trim();
}

function isUsefulProductText(value: string) {
  const normalized = normalizeProductName(value);

  if (normalized.length < 5 || !/[a-z]/i.test(normalized)) {
    return false;
  }

  return !/\b(cheek|ofertones|ofertas?|valida|vigencia|precio sujeto|exclusivo|sucursal|resistencia|saenz pena|whatsapp|naranja|visa|mastercard|mercado pago|cuotas?|descuento|transferencia|debito|efectivo|todos los dias|imagenes ilustrativas|almacen|desayuno|limpieza|bazar|electro|jardin)\b/i.test(
    normalized,
  );
}

function dedupeOffers(offers: CheekMagazineOffer[]) {
  const seen = new Set<string>();

  return offers.filter((offer) => {
    const key = `${normalizeProductName(offer.name)}|${offer.price.toFixed(2)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function offersDescribeSameProduct(
  first: CheekMagazineOffer,
  second: CheekMagazineOffer,
) {
  const firstName = normalizeProductName(first.name);
  const secondName = normalizeProductName(second.name);

  return (
    firstName === secondName ||
    calculateConfidenceScore(firstName, secondName) >= 85
  );
}

export function extractCheekValidity(value: string) {
  const normalized = value.replace(/\s+/g, " ");
  const match = normalized.match(
    /(?:desde\s+el\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}).{0,40}?(?:hasta\s+el\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  );

  return match?.[1] && match[2] ? `${match[1]} al ${match[2]}` : null;
}

function normalizeMagazinePrice(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(/[^0-9.,]/g, "");

  if (/^\d{1,3}[.,]\d{3}$/.test(cleaned)) {
    return Number(cleaned.replace(/[.,]/g, ""));
  }

  return normalizePrice(cleaned);
}

function extractTsvText(tsv: string) {
  return buildOcrLines(tsv)
    .map((line) => line.text)
    .join("\n");
}

async function runTesseract(imagePath: string) {
  const argumentsFor = (language: string) => [
    imagePath,
    "stdout",
    "-l",
    language,
    "--psm",
    "11",
    "tsv",
  ];

  try {
    return await runCommand(
      "tesseract",
      argumentsFor(config.cheek.ocrLanguage),
      Math.min(config.cheek.timeoutMs, 90_000),
    );
  } catch (error) {
    if (config.cheek.ocrLanguage === "eng") {
      throw error;
    }

    return runCommand(
      "tesseract",
      argumentsFor("eng"),
      Math.min(config.cheek.timeoutMs, 90_000),
    );
  }
}

async function extractPageColumns(
  imagePath: string,
  workDir: string,
  pageNumber: number,
) {
  const sizeOutput = await runCommand(
    "identify",
    ["-format", "%w %h", imagePath],
    15_000,
  );
  const [width, height] = sizeOutput.trim().split(/\s+/).map(Number);

  if (!width || !height) {
    throw new Error("No se pudo determinar el tamaño de una pagina Cheek.");
  }

  const columns = 6;
  const baseWidth = Math.ceil(width / columns);
  const overlap = Math.max(18, Math.round(width * 0.012));
  const results: Array<{ nameTsv: string; priceTsvs: string[] }> = [];

  for (let column = 0; column < columns; column += 1) {
    const left = Math.max(0, column * baseWidth - overlap);
    const right = Math.min(width, (column + 1) * baseWidth + overlap);
    const cropWidth = right - left;
    const suffix = `${String(pageNumber).padStart(2, "0")}-${column + 1}`;
    const columnPath = path.join(workDir, `columna-${suffix}.png`);
    const pricePath = path.join(workDir, `precios-${suffix}.png`);
    const alternatePricePath = path.join(
      workDir,
      `precios-alternativos-${suffix}.png`,
    );

    await runCommand(
      "convert",
      [imagePath, "-crop", `${cropWidth}x${height}+${left}+0`, "+repage", columnPath],
      30_000,
    );
    await runCommand(
      "convert",
      [columnPath, "-threshold", "86%", "-negate", pricePath],
      30_000,
    );
    await runCommand(
      "convert",
      [columnPath, "-threshold", "90%", "-negate", alternatePricePath],
      30_000,
    );

    const [nameTsv, priceTsv, alternatePriceTsv] = await Promise.all([
      runTesseract(columnPath),
      runTesseract(pricePath),
      runTesseract(alternatePricePath),
    ]);
    results.push({ nameTsv, priceTsvs: [priceTsv, alternatePriceTsv] });
  }

  return results;
}

async function fetchText(url: string, accept: string) {
  const response = await fetch(url, {
    headers: { accept, "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(Math.min(config.cheek.timeoutMs, 30_000)),
  });

  if (!response.ok) {
    throw new Error(`Cheek respondio ${response.status} al consultar ${url}.`);
  }

  return response.text();
}

async function fetchBinary(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/pdf", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(Math.min(config.cheek.timeoutMs, 60_000)),
  });

  if (!response.ok) {
    throw new Error(`La revista Cheek respondio ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES) {
    throw new Error("La revista Cheek supera el limite de 20 MB.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
    throw new Error("La revista Cheek esta vacia o supera el limite permitido.");
  }

  return buffer;
}

function runCommand(command: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: "utf8",
        maxBuffer: MAX_COMMAND_BUFFER,
        timeout: timeoutMs,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || error.message;
          reject(
            new Error(
              `No se pudo procesar la revista Cheek con ${command}: ${details}`,
            ),
          );
          return;
        }

        resolve(stdout);
      },
    );
  });
}
