# Preventistas Live Search MVP

MVP web para informes de precios con alcance nacional en Argentina. Permite buscar productos en fuentes mayoristas y minoristas configuradas, con persistencia opcional en Supabase y sin scraping desde el navegador del usuario.

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
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PERSIST_PRICE_LISTS=true
```

Crear `worker/.env`:

```bash
PORT=4000
HEADLESS=true
SOURCE_TIMEOUT_MS=20000
MIN_CONFIDENCE_SCORE=60
TOKIN_ENABLED=true
TOKIN_EMAIL=
TOKIN_PASSWORD=
TOKIN_API_BASE_URL=https://tokintienda.com.ar/store/tokin/
TOKIN_SEARCH_API_URL=https://tokintienda.com.ar/store/api/search
MAXICONSUMO_ENABLED=true
MAXICONSUMO_EMAIL=
MAXICONSUMO_PASSWORD=
VEA_ENABLED=true
VEA_EMAIL=
VEA_PASSWORD=
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
TOKIN_ENABLED=true
TOKIN_EMAIL=<EMAIL_TOKIN>
TOKIN_PASSWORD=<PASSWORD_TOKIN>
TOKIN_API_BASE_URL=https://tokintienda.com.ar/store/tokin/
TOKIN_SEARCH_API_URL=https://tokintienda.com.ar/store/api/search
MAXICONSUMO_ENABLED=true
MAXICONSUMO_EMAIL=<EMAIL_MAXICONSUMO>
MAXICONSUMO_PASSWORD=<PASSWORD_MAXICONSUMO>
VEA_ENABLED=true
VEA_EMAIL=<EMAIL_VEA_OPCIONAL>
VEA_PASSWORD=<PASSWORD_VEA_OPCIONAL>
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
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SECRET_KEY=<SECRET_KEY_SERVER_SIDE>
SUPABASE_PERSIST_PRICE_LISTS=true
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

## Fuentes activas

Las fuentes activas del MVP combinan referencias nacionales y mayoristas del NEA. Cada resultado expone comercio, tipo, origen de datos, URL de fuente y link del producto cuando la fuente lo informa.

- Carrefour Argentina: API publica VTEX del catalogo web.
- Jumbo Argentina: API publica VTEX del catalogo web.
- Disco Argentina: API publica VTEX del catalogo web.
- DIA Argentina: API publica VTEX del catalogo DIA Online.
- MasOnline / ChangoMas: API publica VTEX del catalogo web.
- Cordiez: API publica VTEX del catalogo web.
- Maxiconsumo Web: catalogo publico mayorista, sucursal web Moreno como referencia nacional.
- Red Norte Distribuidora: catalogo publico online con alcance Chaco/Corrientes.
- Sabor y Aroma Mayorista: HTML publico de tienda mayorista en Formosa.
- Fresh Distribuidora: catalogo publico WooCommerce de Resistencia.
- Distribuidora Centenario: catalogo publico de bebidas mayoristas en Corrientes.
- Aguiar Resistencia: catalogo B2B en Tokin consultado por API HTTP, solo si `TOKIN_EMAIL` y `TOKIN_PASSWORD` estan configurados en el worker.
- Maxiconsumo Chaco: catalogo de la sucursal Chaco por HTTP; intenta sesion con `MAXICONSUMO_PASSWORD` y usa HTML publico de Chaco como respaldo.
- Vea Argentina: API VTEX con intento de sesion. Si `VEA_EMAIL` y `VEA_PASSWORD` no estan configurados, usa `TOKIN_EMAIL` y `TOKIN_PASSWORD`; si Vea no valida la sesion, mantiene la busqueda por API publica.

Fuentes mayoristas NEA relevadas pero pendientes por no exponer precios scrapeables sin login o por requerir PDF/OCR: Ricardo J. Aguiar S.A., Sorpresas/Distribuidora Golda, Yaguar Chaco, Mariano Santos, Distribuidora Jota Be, El Popular Mayorista y Supermayorista Vital.

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
- `POST /catalog/price-list`: recibe una lista de articulos con `rubro`, `description`, `code`, `ean13Di`, `ean13Bu` y opcionalmente `currentPrice`, completa el precio Aguiar desde Tokin cuando hay match y devuelve el mejor precio de referencia por fuente.
- `POST /search`: mantiene la búsqueda live puntual para depuración.

Las fuentes están en `worker/src/sources/argentina.ts`.

Cada fuente puede tener selectores explícitos o quedar sin selectores para usar extracción automática básica. Las URLs y selectores de comercios reales pueden cambiar; este MVP deja la configuración concentrada en un solo archivo para ajustar cada comercio sin tocar el pipeline.

## Importar listas de articulos

El frontend permite importar `.xlsx`, `.xls` o `.csv` con columnas como:

```text
Rubro | Descripcion Larga | Codigo | EAN 13 DI | EAN 13 BU | Precio Aguiar
```

La app conserva esos campos, consulta el catálogo server-side y usa el precio de Aguiar/Tokin como precio propio cuando lo encuentra. La tabla muestra mejor precio de referencia, fuente, producto detectado y precio por comercio. También permite descargar el resultado general o el archivo listo para cargar precios en Aguiar.

La importación no guarda histórico por defecto. Para alimentar evolución de precios, activar la opción `Guardar esta carga para evolución` antes de importar la lista semanal.

## Supabase

La integración con Supabase es opcional. Si `SUPABASE_URL` y una clave server-side (`SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`) están configuradas en `apps/web`, las listas se guardan solo cuando el usuario activa el guardado para evolución.

Schema versionado:

```text
supabase/migrations/20260527172000_initial_pricing_schema.sql
```

Tablas principales:

- `price_list_runs`: cada evaluación/importación semanal.
- `price_list_run_sources`: estado de fuentes consultadas para esa corrida.
- `price_list_run_items`: artículo, precio Aguiar, mejor referencia, brecha, precio sugerido y estado de decisión. Las columnas históricas de costo/margen pueden existir por compatibilidad, pero las cargas nuevas no las usan.

Páginas disponibles:

- `/`: carga de lista, comparación y exportación para Aguiar.
- `/evolucion`: evolución de precios Aguiar, referencias y empresas por artículo.
- `/historial`: detalle de corridas guardadas.

Para aplicar el schema en un proyecto Supabase con CLI:

```bash
npx supabase login
npx supabase link
npx supabase db push
```

También se puede copiar el SQL de la migración y ejecutarlo en el SQL editor de Supabase.

## Persistencia

Sin variables de Supabase, la app sigue sin guardar histórico, productos ni precios. Con Supabase configurado, se guarda el histórico únicamente de las cargas marcadas para evolución; la búsqueda puntual y el catálogo actual siguen funcionando igual que antes.
