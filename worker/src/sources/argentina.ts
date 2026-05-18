import type { ScrapingSource } from "../types.js";

export const scrapingSources: ScrapingSource[] = [
  {
    id: "carrefour-argentina-vtex",
    storeName: "Carrefour Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.carrefour.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de Carrefour Argentina",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://www.carrefour.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
    requiresJavascript: false,
  },
  {
    id: "jumbo-argentina-vtex",
    storeName: "Jumbo Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.jumbo.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de Jumbo Argentina",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://www.jumbo.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
    requiresJavascript: false,
  },
  {
    id: "disco-argentina-vtex",
    storeName: "Disco Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.disco.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de Disco Argentina",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://www.disco.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
    requiresJavascript: false,
  },
  {
    id: "vea-argentina-vtex",
    storeName: "Vea Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.vea.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de Vea Argentina",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://www.vea.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
    requiresJavascript: false,
  },
  {
    id: "dia-argentina-vtex",
    storeName: "DIA Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://diaonline.supermercadosdia.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de DIA Online Argentina",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
    requiresJavascript: false,
  },
  {
    id: "maxiconsumo-web-moreno",
    storeName: "Maxiconsumo Web",
    storeType: "mayorista",
    city: "Argentina",
    sourceUrl: "https://maxiconsumo.com/",
    dataOrigin:
      "HTML del catalogo publico de Maxiconsumo, sucursal web Moreno como referencia",
    sourceScope: "Argentina con sucursal de referencia Moreno",
    searchUrlTemplate:
      "https://maxiconsumo.com/sucursal_moreno/catalogsearch/result/?q={query}",
    requiresJavascript: false,
    selectors: {
      productCard: "li.product-item",
      name: "a.product-item-link",
      price: ".price-box.highest .price, .price-box .price",
      image: ".product-item-photo img",
      link: "a.product-item-link",
    },
  },
  {
    id: "vital-online",
    storeName: "Supermayorista Vital Online",
    storeType: "mayorista",
    city: "Argentina",
    sourceUrl: "https://tiendaonline.vital.com.ar/",
    dataOrigin: "Tienda online Vital",
    sourceScope: "Argentina",
    searchUrlTemplate: "https://tiendaonline.vital.com.ar/search?text={query}",
    requiresJavascript: true,
    enabled: false,
    disabledKind: "requires_login",
    disabledReason:
      "La tienda online requiere autenticacion para consultar catalogo y precios.",
  },
];
