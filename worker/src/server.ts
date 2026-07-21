import http from "node:http";
import { z } from "zod";
import {
  buildCarrefourComercianteBrowserImportSnapshot,
  loginAndValidateCarrefourComercianteSession,
  syncCarrefourComercianteCatalog,
  validateCarrefourComercianteSession,
} from "./carrefour-comerciante.js";
import {
  getCatalogMetadata,
  getCatalogSnapshot,
  loadCatalogFromDisk,
  matchPriceListItems,
  rebuildCatalogFromStoredSources,
  reloadStoredSourceCatalogs,
  searchCategory,
  searchCatalog,
  syncCatalog,
  syncCatalogInBackground,
  syncCatalogSource,
} from "./catalog.js";
import { config } from "./config.js";
import { normalizeProductName } from "./normalizers.js";
import { runLiveSearch } from "./search.js";
import {
  getSourceCatalogSnapshot,
  getSourceSessionStates,
  saveSourceCatalogSnapshot,
  saveSourceSession,
  updateSourceSessionValidation,
  type SourceSessionValidationSummary,
} from "./source-session-store.js";
import { scrapingSources } from "./sources/argentina.js";

const CARREFOUR_COMERCIANTE_SOURCE_ID = "carrefour-comerciante-maxi";
const AGUIAR_TOKIN_SOURCE_ID = "aguiar-arcor-resistencia";

const searchRequestSchema = z.object({
  query: z.string().trim().min(2).max(120),
});

const categorySearchRequestSchema = searchRequestSchema.extend({
  mode: z.enum(["catalog", "live"]).optional(),
});

const catalogSourceSyncRequestSchema = z.object({
  sourceId: z.string().trim().min(2).max(120),
  maxTerms: z.number().int().positive().max(240).optional(),
  offset: z.number().int().nonnegative().max(10_000_000).optional(),
  deferCatalogRebuild: z.boolean().optional(),
});

const carrefourComercianteSessionValidationSchema = z.object({
  cookie: z.string().trim().optional(),
  userAgent: z.string().trim().optional(),
  query: z.string().trim().min(2).max(120).optional(),
});

const carrefourComercianteSessionSaveSchema = z.object({
  cookie: z.string().trim().min(10).max(20_000),
  userAgent: z.string().trim().min(20).max(800),
  query: z.string().trim().min(2).max(120).optional(),
});

const carrefourComercianteSessionLoginSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  document: z.string().trim().min(5).max(20).optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  email: z.string().trim().email().max(160).optional(),
  query: z.string().trim().min(2).max(120).optional(),
});

const carrefourComercianteCatalogSyncSchema = z.object({
  queries: z.array(z.string().trim().min(2).max(120)).max(60).optional(),
  maxPagesPerQuery: z.number().int().positive().max(20).optional(),
  itemsPerPage: z.number().int().positive().max(48).optional(),
});

const carrefourComercianteCatalogImportSchema = z.object({
  mode: z.enum(["replace", "append"]).optional(),
  query: z.string().trim().min(2).max(120),
  page: z.number().int().positive().max(200).optional(),
  sourceUrl: z.string().trim().url().optional().nullable(),
  errors: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(240),
        price: z.union([z.number().positive(), z.string().trim().min(1)]),
        sku: z.string().trim().max(80).optional().nullable(),
        barcode: z.string().trim().max(80).optional().nullable(),
        brand: z.string().trim().max(80).optional().nullable(),
        category: z.string().trim().max(160).optional().nullable(),
        imageUrl: z.string().trim().url().optional().nullable(),
        productUrl: z.string().trim().url().optional().nullable(),
        priceCondition: z.string().trim().max(160).optional().nullable(),
        alternatePrices: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(80),
              price: z.number().positive(),
              comparisonPrice: z.number().positive().optional().nullable(),
            }),
          )
          .max(8)
          .optional(),
      }),
    )
    .max(120),
});

