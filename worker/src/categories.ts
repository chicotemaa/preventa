import {
  expandCommonProductAbbreviations,
  normalizeProductName,
} from "./normalizers.js";

export type CatalogCategory = {
  name: string;
  searchTerms: string[];
  aliases: string[];
};

export const catalogCategories: CatalogCategory[] = [
  {
    name: "Alfajores",
    searchTerms: ["alfajor"],
    aliases: ["alfajor", "alfajores", "alf"],
  },
  {
    name: "Chocolates",
    searchTerms: ["chocolate"],
    aliases: ["chocolate", "chocolates", "choc", "tableta"],
  },
  {
    name: "Galletitas",
    searchTerms: ["galletitas"],
    aliases: ["galletitas", "galleta", "galletas", "gall"],
  },
  {
    name: "Golosinas",
    searchTerms: ["golosinas", "caramelos"],
    aliases: [
      "golosinas",
      "caramelo",
      "caramelos",
      "gomitas",
      "chupetin",
      "chupetines",
      "turron",
      "bombon",
      "bombones",
    ],
  },
  {
    name: "Jugos en polvo",
    searchTerms: ["jugo polvo"],
    aliases: ["jugo en polvo", "jugo polvo", "jugo pv", "pv", "sobres"],
  },
  {
    name: "Jugos listos",
    searchTerms: ["jugo listo"],
    aliases: ["jugo listo", "listo", "bebida", "brick"],
  },
  {
    name: "Mermeladas",
    searchTerms: ["mermelada"],
    aliases: ["mermelada", "mermeladas", "merm", "merme"],
  },
  {
    name: "Salsas y aderezos",
    searchTerms: ["salsa", "mayonesa"],
    aliases: ["salsa", "salsas", "mayonesa", "ketchup", "aderezo", "aderezos"],
  },
  {
    name: "Harinas y premezclas",
    searchTerms: ["harina", "premezcla"],
    aliases: ["harina", "harinas", "premezcla", "premezclas"],
  },
  {
    name: "Cereales y barritas",
    searchTerms: ["cereal mix", "barrita cereal"],
    aliases: ["cereal", "cereales", "barrita", "barritas", "cereal mix"],
  },
  {
    name: "Lacteos",
    searchTerms: ["leche", "yogur", "dulce de leche"],
    aliases: ["leche", "lacteos", "lacteo", "yogur", "yogurt", "dulce de leche"],
  },
];

export function buildCatalogCategorySearchTerms() {
  const terms = catalogCategories.flatMap((category) => category.searchTerms);

  return Array.from(new Set(terms.map(normalizeCategoryText).filter(Boolean)));
}

export function findCatalogCategory(value: string | null | undefined) {
  const normalizedValue = normalizeCategoryText(value ?? "");

  if (!normalizedValue) {
    return null;
  }

  return catalogCategories.find((category) =>
    category.aliases.some((alias) =>
      categoryAliasMatches(normalizedValue, normalizeCategoryText(alias)),
    ),
  ) ?? null;
}

export function getCategorySearchTermsForText(value: string | null | undefined) {
  const category = findCatalogCategory(value);
  const normalizedValue = normalizeCategoryText(value ?? "");

  if (!category) {
    return [];
  }

  const searchTerms = category.searchTerms.map(normalizeCategoryText);
  const directTerms = searchTerms.filter((term) =>
    categoryAliasMatches(normalizedValue, term),
  );

  return Array.from(new Set([...directTerms, ...searchTerms]));
}

function categoryAliasMatches(normalizedValue: string, normalizedAlias: string) {
  if (!normalizedAlias) {
    return false;
  }

  if (normalizedAlias.includes(" ")) {
    return normalizedValue.includes(normalizedAlias);
  }

  return normalizedValue.split(/\s+/).includes(normalizedAlias);
}

function normalizeCategoryText(value: string) {
  return normalizeProductName(
    expandCommonProductAbbreviations(value.replace(/[./_-]+/g, " ")),
  );
}
