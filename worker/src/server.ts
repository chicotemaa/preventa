import http from "node:http";
import { z } from "zod";
import {
  getCatalogMetadata,
  getCatalogSnapshot,
  loadCatalogFromDisk,
  searchCatalog,
  syncCatalog,
  syncCatalogInBackground,
} from "./catalog.js";
import { config } from "./config.js";
import { runLiveSearch } from "./search.js";

const searchRequestSchema = z.object({
  query: z.string().trim().min(2).max(120),
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
        catalogSync: "POST /catalog/sync",
        liveSearch: "POST /search",
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

  if (request.method === "POST" && url.pathname === "/catalog/sync") {
    const snapshot = await syncCatalog();
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/search") {
    await handleCatalogSearch(request, response);
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/search") {
    sendJson(response, 404, {
      error: "Endpoint no encontrado.",
      availableEndpoints: [
        "GET /",
        "GET /health",
        "GET /catalog",
        "POST /catalog/search",
        "POST /catalog/sync",
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

    sendJson(response, 200, searchCatalog(parsed.data.query));
  } catch (error) {
    sendJson(response, 500, {
      error:
        error instanceof Error
          ? error.message
          : "Error interno buscando en catalogo.",
    });
  }
}

function setCorsHeaders(response: http.ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