const productSearchResultSnapshotImportSchema = z
  .object({
    sourceId: z.string().trim().min(2).max(120).optional(),
    storeName: z.string().trim().min(2).max(160).optional(),
    storeType: z.enum(["mayorista", "minorista"]).optional(),
    rawName: z.string().trim().min(2).max(260),
    normalizedName: z.string().trim().min(2).max(260).optional(),
    price: z.number().positive(),
    currency: z.literal("ARS").optional(),
    productUrl: z.string().trim().url().optional().nullable(),
    imageUrl: z.string().trim().url().optional().nullable(),
    confidenceScore: z.number().min(0).max(100).optional(),
    sku: z.string().trim().max(80).optional().nullable(),
    barcodes: z.array(z.string().trim().max(80)).max(8).optional(),
    brand: z.string().trim().max(80).optional().nullable(),
    category: z.string().trim().max(160).optional().nullable(),
    priceCondition: z.string().trim().max(180).optional().nullable(),
    availability: z.enum(["in_stock", "out_of_stock", "unknown"]).optional(),
    alternatePrices: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          price: z.number().positive(),
          comparisonPrice: z.number().positive().optional().nullable(),
        }),
      )
      .max(8)
      .optional(),
  })
  .passthrough();

const carrefourComercianteCatalogSnapshotImportSchema = z.object({
  sourceUrl: z.string().trim().url().optional().nullable(),
  syncedAt: z.string().trim().optional(),
  durationMs: z.number().nonnegative().optional(),
  queries: z.array(z.string().trim().min(1).max(160)).max(500).optional(),
  errors: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  products: z.array(productSearchResultSnapshotImportSchema).min(1).max(15_000),
});

const PRICE_LIST_MAX_ITEMS = 1500;

