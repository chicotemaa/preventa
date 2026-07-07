import { normalizeProductName } from "./normalizers.js";

export type TargetBrand = {
  name: string;
  searchTerms: string[];
  aliases: string[];
};

export const targetBrands: TargetBrand[] = [
  {
    name: "Bon o Bon",
    searchTerms: ["bon o bon", "bonobon"],
    aliases: ["bon o bon", "bonobon", "bon-o-bon"],
  },
  { name: "Cofler", searchTerms: ["cofler"], aliases: ["cofler"] },
  { name: "Bagley", searchTerms: ["bagley"], aliases: ["bagley"] },
  { name: "Arcor", searchTerms: ["arcor"], aliases: ["arcor"] },
  { name: "Topline", searchTerms: ["topline"], aliases: ["topline", "top line"] },
  { name: "Mogul", searchTerms: ["mogul"], aliases: ["mogul"] },
  { name: "Tofi", searchTerms: ["tofi"], aliases: ["tofi"] },
  { name: "Aguila", searchTerms: ["aguila"], aliases: ["aguila", "águila"] },
  { name: "Rocklets", searchTerms: ["rocklets"], aliases: ["rocklets", "rocklet"] },
  {
    name: "Tortuguita",
    searchTerms: ["tortuguita"],
    aliases: ["tortuguita", "tortuguitas"],
  },
  { name: "Cabsha", searchTerms: ["cabsha"], aliases: ["cabsha"] },
  {
    name: "Simple",
    searchTerms: ["arcor bago simple"],
    aliases: [
      "simple vitalidad",
      "simple fibra",
      "simple calcio",
      "simple dieta",
      "simple proteina",
      "simple proteína",
      "arcor bago simple",
    ],
  },
  {
    name: "La Serenisima",
    searchTerms: ["la serenisima", "serenisima"],
    aliases: ["la serenisima", "la serenísima", "serenisima", "serenísima"],
  },
  { name: "Tatin", searchTerms: ["tatin"], aliases: ["tatin"] },
  {
    name: "Cereal Mix",
    searchTerms: ["cereal mix"],
    aliases: ["cereal mix"],
  },
  {
    name: "La Campagnola",
    searchTerms: ["la campagnola", "campagnola"],
    aliases: ["la campagnola", "campagnola"],
  },
  {
    name: "BC",
    searchTerms: ["bc la campagnola", "bc"],
    aliases: ["bc"],
  },
  {
    name: "Mister Pops",
    searchTerms: ["mister pops", "mr pops"],
    aliases: ["mister pops", "mr pops"],
  },
  {
    name: "Menthoplus",
    searchTerms: ["menthoplus", "mentho plus"],
    aliases: ["menthoplus", "mentho plus"],
  },
  {
    name: "Butter Toffees",
    searchTerms: ["butter toffees", "butter toffi"],
    aliases: ["butter toffees", "butter toffi"],
  },
  { name: "Saladix", searchTerms: ["saladix"], aliases: ["saladix"] },
  {
    name: "Serranitas",
    searchTerms: ["serranitas"],
    aliases: ["serranitas"],
  },
  { name: "Mana", searchTerms: ["mana bagley"], aliases: ["mana"] },
  {
    name: "Hogarenas",
    searchTerms: ["hogarenas", "hogareñas"],
    aliases: ["hogarenas", "hogareñas"],
  },
  {
    name: "Criollitas",
    searchTerms: ["criollitas"],
    aliases: ["criollitas"],
  },
  { name: "Traviata", searchTerms: ["traviata"], aliases: ["traviata"] },
  {
    name: "Merengadas",
    searchTerms: ["merengadas"],
    aliases: ["merengadas"],
  },
  { name: "Rumba", searchTerms: ["rumba"], aliases: ["rumba"] },
  { name: "Sonrisas", searchTerms: ["sonrisas"], aliases: ["sonrisas"] },
  { name: "Chocolinas", searchTerms: ["chocolinas"], aliases: ["chocolinas"] },
  { name: "Opera", searchTerms: ["opera bagley"], aliases: ["opera"] },
  { name: "Kesitas", searchTerms: ["kesitas"], aliases: ["kesitas"] },
  { name: "Rex", searchTerms: ["rex bagley"], aliases: ["rex"] },
];

export function findAllowedBrand(productName: string) {
  return targetBrands.find((brand) => productMatchesTargetBrand(productName, brand));
}

export function productMatchesTargetBrand(
  productName: string,
  brand: TargetBrand,
) {
  const normalizedProductName = normalizeProductName(productName);

  return brand.aliases.some((alias) =>
    productNameMatchesAlias(normalizedProductName, normalizeProductName(alias)),
  );
}

export function isAllowedBrandProduct(productName: string) {
  return Boolean(productName.trim()) && !isExcludedProductName(productName);
}

function productNameMatchesAlias(
  normalizedProductName: string,
  normalizedAlias: string,
) {
  if (!normalizedAlias) {
    return false;
  }

  if (normalizedAlias.includes(" ")) {
    return normalizedProductName.includes(normalizedAlias);
  }

  return normalizedProductName.split(/\s+/).includes(normalizedAlias);
}

function isExcludedProductName(productName: string) {
  const normalizedProductName = normalizeProductName(productName);
  const excludedTerms = [
    "molde",
    "silicona",
    "portavela",
    "vela",
    "flores",
    "utensilio",
    "cortante",
    "stencil",
    "bolsa regalo",
    "adorno",
  ];

  return excludedTerms.some((term) => normalizedProductName.includes(term));
}
