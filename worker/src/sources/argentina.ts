import { config } from "../config.js";
import type { ScrapingSource } from "../types.js";

const hasTokinCredentials = Boolean(config.tokin.email && config.tokin.password);
const isTokinEnabled = config.tokin.enabled && hasTokinCredentials;
const isMaxiconsumoChacoEnabled = config.maxiconsumo.enabled;
const yaguarEmail = config.yaguar.email ?? config.tokin.email;
const yaguarPassword = config.yaguar.password ?? config.tokin.password;
const hasYaguarCredentials = Boolean(yaguarEmail && yaguarPassword);
const isYaguarEnabled = config.yaguar.enabled && hasYaguarCredentials;
const carrefourComercianteMissingFields = [
  ["nombre", config.carrefourComerciante.name],
  ["CUIT/DNI", config.carrefourComerciante.document],
  ["telefono", config.carrefourComerciante.phone],
  ["email", config.carrefourComerciante.email],
].flatMap(([label, value]) => (value ? [] : [label]));

export const scrapingSources: ScrapingSource[] = [
  {
    id: "carrefour-argentina-vtex",
    storeName: "Carrefour Argentina",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://www.carrefour.com.ar/",
    dataOrigin:
      "API VTEX de Carrefour Argentina; intenta sesion con credenciales configuradas, prioriza vendedor Carrefour, disponibilidad y precio vigente de venta",
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
    id: "depot-express-argentina",
    storeName: "Depot Express",
    storeType: "minorista",
    city: "Argentina",
    sourceUrl: "https://depotexpress.com.ar/productos/",
    dataOrigin:
      "HTML publico del buscador WooCommerce de Depot Express con precios visibles",
    sourceScope: "Argentina",
    sourceKind: "static_html",
    searchUrlTemplate:
      "https://depotexpress.com.ar/?s={query}&post_type=product",
    requiresJavascript: false,
    maxCards: 24,
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
      "Catalogo web publico de Maxiconsumo sucursal Chaco con precios visibles; usa sesion autorizada solo como respaldo",
    sourceScope: "NEA: Resistencia, Chaco",
    sourceKind: "maxiconsumo_auth",
    searchUrlTemplate:
      "https://maxiconsumo.com/sucursal_chaco/catalogsearch/result/?q={query}",
    requiresJavascript: true,
    maxCards: 40,
    enabled: isMaxiconsumoChacoEnabled,
    disabledKind: "requires_login",
    disabledReason: isMaxiconsumoChacoEnabled
      ? undefined
      : "Fuente Maxiconsumo Chaco deshabilitada por MAXICONSUMO_ENABLED=false.",
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
    id: "cucher-mercados-ofertas",
    storeName: "Cucher Mercados",
    storeType: "mayorista",
    city: "NEA",
    sourceUrl: "https://www.cuchermercados.com.ar/ofertas/#alimentos",
    dataOrigin:
      "API publica Supabase usada por la pagina de ofertas de Cucher Mercados; precios finales con IVA incluido",
    sourceScope: "NEA: ofertas publicas semanales",
    sourceKind: "cucher_supabase",
    searchUrlTemplate:
      "https://wmqjwpaljbfaywajidzw.supabase.co/rest/v1/ofertas?select=id%2Ctitulo%2Cdescripcion%2Cprecio_oferta%2Cprecio_original%2Cimagen_url%2Cdescuento_porcentaje%2Ccategoria%2Cidarticulo%2Cactiva%2Cfecha_inicio%2Cfecha_fin%2Ccreado_en%2Cactualizado_en%2Corden&activa=eq.true&order=categoria.asc%2Corden.asc.nullslast%2Cactualizado_en.desc%2Cid.desc",
    requiresJavascript: false,
    maxCards: 80,
    enabled: config.cucher.enabled,
    disabledKind: "no_public_prices",
    disabledReason: config.cucher.enabled
      ? undefined
      : "Fuente Cucher Mercados deshabilitada por CUCHER_ENABLED=false.",
  },
  {
    id: "carrefour-comerciante-maxi",
    storeName: "Carrefour Comerciante",
    storeType: "mayorista",
    city: "Argentina / Resistencia, Chaco",
    sourceUrl: "https://comerciante.carrefour.com.ar/",
    dataOrigin:
      "Carrefour Maxi / Maxi Pedido; el catalogo publico muestra productos, pero los precios quedan privados hasta completar datos de comercio, sucursal y sesion autorizada con reCAPTCHA Enterprise",
    sourceScope:
      "Argentina; para Chaco la sucursal detectada es CARREFOUR MAXI RESISTENCIA CHACO seller 506",
    sourceKind: "static_html",
    searchUrlTemplate:
      "https://comerciante.carrefour.com.ar/products?currentUrl=search/{query}&filters=&orderBy=&currentPage=1&itemsPerPage=24&method=productsList",
    requiresJavascript: true,
    maxCards: 80,
    enabled: false,
    disabledKind: "requires_login",
    disabledReason: `Carrefour Comerciante requiere completar login con datos del comercio y reCAPTCHA Enterprise. Datos necesarios: nombre y apellido, CUIT/DNI, telefono, email, provincia ${config.carrefourComerciante.region}, sucursal ${config.carrefourComerciante.sellerId} CARREFOUR MAXI RESISTENCIA CHACO y tipo de entrega ${config.carrefourComerciante.deliveryType}. Campos pendientes: ${carrefourComercianteMissingFields.length > 0 ? carrefourComercianteMissingFields.join(", ") : "sesion autorizada / integracion de reCAPTCHA"}.`,
  },
  {
    id: "check-chek-mayorista",
    storeName: "Check / Chek",
    storeType: "mayorista",
    city: "NEA",
    dataOrigin: "Fuente mayorista esperada para tablero competitivo",
    sourceScope: "NEA",
    searchUrlTemplate: "not-configured:check-chek",
    requiresJavascript: false,
    enabled: false,
    disabledKind: "not_configured",
    disabledReason:
      "Fuente esperada para decision de pricing mayorista; falta identificar fuente real, catalogo o credenciales.",
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
    id: "yaguar-chaco-tienda-auth",
    storeName: "Yaguar Chaco",
    storeType: "mayorista",
    city: "Resistencia, Chaco",
    sourceUrl: "https://yaguar.com.ar/chaco/tienda/",
    dataOrigin:
      "Tienda online WooCommerce de Yaguar Chaco; requiere login de comerciante y usa YAGUAR_EMAIL/YAGUAR_PASSWORD o las mismas credenciales TOKIN_EMAIL/TOKIN_PASSWORD de Aguiar",
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
      : "Yaguar Chaco requiere login; cargar TOKIN_EMAIL/TOKIN_PASSWORD para usar las mismas credenciales de Aguiar, o YAGUAR_EMAIL/YAGUAR_PASSWORD si fueran distintas.",
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
