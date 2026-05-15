export function buildSearchUrl(template: string, query: string): string {
  return template.replaceAll("{query}", encodeURIComponent(query.trim()));
}
