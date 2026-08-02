import assert from "node:assert/strict";
import test from "node:test";
import { repairLegacyText } from "./legacy-text";
import {
  getComparableEvolutionWholesaleSource,
  getEvolutionSourceIssue,
} from "./price-evolution-quality";
import type {
  PriceEvolutionPoint,
  PriceEvolutionProduct,
  PriceListSourcePrice,
} from "@/types/search";

test("repara descripciones historicas con UTF-8 interpretado como latin1", () => {
  assert.equal(repairLegacyText("BAÃ\u0091O REP AGUILA"), "BAÑO REP AGUILA");
  assert.equal(repairLegacyText("HOGAREÃ\u0091AS"), "HOGAREÑAS");
  assert.equal(repairLegacyText("ALFAJOR TATIN"), "ALFAJOR TATIN");
});

test("marca Tatin negro contra Tatin blanco como variante no comparable", () => {
  const product = createProduct();
  const source = createSource({
    storeName: "Cordiez",
    storeType: "minorista",
    productName: "Alfajor Triple Blanco Tatin 60 Gr",
    price: 870,
  });

  assert.deepEqual(getEvolutionSourceIssue(product, source), {
    kind: "variant_mismatch",
    label: "Variante distinta: negro vs blanco",
  });
});

test("excluye una presentacion mayorista incompatible del mejor precio", () => {
  const product = createProduct();
  const incompatible = createSource({
    storeName: "Mayorista incorrecto",
    storeType: "mayorista",
    productName: "Alfajor Triple Negro Tatin 33 Gr",
    price: 500,
  });
  const compatible = createSource({
    storeName: "Mayorista comparable",
    storeType: "mayorista",
    productName: "Alfajor Triple Negro Tatin 60 Gr",
    price: 800,
  });
  const point: PriceEvolutionPoint = {
    runId: "run-1",
    searchedAt: "2026-06-03T12:00:00.000Z",
    createdAt: "2026-06-03T12:00:00.000Z",
    araPrice: 900,
    ownPrice: null,
    referencePrice: 500,
    suggestedPrice: null,
    bestSourceName: incompatible.storeName,
    gapPercent: null,
    decisionLabel: "",
    sourcePrices: [incompatible, compatible],
  };

  assert.equal(
    getComparableEvolutionWholesaleSource(product, point)?.storeName,
    "Mayorista comparable",
  );
});

function createProduct(): PriceEvolutionProduct {
  return {
    productKey: "code:1004056",
    description: "ALF. TATIN TRIPLE NEGRO * 60 GR",
    business: null,
    rubro: "CHOCOLATES ARCOR J.V.",
    segment: null,
    subrubro: null,
    line: null,
    code: "1004056",
    ean13Di: "7790040405608",
    ean13Bu: null,
    points: [],
    sourceNames: [],
  };
}

function createSource({
  storeName,
  storeType,
  productName,
  price,
}: {
  storeName: string;
  storeType: "mayorista" | "minorista";
  productName: string;
  price: number;
}): PriceListSourcePrice {
  return {
    sourceId: storeName.toLowerCase().replace(/\s+/g, "-"),
    storeName,
    storeType,
    price,
    comparisonPrice: price,
    currency: "ARS",
    productName,
    productUrl: null,
    confidenceScore: 80,
  };
}