const priceListRequestSchema = z.object({
  items: z
    .array(
      z.object({
        rowNumber: z.number().int().positive(),
        business: z.string().optional(),
        rubro: z.string().optional(),
        segment: z.string().optional(),
        subrubro: z.string().optional(),
        line: z.string().optional(),
        description: z.string().optional(),
        code: z.string().optional(),
        uxb: z.string().optional(),
        ean13Di: z.string().optional(),
        ean13Bu: z.string().optional(),
        currentPrice: z.number().positive().optional(),
        currentCost: z.number().positive().optional(),
      }),
    )
    .min(1)
    .max(PRICE_LIST_MAX_ITEMS),
});

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/") {
    sendJson(response, 200, {
      ok: true,
      service: "preventistas-worker",
      message:
        "Worker online. La interfaz publica esta en el frontend Next.js; este servicio expone endpoints de busqueda.",
      endpoints: {
        health: "GET /health",
        catalog: "GET /catalog",
        catalogSearch: "POST /catalog/search",
        categorySearch: "POST /catalog/category-search",
        sourceSessions: "GET /sources/sessions",
        carrefourComercianteSession:
          "POST /sources/carrefour-comerciante/session/validate",
        carrefourComercianteSessionSave:
          "POST /sources/carrefour-comerciante/session/save",
        carrefourComercianteSessionLogin:
          "POST /sources/carrefour-comerciante/session/login",
        carrefourComercianteCatalog:
          "GET /sources/carrefour-comerciante/catalog",
        carrefourComercianteCatalogSync:
          "POST /sources/carrefour-comerciante/catalog/sync",
        carrefourComercianteCatalogImport:
          "POST /sources/carrefour-comerciante/catalog/import",
        carrefourComercianteCatalogSnapshotImport:
          "POST /sources/carrefour-comerciante/catalog/import-snapshot",
        priceList: "POST /catalog/price-list",
        catalogSync: "POST /catalog/sync",
        catalogSyncBackground: "POST /catalog/sync/background",
        catalogSourceSync: "POST /catalog/sync/source",
        catalogRebuild: "POST /catalog/rebuild",
        liveSearch: config.liveSearchEnabled
          ? "POST /search"
          : "disabled; set ENABLE_LIVE_SEARCH=true to enable",
      },
      catalog: getCatalogMetadata(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, catalog: getCatalogMetadata() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/catalog") {
    sendJson(response, 200, getCatalogSnapshot());
    return;
  }

  if (request.method === "GET" && url.pathname === "/sources/sessions") {
    sendJson(response, 200, {
      sources: await getSourceSessionStates(),
    });
    return;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/sources/carrefour-comerciante/catalog"
  ) {
    sendJson(response, 200, {
      snapshot: await getSourceCatalogSnapshot(CARREFOUR_COMERCIANTE_SOURCE_ID),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/sync") {
    if (!isAuthorizedCatalogSyncRequest(request)) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    const snapshot = await syncCatalog();
    sendJson(response, 200, snapshot);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/catalog/sync/background"
  ) {
    if (!isAuthorizedCatalogSyncRequest(request)) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    const syncState = syncCatalogInBackground();
    sendJson(response, 202, {
      ok: true,
      ...syncState,
      catalog: getCatalogMetadata(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/sync/source") {
    if (!isAuthorizedCatalogSyncRequest(request)) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const { sourceId, maxTerms, offset, deferCatalogRebuild } =
        catalogSourceSyncRequestSchema.parse(body);
      const result = await syncCatalogSource(sourceId, {
        maxTerms,
        offset,
        deferCatalogRebuild,
      });
      sendJson(response, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo sincronizar la fuente.",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/rebuild") {
    if (!isAuthorizedCatalogSyncRequest(request)) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    const snapshot = await rebuildCatalogFromStoredSources();
    sendJson(response, 200, {
      ok: true,
      catalog: getCatalogMetadata(),
      productsCount: snapshot.productsCount,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/search") {
    await handleCatalogSearch(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/category-search") {
    await handleCatalogCategorySearch(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/price-list") {
    await handleCatalogPriceList(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sources/carrefour-comerciante/session/validate"
  ) {
    await handleCarrefourComercianteSessionValidation(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sources/carrefour-comerciante/session/save"
  ) {
    await handleCarrefourComercianteSessionSave(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sources/carrefour-comerciante/session/login"
  ) {
    await handleCarrefourComercianteSessionLogin(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sources/carrefour-comerciante/catalog/sync"
  ) {
    await handleCarrefourComercianteCatalogSync(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sources/carrefour-comerciante/catalog/import"
  ) {
    await handleCarrefourComercianteCatalogImport(request, response);
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/sources/carrefour-comerciante/catalog/import-snapshot"
  ) {
    await handleCarrefourComercianteCatalogSnapshotImport(request, response);
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/search") {
    sendJson(response, 404, {
      error: "Endpoint no encontrado.",
      availableEndpoints: [
        "GET /",
        "GET /health",
        "GET /catalog",
        "GET /sources/sessions",
        "GET /sources/carrefour-comerciante/catalog",
        "POST /catalog/search",
        "POST /catalog/category-search",
        "POST /catalog/price-list",
        "POST /catalog/sync",
        "POST /catalog/sync/background",
        "POST /catalog/sync/source",
        "POST /catalog/rebuild",
        "POST /sources/carrefour-comerciante/session/validate",
        "POST /sources/carrefour-comerciante/session/save",
        "POST /sources/carrefour-comerciante/session/login",
        "POST /sources/carrefour-comerciante/catalog/sync",
        "POST /sources/carrefour-comerciante/catalog/import",
        "POST /search",
      ],
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const parsed = searchRequestSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error: "Query invalida. Debe tener entre 2 y 120 caracteres.",
      });
      return;
    }

    if (!config.liveSearchEnabled) {
      sendJson(response, 410, {
        error:
          "La busqueda online esta desactivada. Consultar /catalog/search o actualizar el catalogo con el cron diario.",
      });
      return;
    }

    const result = await runLiveSearch(parsed.data.query);
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno ejecutando la busqueda.",
    });
  }
});

await loadCatalogFromDisk();

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Worker listening on http://localhost:${config.port}`);

  if (config.autoSyncOnStartup) {
    console.log("Starting catalog sync in background");
    syncCatalogInBackground();
  }
});

async function handleCatalogSearch(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = searchRequestSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error: "Query invalida. Debe tener entre 2 y 120 caracteres.",
      });
      return;
    }

    sendJson(response, 200, await searchCatalog(parsed.data.query));
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno buscando en catalogo.",
    });
  }
}

async function handleCatalogCategorySearch(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = categorySearchRequestSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error: "Query invalida. Debe tener entre 2 y 120 caracteres.",
      });
      return;
    }

    const mode = parsed.data.mode ?? config.categorySearch.mode;
    const result =
      mode === "live"
        ? await searchCategory(parsed.data.query, { mode })
        : await withSourceTemporarilyDisabled(AGUIAR_TOKIN_SOURCE_ID, () =>
            searchCategory(parsed.data.query, { mode: "catalog" }),
          );

    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno buscando rubros.",
    });
  }
}

function isAuthorizedCatalogSyncRequest(request: http.IncomingMessage) {
  if (!config.catalogSyncSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.authorization === `Bearer ${config.catalogSyncSecret}`;
}

async function handleCatalogPriceList(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = priceListRequestSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error: `Lista invalida. Debe incluir entre 1 y ${PRICE_LIST_MAX_ITEMS} articulos.`,
      });
      return;
    }

    const result = await withSourceTemporarilyDisabled(
      AGUIAR_TOKIN_SOURCE_ID,
      () => matchPriceListItems(parsed.data.items),
    );

    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno evaluando la lista.",
    });
  }
}

