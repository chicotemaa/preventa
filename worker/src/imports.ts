import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findAllowedBrand } from "./brands.js";
import { normalizePrice, normalizeProductName } from "./normalizers.js";
import type { ProductSearchResult, SourceSearchStatus, StoreType } from "./types.js";

const currentFilePath = fileURLToPath(import.meta.url);
const workerRoot = path.resolve(path.dirname(currentFilePath), "..");
const importsPath = path.resolve(workerRoot, "data/imports");

type ImportedCatalog = {
  products: ProductSearchResult[];
  statuses: SourceSearchStatus[];
};

type ImportedRow = Record<string, string>;

export async function loadImportedCatalogProducts(): Promise<ImportedCatalog> {
  const files = await listImportFiles();
  const products: ProductSearchResult[] = [];
  const sourceCounts = new Map<
    string,
    {
      storeName: string;
      sourceUrl: string | null;
      dataOrigin: string;
      sourceScope: string;
      count: number;
    }
  >();

  for (const fileName of files) {
    const filePath = path.join(importsPath, fileName);
    const rows = parseCsv(await readFile(filePath, "utf8"));

    for (const row of rows) {
      const product = rowToProduct(row);

      if (!product) {
        continue;
      }

      products.push(product);
      const current = sourceCounts.get(product.sourceId);

      sourceCounts.set(product.sourceId, {
        storeName: product.storeName,
        sourceUrl: product.sourceUrl ?? null,
        dataOrigin: product.dataOrigin ?? `CSV importado: ${product.storeName}`,
        sourceScope: product.sourceScope ?? "Lista importada",
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return {
    products,
    statuses: Array.from(sourceCounts.entries()).map(
      ([sourceId, source]) => ({
        sourceId,
        storeName: source.storeName,
        sourceUrl: source.sourceUrl,
        dataOrigin: source.dataOrigin,
        sourceScope: source.sourceScope,
        status: source.count > 0 ? "success" : "no_results",
        resultsCount: source.count,
        durationMs: 0,
      }),
    ),
  };
}

async function listImportFiles() {
  try {
    const entries = await readdir(importsPath);

    return entries.filter(
      (entry) =>
        entry.toLowerCase().endsWith(".csv") &&
        !entry.toLowerCase().endsWith(".example.csv"),
    );
  } catch {
    return [];
  }
}

function rowToProduct(row: ImportedRow): ProductSearchResult | null {
  const sourceId = readField(row, "sourceId", "source_id");
  const storeName = readField(row, "storeName", "store_name");
  const storeType = readField(row, "storeType", "store_type") as StoreType;
  const rawName = readField(row, "rawName", "name", "nombre", "producto");
  const rawPrice = readField(row, "price", "precio");

  if (!sourceId || !storeName || !rawName || !isStoreType(storeType)) {
    return null;
  }

  const price = normalizePrice(rawPrice);

  if (price === null) {
    return null;
  }

  const brandName = readField(row, "brand", "marca");
  const displayName =
    brandName && !normalizeProductName(rawName).includes(normalizeProductName(brandName))
      ? `${brandName} ${rawName}`
      : rawName;
  const brand = findAllowedBrand(displayName);

  if (!brand) {
    return null;
  }

  return {
    sourceId,
    storeName,
    storeType,
    sourceUrl: readField(row, "sourceUrl", "source_url") || null,
    dataOrigin:
      readField(row, "dataOrigin", "data_origin") ||
      `CSV importado: ${storeName}`,
    sourceScope:
      readField(row, "sourceScope", "source_scope") || "Lista importada",
    sku: readField(row, "sku", "codigo", "code") || null,
    barcodes: readField(row, "barcodes", "barcode", "ean", "ean13")
      .split(/[|;,]/)
      .map((value) => value.replace(/\D/g, ""))
      .filter((value) => /^\d{8,14}$/.test(value)),
    brand: brand.name,
    rawName: displayName,
    normalizedName: normalizeProductName(displayName),
    price,
    currency: "ARS",
    productUrl: readField(row, "productUrl", "product_url", "url") || null,
    imageUrl: readField(row, "imageUrl", "image_url", "imagen") || null,
    confidenceScore: 0,
  };
}

function readField(row: ImportedRow, ...names: string[]) {
  for (const name of names) {
    const value = row[name] ?? row[name.toLowerCase()];

    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function isStoreType(value: string): value is StoreType {
  return value === "mayorista" || value === "minorista";
}

function parseCsv(rawCsv: string): ImportedRow[] {
  const rows = parseCsvRows(rawCsv);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];

  return rows.map((row) =>
    headers.reduce<ImportedRow>((record, header, index) => {
      record[header] = row[index]?.trim() ?? "";
      record[header.toLowerCase()] = row[index]?.trim() ?? "";
      return record;
    }, {}),
  );
}

function parseCsvRows(rawCsv: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < rawCsv.length; index += 1) {
    const character = rawCsv[index];
    const nextCharacter = rawCsv[index + 1];

    if (character === '"' && nextCharacter === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}
