import { config } from "../config.js";
import type { ScrapingSource } from "../types.js";

const hasTokinCredentials = Boolean(config.tokin.email && config.tokin.password);
const isTokinEnabled = config.tokin.enabled && hasTokinCredentials;
const maxiconsumoEmail = config.maxiconsumo.email ?? config.tokin.email;
const hasMaxiconsumoChacoCredentials = Boolean(
  maxiconsumoEmail && config.maxiconsumo.password,
);
const isMaxiconsumoChacoEnabled =
  config.maxiconsumo.enabled && hasMaxiconsumoChacoCredentials;
const yaguarEmail = config.yaguar.email ?? config.tokin.email;
const yaguarPassword = config.yaguar.password ?? config.tokin.password;
const hasYaguarCredentials = Boolean(yaguarEmail && yaguarPassword);
const isYaguarEnabled = config.yaguar.enabled && hasYaguarCredentials;

export const scrapingSources: ScrapingSource[] = [
  {
    id: "carrefour-argentina-vtex",
    storeName: "Carrefour Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.carrefour.com.ar/",
    dataOrigin:
      "API VTEX del catalogo de Carrefour Argentina; intenta sesion con credenciales configuradas y usa API publica como respaldo",
    sourceScope: "Argentina",
    sourceKind: "carrefour_vtex_auth",
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
    dataOrigin:
      "API VTEX del catalogo de Vea Argentina; intenta sesion con credenciales configuradas y usa API publica como respaldo",
    sourceScope: "Argentina",
    sourceKind: "vea_vtex_auth",
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
    id: "laanonima-argentina-html",
    storeName: "La Anonima Supermercado",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.laanonima.com.ar/supermercado/",
    dataOrigin:
      "HTML publico del buscador de La Anonima Supermercado; lee tarjetas con data-precio y data-nombre",
    sourceScope: "Argentina",
    sourceKind: "laanonima_html",
    searchUrlTemplate: "https://www.laanonima.com.ar/buscar/{query}",
    requiresJavascript: false,
    maxCards: 100,
  },
  {
    id: "masonline-changomas-vtex",
    storeName: "MasOnline / ChangoMas",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.masonline.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de MasOnline / ChangoMas",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://www.masonline.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
    requiresJavascript: false,
  },
  {
    id: "cordiez-argentina-vtex",
    storeName: "Cordiez",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.cordiez.com.ar/",
    dataOrigin: "API publica VTEX del catalogo de Cordiez",
    sourceScope: "Argentina",
    sourceKind: "vtex_api",
    searchUrlTemplate:
      "https://www.cordiez.com.ar/api/catalog_system/pub/products/search?ft={query}&_from=0&_to=24",
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
    sourceKind: "static_html",
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
    id: "maxiconsumo-chaco-auth",
    storeName: "Maxiconsumo Chaco",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://maxiconsumo.com/sucursal_chaco/",
    dataOrigin:
      "Catalogo web de Maxiconsumo sucursal Chaco; intenta sesion autorizada y usa HTML publico de Chaco si el login no responde",
    sourceScope: "NEA: Resistencia, Chaco",
    sourceKind: "maxiconsumo_auth",
    searchUrlTemplate:
      "https://maxiconsumo.com/sucursal_chaco/catalogsearch/result/?q={query}",
    requiresJavascript: true,
    maxCards: 40,
    enabled: isMaxiconsumoChacoEnabled,
    disabledKind: "requires_login",
    disabledReason: hasMaxiconsumoChacoCredentials
      ? "Fuente Maxiconsumo Chaco deshabilitada por MAXICONSUMO_ENABLED=false."
      : "Maxiconsumo Chaco requiere login; cargar MAXICONSUMO_PASSWORD y, si no se usa el mismo correo de Tokin, MAXICONSUMO_EMAIL.",
  },
  {
    id: "rednorte-nea",
    storeName: "Red Norte Distribuidora",
    storeType: "mayorista",
    city: "Corrientes / Chaco",
    sourceUrl: "https://www.rednorte.com.ar/",
    dataOrigin:
      "Catalogo publico online de Red Norte, mayorista y minorista para Chaco y Corrientes",
    sourceScope: "NEA: Chaco y Corrientes",
    sourceKind: "rednorte_api",
    searchUrlTemplate:
      "https://www.rednorte.com.ar/api/ecommerce/catalogo?page=1&limit=24&busqueda={query}",
    requiresJavascript: false,
    catalogSearchMode: "full_page",
    maxCards: 180,
  },
  {
    id: "sabor-y-aroma-formosa",
    storeName: "Sabor y Aroma Mayorista",
    storeType: "mayorista",
    city: "Formosa",
    sourceUrl: "https://ventamayorista.saboryaroma.com/",
    dataOrigin: "HTML publico de la tienda mayorista Sabor y Aroma",
    sourceScope: "NEA: Formosa",
    sourceKind: "static_html",
    searchUrlTemplate:
      "https://ventamayorista.saboryaroma.com/?s={query}&post_type=product",
    requiresJavascript: false,
    maxCards: 24,
    selectors: {
      productCard: ".product-card.product",
      name: ".product-card__name",
      price: ".product-card__price",
      image: ".product-card__image",
    },
  },
  {
    id: "fresh-resistencia",
    storeName: "Fresh Distribuidora",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://distribuidorafresh.com.ar/",
    dataOrigin:
      "Catalogo publico WooCommerce de Fresh Distribuidora expuesto en datos de producto",
    sourceScope: "NEA: Resistencia, Chaco",
    sourceKind: "woocommerce_pmw_json",
    searchUrlTemplate: "https://distribuidorafresh.com.ar/",
    requiresJavascript: false,
    catalogSearchMode: "full_page",
    maxCards: 80,
  },
  {
    id: "centenario-bebidas-corrientes",
    storeName: "Distribuidora Centenario",
    storeType: "mayorista",
    city: "Corrientes",
    sourceUrl: "https://www.centenariobebidas.com/",
    dataOrigin:
      "Catalogo publico renderizado de Distribuidora Centenario, bebidas al por mayor",
    sourceScope: "NEA: Corrientes",
    sourceKind: "text_lines",
    searchUrlTemplate: "https://www.centenariobebidas.com/",
    requiresJavascript: true,
    catalogSearchMode: "full_page",
    maxCards: 360,
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
      "La tienda online requiere autenticacion o seleccion de cuenta/sucursal para consultar catalogo y precios confiables.",
  },
  {
    id: "aguiar-arcor-resistencia",
    storeName: "Aguiar Resistencia",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://tokintienda.com.ar/store/home",
    dataOrigin:
      "Catalogo B2B de Aguiar Resistencia en Tokin con credenciales autorizadas",
    sourceScope: "NEA: Resistencia, Chaco",
    sourceKind: "tokin",
    searchUrlTemplate:
      "https://tokintienda.com.ar/store/search?q={query}&size=n_100_n",
    requiresJavascript: true,
    maxCards: 80,
    enabled: isTokinEnabled,
    disabledKind: "requires_login",
    disabledReason: hasTokinCredentials
      ? "Fuente Tokin deshabilitada por TOKIN_ENABLED=false."
      : "Distribuidor oficial Arcor local; cargar TOKIN_EMAIL y TOKIN_PASSWORD para consultar el catalogo B2B en Tokin.",
  },
  {
    id: "rj-aguiar-sa",
    storeName: "Ricardo J. Aguiar S.A.",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://rjaguiarsa.com.ar/",
    dataOrigin: "Sitio institucional de Ricardo J. Aguiar S.A.",
    sourceScope: "NEA: Chaco",
    searchUrlTemplate: "https://rjaguiarsa.com.ar/",
    requiresJavascript: false,
    enabled: false,
    disabledKind: "no_public_prices",
    disabledReason:
      "Mayorista local relevante para Arcor/Bagley, pero no expone catalogo publico con precios producto por producto.",
  },
  {
    id: "sorpresas-golda-gpedidos",
    storeName: "Sorpresas SAS / Distribuidora Golda",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://sorpresas.com.ar/gpedidos/",
    dataOrigin: "Catalogo GPedidos de Sorpresas / Distribuidora Golda",
    sourceScope: "NEA: Chaco",
    searchUrlTemplate: "https://sorpresas.com.ar/gpedidos/",
    requiresJavascript: true,
    enabled: false,
    disabledKind: "no_public_prices",
    disabledReason:
      "Publica rubros y productos en GPedidos, pero los precios no quedan expuestos publicamente para comparar.",
  },
  {
    id: "yaguar-chaco-tienda-auth",
    storeName: "Yaguar Chaco",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://yaguar.com.ar/chaco/tienda/",
    dataOrigin:
      "Tienda online WooCommerce de Yaguar Chaco; requiere login de comerciante y usa credenciales configuradas",
    sourceScope: "NEA: Chaco",
    sourceKind: "yaguar_auth",
    searchUrlTemplate:
      "https://yaguar.com.ar/chaco/tienda/?s={query}&post_type=product",
    requiresJavascript: false,
    maxCards: 80,
    enabled: isYaguarEnabled,
    disabledKind: "requires_login",
    disabledReason: hasYaguarCredentials
      ? "Fuente Yaguar Chaco deshabilitada por YAGUAR_ENABLED=false."
      : "Yaguar Chaco requiere login; cargar YAGUAR_EMAIL/YAGUAR_PASSWORD o TOKIN_EMAIL/TOKIN_PASSWORD para usar las mismas credenciales de Aguiar.",
  },
  {
    id: "mariano-santos-corrientes",
    storeName: "Mariano Santos Mayorista",
    storeType: "mayorista",
    city: "Corrientes",
    sourceUrl: "https://marianosantossrl.com.ar/catalogos/",
    dataOrigin: "Catalogos mayoristas publicados por Mariano Santos SRL",
    sourceScope: "NEA: Corrientes",
    searchUrlTemplate: "https://marianosantossrl.com.ar/catalogos/",
    requiresJavascript: false,
    enabled: false,
    disabledKind: "no_public_prices",
    disabledReason:
      "Publica catalogos en PDF; queda pendiente extractor PDF/OCR porque no hay HTML publico con precios.",
  },
  {
    id: "jotabe-nea",
    storeName: "Distribuidora Jota Be",
    storeType: "mayorista",
    city: "Corrientes / Posadas / Formosa",
    sourceUrl: "https://distribuidorajotabe.com.ar/",
    dataOrigin: "Sitio institucional de Distribuidora Jota Be",
    sourceScope: "NEA: Corrientes, Misiones y Formosa",
    searchUrlTemplate: "https://distribuidorajotabe.com.ar/",
    requiresJavascript: false,
    enabled: false,
    disabledKind: "no_public_prices",
    disabledReason:
      "Mayorista regional identificado, pero no expone catalogo publico con precios para scraping.",
  },
  {
    id: "el-popular-mayorista",
    storeName: "El Popular Mayorista",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://elpopularmayorista.com.ar/",
    dataOrigin: "Sitio institucional de El Popular Mayorista",
    sourceScope: "NEA: Resistencia, Chaco",
    searchUrlTemplate: "https://elpopularmayorista.com.ar/",
    requiresJavascript: false,
    enabled: false,
    disabledKind: "no_public_prices",
    disabledReason:
      "Mayorista local con ofertas por canales comerciales, sin catalogo publico itemizado con precios.",
  },
];
