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

const extraCatalogSearchTerms = [
  "alfajores",
  "chupetines",
  "bombones",
  "chocolinas",
  "hamlet",
  "criollitas",
  "mana",
  "top line",
  "traviata",
  "rumba",
  "serranitas",
  "sonrisas",
  "aguila",
  "alfajor",
  "arcor",
  "bagley",
  "bon o bon",
  "caramelos",
  "chocolate",
  "cofler",
  "galletitas",
  "hogarenas",
  "jugo en polvo",
  "la campagnola",
  "lia",
  "mayonesa",
  "mermelada",
  "mogul",
  "rocklets",
  "saladix",
  "tatin",
  "tofi",
  "caramelos de goma",
  "tabletas",
  "mermeladas",
  "nutricion",
  "masticables",
  "dulces rellenas",
  "linea hogar",
  "helados hogar",
  "extrudados",
  "conservas de tomate",
  "caramelos duros",
  "helados impulso",
  "jugos en polvo",
  "galletas dulces secas",
  "bocaditos y bombones",
  "duros agrupados",
  "macizos",
  "obleas banadas",
  "chicles plegados",
  "bebidas",
  "dulces solidos",
  "premezclas chicas",
  "sabores",
  "caramelos de leche",
  "conservas vegetales",
  "confites y mani banado",
  "linea infantil",
  "snacks de copetin",
  "conservas de pescado",
  "pastas secas",
  "snacks horneados",
  "inhalantes",
  "mermeladas frasco la campagnol",
  "chocolate taza",
  "impulso joven adulto",
  "barras de cereal",
  "crackers sandwich",
  "jugo en polvo arcor",
  "chicle plegado sin azucar",
  "hierbas y especias",
  "jugo en polvo bc",
  "premezclas sin gluten",
  "ramen",
  "mogul granel hogar",
  "confitados",
  "galletitas cereales",
  "chocolates aireados",
  "potes",
  "aderezos",
  "crackers agua",
  "mermelada frasco noel",
  "polenta",
  "barras adultos",
  "colados de leche",
  "mermeladas en frasco",
  "atun la campagnola",
  "bebida bc",
  "rellenos",
  "agrupados",
  "pastas secas arcor",
  "pastas secas la campagnola",
  "premezclas horneables",
  "salsas la campagnola",
  "masticables confitados",
  "candy bar",
  "mogul granel impulso",
  "turron oblea",
  "chupetin evolution",
  "impulso infantil",
  "jugos en polvo noel",
  "masticables de valor",
  "mogul individual",
  "cofler aireado",
  "bebidas de jugo",
  "colados duros",
  "duros",
  "figuras de chocolates",
  "tabletas rellenas",
  "tomates la campagnola",
  "banos de reposteria",
  "chicles confitados",
  "mini torta",
  "porcionados",
  "rellenos de reposteria",
  "tomates masivos",
  "formis",
  "gelatinas",
  "harina de maiz precocida",
  "saladix horneados",
  "alfajor bon o bon",
  "especias",
  "top line seven",
  "bizcochuelos",
  "hogarenas cereal",
  "postres",
  "postres y mousse",
  "salsas",
  "cereales para desayuno",
  "cofler macizo hogar",
  "colados leche arcor impulso",
  "frutas con chocolate",
  "mogul infantiles",
  "salsas noel",
  "tomates premium",
  "obleas",
  "dulce de batata",
  "nutricion deportiva",
  "otras conserv vegetales la cam",
  "palitos",
  "papas fritas",
  "polvorita",
  "pure de tomate la campagnola",
  "rocklets impulso",
  "sapito",
  "traviata sabores",
  "bombones bon o bon hogar",
  "cacao en polvo",
  "extrudados impulso",
  "formis paquete",
  "mast mogul valor impulso",
  "mermelada frasco bc",
  "mermeladas fco la campagnola",
  "palitos indulgentes",
  "alfajor tofi",
  "atun noel",
  "caballa la campagnola",
  "cereal mix",
  "cookies",
  "galletas banadas",
  "inhalantes alka",
  "ketchup la campagnola",
  "masticables paquete",
  "surtidas",
  "tostadas",
  "arcor cereal mix individual",
  "extrudados hogar",
];

export function buildCatalogCategorySearchTerms() {
  const terms = [
    ...catalogCategories.flatMap((category) => category.searchTerms),
    ...extraCatalogSearchTerms,
  ];

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
