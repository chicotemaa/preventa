import { normalizeProductName, normalizeQuery } from "./normalizers.js";

export function calculateConfidenceScore(
  query: string,
  productName: string,
): number {
  const normalizedQuery = normalizeQuery(query);
  const normalizedName = normalizeProductName(productName);

  if (!normalizedQuery || !normalizedName) {
    return 0;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 100;
  }

  if (compact(normalizedName).includes(compact(normalizedQuery))) {
    return 95;
  }

  const queryTokens = tokenize(normalizedQuery);
  const nameTokens = tokenize(normalizedName);

  if (queryTokens.length === 0 || nameTokens.length === 0) {
    return 0;
  }

  const matchedTokens = queryTokens.filter((queryToken) =>
    nameTokens.some((nameToken) => tokensMatch(queryToken, nameToken)),
  );

  const tokenScore = (matchedTokens.length / queryTokens.length) * 80;
  const orderScore = calculateOrderScore(queryTokens, nameTokens);
  const compactScore =
    compact(normalizedName).includes(compact(normalizedQuery)) ||
    compact(normalizedQuery).includes(compact(normalizedName))
      ? 10
      : 0;

  return Math.min(100, Math.round(tokenScore + orderScore + compactScore));
}

function tokenize(value: string) {
  const stopWords = new Set(["a", "o", "y", "de", "del", "la", "el"]);

  return value
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function calculateOrderScore(queryTokens: string[], nameTokens: string[]) {
  let previousIndex = -1;
  let orderedMatches = 0;

  for (const token of queryTokens) {
    const index = nameTokens.findIndex(
      (nameToken, currentIndex) =>
        currentIndex > previousIndex &&
        tokensMatch(token, nameToken),
    );

    if (index > previousIndex) {
      orderedMatches += 1;
      previousIndex = index;
    }
  }

  return (orderedMatches / queryTokens.length) * 10;
}

function tokensMatch(queryToken: string, nameToken: string) {
  if (nameToken === queryToken) {
    return true;
  }

  if (queryToken.length <= 3 || nameToken.length <= 3) {
    return false;
  }

  return nameToken.includes(queryToken) || queryToken.includes(nameToken);
}