async function handleCarrefourComercianteSessionValidation(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = carrefourComercianteSessionValidationSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error:
          "Datos invalidos. La consulta debe tener entre 2 y 120 caracteres.",
      });
      return;
    }

    const validation = await validateCarrefourComercianteSession(parsed.data);

    await updateSourceSessionValidation(
      CARREFOUR_COMERCIANTE_SOURCE_ID,
      toSourceSessionValidationSummary(validation),
    );

    sendJson(response, 200, validation);
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno validando Carrefour Comerciante.",
    });
  }
}

async function handleCarrefourComercianteSessionSave(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = carrefourComercianteSessionSaveSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error:
          "Datos invalidos. La cookie y el User-Agent deben pertenecer a una sesion vigente.",
      });
      return;
    }

    const validation = await validateCarrefourComercianteSession(parsed.data);
    const source = getCarrefourComercianteSource();

    if (!validation.ok) {
      sendJson(response, 422, {
        error:
          "La sesion no se guardo porque Carrefour Comerciante no devolvio precios visibles.",
        validation,
      });
      return;
    }

    const session = await saveSourceSession({
      sourceId: source.id,
      storeName: source.storeName,
      storeType: source.storeType,
      cookie: parsed.data.cookie,
      userAgent: parsed.data.userAgent,
      validation: toSourceSessionValidationSummary(validation),
    });

    sendJson(response, 200, {
      ok: true,
      session,
      validation,
      message:
        "Sesion guardada. El worker puede reutilizarla hasta que Carrefour la invalide.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno guardando sesion Carrefour Comerciante.",
    });
  }
}

async function handleCarrefourComercianteSessionLogin(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = carrefourComercianteSessionLoginSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error:
          "Datos invalidos. Completar nombre, CUIT/DNI, telefono e email si no estan en variables del worker.",
      });
      return;
    }

    const validation = await loginAndValidateCarrefourComercianteSession(
      parsed.data,
    );

    if (!validation.ok || !validation.cookie) {
      const { cookie: _cookie, ...safeValidation } = validation;

      sendJson(response, 422, {
        error:
          "Carrefour no devolvio precios visibles desde el backend. La sesion no se guardo.",
        validation: safeValidation,
      });
      return;
    }

    const source = getCarrefourComercianteSource();
    const session = await saveSourceSession({
      sourceId: source.id,
      storeName: source.storeName,
      storeType: source.storeType,
      cookie: validation.cookie,
      userAgent: validation.userAgent,
      validation: toSourceSessionValidationSummary(validation),
    });

    const { cookie: _cookie, ...safeValidation } = validation;

    sendJson(response, 200, {
      ok: true,
      session,
      validation: safeValidation,
      message:
        "Sesion Carrefour Comerciante creada desde el backend y guardada.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno conectando Carrefour Comerciante desde backend.",
    });
  }
}

async function handleCarrefourComercianteCatalogSync(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const body = await readJsonBody(request);
    const parsed = carrefourComercianteCatalogSyncSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error:
          "Parametros invalidos. Revisar consultas, paginas por consulta e items por pagina.",
      });
      return;
    }

    const source = getCarrefourComercianteSource();
    const snapshot = await syncCarrefourComercianteCatalog(source, parsed.data);
    const summary = await saveSourceCatalogSnapshot(snapshot);
    const savedProductsCount = summary?.productsCount ?? snapshot.productsCount;
    const hasSavedCatalog =
      (summary?.status ?? snapshot.status) === "success" &&
      savedProductsCount > 0;

    await reloadStoredSourceCatalogs();

    sendJson(response, 200, {
      ok: hasSavedCatalog,
      snapshot: summary,
      message:
        snapshot.status === "success"
          ? "Catalogo Carrefour Comerciante sincronizado y guardado."
          : hasSavedCatalog
            ? "Carrefour no devolvio precios nuevos; se conserva el catalogo guardado anterior."
          : "La sincronizacion termino sin productos utiles guardados.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno sincronizando catalogo Carrefour Comerciante.",
    });
  }
}

