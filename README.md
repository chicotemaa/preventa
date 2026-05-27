# Preventistas Live Search MVP

MVP web para informes de precios con alcance nacional en Argentina. Permite buscar productos en fuentes mayoristas y minoristas configuradas, sin base de datos y sin scraping desde el navegador del usuario.

Alcance del informe: Argentina.

## Estructura

```text
apps/web   Next.js App Router + Tailwind
worker     Servidor HTTP Node.js + Playwright
```

## Requisitos

- Node.js 18.20+
- npm

## Instalación

```bash
npm install
npx playwright install chromium
```

## Variables de entorno

Crear `apps/web/.env.local`:

```bash
WORKER_URL=http://127.0.0.1:4000
```

Crear `worker/.env`:

```bash
PORT=4000
HEADLESS=true
SOURCE_TIMEOUT_MS=20000
MIN_CONFIDENCE_SCORE=60
```

## Correr localmente

Terminal 1:

```bash
npm run dev:worker
```

Terminal 2:

```bash
npm run dev:web
```

Abrir [http://localhost:3000](http://localhost:3000).

## Publicar demo

Para mostrar el MVP conviene desplegar dos servicios:

1. Worker Node.js con Playwright en Render, Fly.io, Railway o cualquier host que soporte Docker.
2. Frontend Next.js en Vercel.

### 1. Subir el código a GitHub

Crear un repositorio y subir este monorepo. No subir archivos `.env`.

```bash
git init
git add .
git commit -m "MVP preventistas live catalog"
git branch -M main
git remote add origin <URL_DEL_REPO>
git push -u origin main
```

### 2. Publicar el worker en Render

Este repo incluye `worker/Dockerfile` y `render.yaml`.

En Render:

- Crear un Web Service o Blueprint desde el repo.
- Usar Docker.
- Dockerfile path: `./worker/Dockerfile`
- Docker context: `.`
- Health check path: `/health`
- Variables:

```bash
PORT=4000
HEADLESS=true
SOURCE_TIMEOUT_MS=20000
MIN_CONFIDENCE_SCORE=60
AUTO_SYNC_ON_STARTUP=true
```

Cuando Render termine, probar:

```bash
curl https://TU-WORKER.onrender.com/health
```

Guardar esa URL para el frontend.

### 3. Publicar el frontend en Vercel

En Vercel:

- Importar el mismo repo.
- Root Directory: `apps/web`
- Framework: Next.js
- Environment Variable:

```bash
WORKER_URL=https://TU-WORKER.onrender.com
```

Después de crear o cambiar `WORKER_URL`, redeployar el frontend.

### 4. Probar la demo publicada

Abrir la URL de Vercel y buscar:

```text
bon o bon
cofler
arcor
la serenisima
```

Notas para demo:

- Render puede tardar en responder si el servicio está frío.
- La primera sincronización del worker puede demorar porque abre Playwright y recorre fuentes.
- Para mostrar más datos reales de mayoristas locales, cargar CSV en `worker/data/imports/*.csv` y redeployar el worker.

## Flujo

1. El frontend llama `POST /api/live-search`.
2. El endpoint server-side valida la query y llama al worker en `WORKER_URL/search`.
3. El worker consulta fuentes configuradas server-side con APIs publicas o Playwright.
4. Cada fuente falla o responde de manera independiente.
5. Los resultados se normalizan, deduplican, filtran por score y ordenan por precio ascendente.

## Fuentes nacionales

Las fuentes activas del MVP tienen alcance nacional o referencia nacional. Cada resultado expone comercio, tipo, origen de datos, URL de fuente y link del producto cuando la fuente lo informa.

- Carrefour Argentina: API publica VTEX del catalogo web.
- Jumbo Argentina: API publica VTEX del catalogo web.
- Disco Argentina: API publica VTEX del catalogo web.
- Vea Argentina: API publica VTEX del catalogo web.
- DIA Argentina: API publica VTEX del catalogo DIA Online.
- Maxiconsumo Web: catalogo publico mayorista, sucursal web Moreno como referencia nacional.
- Supermayorista Vital Online: fuente relevante configurada como pendiente porque requiere autenticacion para ver catalogo/precios.

El catálogo scrapeado se guarda como snapshot actual en `worker/data/catalog.json`. No se guarda histórico.

## Listas locales importadas

Para sumar mayoristas que no publican precios web, el worker también lee CSV reales en `worker/data/imports/*.csv`. Los archivos `.example.csv` no se cargan.

Formato:

```csv
sourceId,storeName,storeType,brand,rawName,price,productUrl,imageUrl,sourceUrl,dataOrigin,sourceScope
```

Cada fila real debe completar esos campos. Esto permite convertir listas recibidas por Excel, WhatsApp o PDF a CSV y compararlas en el mismo frontend sin base de datos. No se incluyen productos falsos ocultos en la lógica.

Endpoints del worker:

- `POST /catalog/sync`: recorre automáticamente las marcas objetivo en las fuentes configuradas y reemplaza el snapshot actual.
- `GET /catalog`: devuelve el snapshot actual.
- `POST /catalog/search`: busca sobre el snapshot ya scrapeado.
- `POST /catalog/price-list`: recibe una lista de articulos con `rubro`, `description`, `code`, `ean13Di` y `ean13Bu`, y devuelve el mejor precio y precios por fuente.
- `POST /search`: mantiene la búsqueda live puntual para depuración.

Las fuentes están en `worker/src/sources/argentina.ts`.

Cada fuente puede tener selectores explícitos o quedar sin selectores para usar extracción automática básica. Las URLs y selectores de comercios reales pueden cambiar; este MVP deja la configuración concentrada en un solo archivo para ajustar cada comercio sin tocar el pipeline.

## Importar listas de articulos

El frontend permite importar `.xlsx`, `.xls` o `.csv` con columnas como:

```text
Rubro | Descripcion Larga | Codigo | EAN 13 DI | EAN 13 BU
```

La app conserva esos campos, consulta el catálogo server-side y muestra una tabla para evaluación con mejor precio, fuente, producto detectado, score y precio por comercio. También permite descargar el resultado en CSV.

## Sin persistencia

Esta versión no guarda histórico, productos ni precios. Para agregar cache o Supabase más adelante, el punto natural de integración es `runLiveSearch` en `worker/src/search.ts`, antes o después de consultar fuentes.
