import type { ScrapingSource } from "./types.js";

export function getSourceUrl(source: ScrapingSource) {
  if (source.sourceUrl) {
    return source.sourceUrl;
  }

  try {
    const url = new URL(source.searchUrlTemplate.replace("{query}", ""));
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function getDataOrigin(source: ScrapingSource) {
  return source.dataOrigin ?? `Catalogo publico de ${source.storeName}`;
}

export function getSourceScope(source: ScrapingSource) {
  return source.sourceScope ?? source.city;
}
