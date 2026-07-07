import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeProductName } from "./normalizers.js";
import { config } from "./config.js";

const currentFilePath = fileURLToPath(import.meta.url);
const workerRoot = path.resolve(path.dirname(currentFilePath), "..");
const catalogSeedPath = path.resolve(workerRoot, "data/catalog-search-seeds.txt");

export async function loadCatalogSearchSeedTerms() {
  try {
    const raw = await readFile(catalogSeedPath, "utf8");
    const seen = new Set<string>();
    const terms: { searchTerm: string; normalizedSearchTerm: string }[] = [];

    for (const line of raw.split(/\r?\n/)) {
      const searchTerm = line.replace(/#.*/, "").trim();
      const normalizedSearchTerm = normalizeProductName(searchTerm);

      if (!searchTerm || !normalizedSearchTerm || seen.has(normalizedSearchTerm)) {
        continue;
      }

      seen.add(normalizedSearchTerm);
      terms.push({ searchTerm, normalizedSearchTerm });

      if (terms.length >= config.catalogSyncSeedMaxTerms) {
        break;
      }
    }

    return terms;
  } catch {
    return [];
  }
}
