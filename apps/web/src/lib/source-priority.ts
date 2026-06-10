type SourceLike = {
  sourceId?: string | null;
  id?: string | null;
  storeName?: string | null;
};

const SOURCE_PRIORITY_RULES = [
  { priority: 1, terms: ["vital"] },
  {
    priority: 2,
    terms: ["maxi carrefour", "maxicarrefour", "maxiconsumo", "maxi consumo"],
  },
  { priority: 3, terms: ["carrefour"] },
  { priority: 4, terms: ["cheek"] },
  { priority: 5, terms: ["yaguar", "jaguar"] },
  { priority: 6, terms: ["cucher"] },
  { priority: 7, terms: ["revista"] },
] as const;

const DEFAULT_SOURCE_PRIORITY = 999;

export function compareSourcePriority(first: SourceLike, second: SourceLike) {
  return getSourcePriority(first) - getSourcePriority(second);
}

export function getSourcePriority(source: SourceLike) {
  const lookup = normalizeSourceLookup(
    `${source.sourceId ?? source.id ?? ""} ${source.storeName ?? ""}`,
  );

  for (const rule of SOURCE_PRIORITY_RULES) {
    if (rule.terms.some((term) => lookup.includes(normalizeSourceLookup(term)))) {
      return rule.priority;
    }
  }

  return DEFAULT_SOURCE_PRIORITY;
}

function normalizeSourceLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
