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
];

export function findAllowedBrand(productName: string) {
  const normalizedProductName = normalizeProductName(productName);

  return targetBrands.find((brand) =>
    brand.aliases.some((alias) =>
      normalizedProductName.includes(normalizeProductName(alias)),
    ),
  );
}

export function isAllowedBrandProduct(productName: string) {
  return Boolean(findAllowedBrand(productName)) && !isExcludedProductName(productName);
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