async function handleCarrefourComercianteCatalogImport(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    if (!isAuthorizedCatalogSyncRequest(request)) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    const body = await readJsonBody(request);
    const parsed = carrefourComercianteCatalogImportSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error:
          "Importacion invalida. Enviar query y hasta 120 productos con precio visible por lote.",
      });
      return;
    }

    const source = getCarrefourComercianteSource();
    const existingSnapshot =
      parsed.data.mode === "append"
        ? await getSourceCatalogSnapshot(CARREFOUR_COMERCIANTE_SOURCE_ID)
        : null;
    const snapshot = buildCarrefourComercianteBrowserImportSnapshot(
      source,
      parsed.data,
      existingSnapshot,
    );
    const summary = await saveSourceCatalogSnapshot(snapshot);

    await reloadStoredSourceCatalogs();

    sendJson(response, 200, {
      ok: snapshot.status === "success",
      snapshot: summary,
      importedCount: parsed.data.products.length,
      acceptedCount:
        snapshot.productsCount - (existingSnapshot?.productsCount ?? 0),
      message:
        snapshot.status === "success"
          ? "Lote Carrefour Comerciante importado y guardado."
          : "El lote no incluyo productos utiles con precio.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno importando catalogo Carrefour Comerciante.",
    });
  }
}

async function handleCarrefourComercianteCatalogSnapshotImport(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    if (!isAuthorizedCatalogSyncRequest(request)) {
      sendJson(response, 401, { error: "No autorizado." });
      return;
    }

    const body = await readJsonBody(request);
    const parsed =
      carrefourComercianteCatalogSnapshotImportSchema.safeParse(body);

    if (!parsed.success) {
      sendJson(response, 400, {
        error:
          "Snapshot invalido. Enviar productos Carrefour Comerciante con precio visible.",
      });
      return;
    }

    const source = getCarrefourComercianteSource();
    const products = parsed.data.products.map((product) => ({
      ...product,
      sourceId: source.id,
      storeName: source.storeName,
      storeType: source.storeType,
      normalizedName:
        product.normalizedName ?? normalizeProductName(product.rawName),
      currency: "ARS" as const,
      productUrl: product.productUrl ?? null,
      imageUrl: product.imageUrl ?? null,
      confidenceScore: product.confidenceScore ?? 90,
      availability: product.availability ?? "in_stock",
      brand: product.brand ?? undefined,
      category: product.category ?? undefined,
    }));
    const summary = await saveSourceCatalogSnapshot({
      sourceId: source.id,
      storeName: source.storeName,
      storeType: source.storeType,
      sourceUrl: parsed.data.sourceUrl ?? source.sourceUrl ?? null,
      dataOrigin: source.dataOrigin,
      sourceScope: source.sourceScope,
      status: "success",
      syncedAt: parsed.data.syncedAt ?? new Date().toISOString(),
      durationMs: parsed.data.durationMs ?? 0,
      queries: parsed.data.queries ?? [],
      productsCount: products.length,
      privateProductsCount: 0,
      visiblePriceProductsCount: products.length,
      errors: parsed.data.errors ?? [],
      products,
    });

    await reloadStoredSourceCatalogs();

    sendJson(response, 200, {
      ok: true,
      snapshot: summary,
      importedCount: products.length,
      message: "Snapshot Carrefour Comerciante importado y guardado.",
    });
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno importando snapshot Carrefour Comerciante.",
    });
  }
}

function getCarrefourComercianteSource() {
  const source = scrapingSources.find(
    (candidate) => candidate.id === CARREFOUR_COMERCIANTE_SOURCE_ID,
  );

  if (!source) {
    throw new Error("No se encontro la fuente Carrefour Comerciante.");
  }

  return source;
}

async function withSourceTemporarilyDisabled<T>(
  sourceId: string,
  callback: () => Promise<T>,
) {
  const source = scrapingSources.find((candidate) => candidate.id === sourceId);

  if (!source) {
    return callback();
  }

  const previousEnabled = source.enabled;
  source.enabled = false;

  try {
    return await callback();
  } finally {
    source.enabled = previousEnabled;
  }
}

function toSourceSessionValidationSummary(
  validation: Awaited<ReturnType<typeof validateCarrefourComercianteSession>>,
): SourceSessionValidationSummary {
  return {
    status: validation.status,
    ok: validation.ok,
    message: validation.message,
    checkedAt: validation.checkedAt,
    query: validation.query,
    durationMs: validation.durationMs,
    productsCount: validation.productsCount,
    privateProductsCount: validation.privateProductsCount,
    visiblePriceProductsCount: validation.visiblePriceProductsCount,
  };
}

function setCorsHeaders(response: http.ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Access-Control-Allow-Private-Network", "true");
}

function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}
