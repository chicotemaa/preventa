# Aguiar Gestion de Precios

Aplicacion web para el area de ventas de Aguiar. Permite consultar surtido por categoria, buscar productos puntuales, importar listas semanales, comparar precios contra mayoristas/minoristas y guardar corridas para analizar evolucion.

La busqueda no scrapea desde el navegador del usuario. El frontend Next.js llama endpoints server-side y esos endpoints consultan un worker Node.js que integra fuentes externas.

Manual completo: [MANUAL.md](./MANUAL.md)

## Estructura

```text
apps/web   Frontend Next.js App Router + TypeScript + Tailwind CSS
worker     Servidor HTTP Node.js + TypeScript + Playwright/API extractors
```

## Requisitos

- Node.js 18.20+
- npm
- Chromium de Playwright

## Instalacion

```bash
npm install
npx playwright install chromium
```

## Variables de entorno

Crear `apps/web/.env.local`:

```bash
WORKER_URL=http://127.0.0.1:4000
CATEGORY_SEARCH_MODE=catalog
CRON_SECRET=
WORKER_CRON_SECRET=
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
AUTO_SYNC_ON_STARTUP=true
CATEGORY_SEARCH_MODE=catalog
CATALOG_SYNC_SECRET=
CATALOG_SYNC_TIMEOUT_MS=1200000

TOKIN_ENABLED=true
TOKIN_EMAIL=
TOKIN_PASSWORD=
TOKIN_API_BASE_URL=https://tokintienda.com.ar/store/tokin/
TOKIN_SEARCH_API_URL=https://tokintienda.com.ar/store/api/search

MAXICONSUMO_ENABLED=true
MAXICONSUMO_EMAIL=
MAXICONSUMO_PASSWORD=

YAGUAR_ENABLED=true
YAGUAR_EMAIL=
YAGUAR_PASSWORD=

VEA_ENABLED=true
VEA_EMAIL=
VEA_PASSWORD=

CARREFOUR_ENABLED=true
CARREFOUR_EMAIL=
CARREFOUR_PASSWORD=

AI_MATCHING_ENABLED=false
OPENAI_API_KEY=
AI_MATCHING_MODEL=gpt-4.1-nano
AI_MATCHING_MIN_CONFIDENCE=82
AI_MATCHING_MAX_CANDIDATES=5
AI_MATCHING_TIMEOUT_MS=6000
```

Notas:

- `TOKIN_EMAIL` y `TOKIN_PASSWORD` habilitan Aguiar/Tokin.
- Yaguar puede usar `YAGUAR_EMAIL/YAGUAR_PASSWORD`; si no estan, toma las credenciales de Tokin.
- Vea y Carrefour intentan sesion con sus credenciales propias; si no estan, usan las de Tokin como fallback.
- Supabase es opcional para guardar historial/evolucion de corridas.
- `CATEGORY_SEARCH_MODE=catalog` hace que categorias consulte el catalogo precargado; usar `live` solo para diagnostico.
- `CRON_SECRET` en Vercel y `CATALOG_SYNC_SECRET` en el worker deben tener el mismo valor, salvo que uses `WORKER_CRON_SECRET`.

## Correr localmente

Terminal 1:

```bash
npm run dev:worker
```

Terminal 2:

```bash
npm run dev:web
```

Abrir [http://localhost:3000](http://localhost:3000). En este entorno puede estar corriendo en otro puerto, por ejemplo [http://localhost:3003](http://localhost:3003).

## Comandos utiles

```bash
npm run typecheck
npm run build
npm run dev:web
npm run dev:worker
```

## Paginas principales

- `/`: explorador de categorias y familias.
- `/busqueda-general`: busqueda individual por nombre, SKU, codigo interno o EAN.
- `/importacion`: carga de Excel/lista semanal, comparacion y exportacion.
- `/evolucion`: evolucion de precios con corridas guardadas.
- `/historial`: historial y detalle de corridas guardadas.
- `/configuracion`: validacion de sesiones privadas de fuentes mayoristas.

## Worker endpoints

- `GET /health`: estado del worker.
- `GET /catalog`: snapshot actual del catalogo.
- `POST /catalog/sync`: sincroniza fuentes y reemplaza el snapshot.
- `POST /catalog/sync/background`: dispara sincronizacion en background para cron.
- `POST /catalog/search`: busca sobre el catalogo actual.
- `POST /catalog/category-search`: agrupa resultados por familia/categoria.
- `POST /catalog/price-list`: compara una lista importada.
- `GET /sources/sessions`: estado de sesiones guardadas por fuente.
- `POST /sources/carrefour-comerciante/session/validate`: valida cookie de Carrefour Comerciante.
- `POST /sources/carrefour-comerciante/session/save`: valida y guarda una sesion autorizada de Carrefour Comerciante.
- `POST /sources/carrefour-comerciante/session/login`: intenta crear y guardar una sesion desde el backend con datos del comercio.
- `GET /sources/carrefour-comerciante/catalog`: lee el snapshot guardado de Carrefour Comerciante.
- `POST /sources/carrefour-comerciante/catalog/sync`: sincroniza productos de Carrefour Comerciante usando la sesion guardada.
- `POST /search`: busqueda viva directa.

## Fuentes configuradas

Fuentes activas o preparadas:

- Aguiar Resistencia / Tokin
- Maxiconsumo Chaco
- Maxiconsumo Web
- Supermayorista Vital Online
- Carrefour Comerciante / Maxi Pedido
- Carrefour Argentina
- Yaguar Chaco
- Vea Argentina
- Jumbo Argentina
- Disco Argentina
- DIA Argentina
- La Anonima Supermercado
- MasOnline / ChangoMas
- Cordiez
- Depot Express

Fuentes identificadas pero no activas por falta de catalogo/precios publicos confiables:

- Distribuidora Jota Be
- El Popular Mayorista

## Prioridad visual de competidores

Cuando hay comparaciones por fuente, se prioriza este orden visual:

1. Maxiconsumo Chaco
2. Maxiconsumo Web
3. Vital
4. Carrefour Comerciante / Maxi Pedido
5. Carrefour
6. Cheek
7. Yaguar / Jaguar
8. Cucher Mercados
9. Revista

Aguiar/Tokin se mantiene separado como referencia propia cuando corresponde.

### Maxiconsumo Chaco

Fuente mayorista principal para el NEA: https://maxiconsumo.com/sucursal_chaco/

La app usa esta sucursal como referencia principal entre mayoristas. Si no trae
datos, revisar primero:

```bash
MAXICONSUMO_ENABLED=true
MAXICONSUMO_EMAIL=
MAXICONSUMO_PASSWORD=
MAXICONSUMO_HOME_URL=https://maxiconsumo.com/sucursal_chaco/
MAXICONSUMO_LOGIN_URL=https://maxiconsumo.com/sucursal_chaco/customer/account/login/
```

### Resolver de busquedas por categoria

La vista de categorias busca por varias variantes del rubro para traer mas
productos comparables. Para priorizar mayoristas sin disparar demasiado ruido en
minoristas, se puede ajustar desde el worker:

```bash
CATEGORY_SEARCH_MAX_QUERIES=8
CATEGORY_SEARCH_MAX_QUERIES_MAYORISTA=8
CATEGORY_SEARCH_MAX_QUERIES_MINORISTA=5
CATEGORY_SEARCH_MAX_QUERIES_YAGUAR=2
CATEGORY_SEARCH_CONCURRENCY=8
```

Si faltan resultados mayoristas, subir primero
`CATEGORY_SEARCH_MAX_QUERIES_MAYORISTA`. Si Yaguar queda lento, bajar
`CATEGORY_SEARCH_MAX_QUERIES_YAGUAR`.

### Sincronizacion programada

El frontend incluye un cron de Vercel en `apps/web/vercel.json`:

- Lunes 9:00 Argentina: `0 12 * * 1` UTC.
- Todos los dias 12:00 Argentina: `0 15 * * *` UTC.

Ambos llaman `GET /api/cron/catalog-sync`, que valida `CRON_SECRET` y dispara
`POST /catalog/sync/background` en el worker. El endpoint del worker responde
rapido y la sincronizacion sigue en background, por eso no bloquea la funcion de
Vercel.

Variables necesarias en produccion:

```bash
# Vercel / frontend
CRON_SECRET=<clave-larga-aleatoria>
WORKER_CRON_SECRET=<misma-clave-si-el-worker-usa-CATALOG_SYNC_SECRET>
CATEGORY_SEARCH_MODE=catalog

# Worker
CATALOG_SYNC_SECRET=<misma-clave>
CATEGORY_SEARCH_MODE=catalog
AUTO_SYNC_ON_STARTUP=true
CATALOG_SYNC_TIMEOUT_MS=1200000
```

Operacion recomendada: dejar categorias en modo `catalog`, usar
`/busqueda-general` para consultas vivas puntuales y revisar `/health` o
`/catalog` para confirmar `lastSyncedAt` despues del cron.

### Yaguar Chaco

Yaguar usa las mismas credenciales de Tokin si no se cargan variables propias:

```bash
YAGUAR_ENABLED=true
YAGUAR_BROWSER_FALLBACK=true
YAGUAR_SOURCE_TIMEOUT_MS=45000
YAGUAR_EMAIL=
YAGUAR_PASSWORD=
```

Si `YAGUAR_EMAIL` y `YAGUAR_PASSWORD` quedan vacias, el worker intenta
`TOKIN_EMAIL` y `TOKIN_PASSWORD`. El fallback con navegador real queda activo
por defecto porque el login de Yaguar puede aceptar credenciales por AJAX pero
no conservar la sesion en una llamada HTTP manual. Si el catalogo tarda en
cargar, subir `YAGUAR_SOURCE_TIMEOUT_MS`.

### Carrefour Comerciante / Maxi Pedido

Fuente mayorista esperada: https://comerciante.carrefour.com.ar/

El sitio permite ver productos publicos, pero oculta precios como `private` hasta completar el formulario de comercio. Para Chaco se detecto:

- Provincia: `CHACO`
- Sucursal: `506` - CARREFOUR MAXI RESISTENCIA CHACO
- Tipo de entrega: `envio` o `retiro` (`envio` es el valor recomendado porque coincide con el flujo validado del formulario)

Datos a completar en el worker:

```bash
CARREFOUR_COMERCIANTE_ENABLED=true
CARREFOUR_COMERCIANTE_NAME=
CARREFOUR_COMERCIANTE_DOCUMENT=
CARREFOUR_COMERCIANTE_PHONE=
CARREFOUR_COMERCIANTE_EMAIL=
CARREFOUR_COMERCIANTE_COOKIE=
CARREFOUR_COMERCIANTE_USER_AGENT=
CARREFOUR_COMERCIANTE_AUTO_LOGIN=false
CARREFOUR_COMERCIANTE_REGION=CHACO
CARREFOUR_COMERCIANTE_SELLER_ID=506
CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio
CARREFOUR_COMERCIANTE_SOURCE_TIMEOUT_MS=20000
CARREFOUR_COMERCIANTE_RECAPTCHA_TIMEOUT_MS=5000
```

`CARREFOUR_COMERCIANTE_SOURCE_TIMEOUT_MS` tiene un minimo operativo de 20000ms
en codigo para evitar que una variable vieja de produccion corte el login antes
de que Carrefour termine de responder.

Si Carrefour rechaza el login automatico por reCAPTCHA Enterprise, cargar
`CARREFOUR_COMERCIANTE_COOKIE` en el entorno del worker con una cookie vigente
obtenida desde una sesion manual donde los precios ya sean visibles. No guardar
esa cookie en el repositorio.

Si se carga `CARREFOUR_COMERCIANTE_COOKIE`, cargar tambien
`CARREFOUR_COMERCIANTE_USER_AGENT` con el User-Agent exacto del navegador donde
se obtuvo esa cookie.

La app incluye `/configuracion` con dos caminos:

- `Conectar desde backend`: el worker completa el formulario con datos del
  comercio y guarda la sesion solo si Carrefour devuelve precios visibles.
- `Validar cookie`: fallback manual para pegar una cookie de una sesion donde ya
  se vean precios.

El resultado correcto es `Sesion valida`, con productos y precios visibles. Si
devuelve `Precios privados`, Carrefour no autorizo esa sesion. Cloudflare puede
atar `cf_clearance` al navegador, User-Agent e IP, por eso una cookie copiada de
un navegador local puede no servir desde el worker aunque sea reciente.

El login automatico de Carrefour Comerciante queda desactivado por defecto porque
reCAPTCHA Enterprise devuelve productos con precio privado. Para forzar el
intento experimental, usar `CARREFOUR_COMERCIANTE_AUTO_LOGIN=true`.

Nota tecnica: no cargar tokens manuales en `.env`: vencen y no sirven como
credencial estable. Si Carrefour devuelve productos con `data-price="private"`,
la fuente queda como pendiente/requiere login y no inventa precios ni bloquea el
tablero.

## Publicacion

Frontend recomendado: Vercel.

Worker recomendado: Railway, Render, Fly.io u otro host que soporte Node.js/Playwright. El worker necesita variables de entorno y acceso saliente a internet para consultar las fuentes.

Para Vercel, configurar en `apps/web`:

```bash
WORKER_URL=https://URL-DEL-WORKER
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_PERSIST_PRICE_LISTS=true
```

Despues de cambiar `WORKER_URL`, redeployar el frontend.

## Sesiones de fuentes privadas

Para fuentes con precios privados, como Carrefour Comerciante, el usuario final no debe copiar cookies ni usar DevTools. El flujo recomendado es:

1. Un administrador entra en `/configuracion`.
2. Usa `Conectar desde backend` con los datos del comercio o con esos datos ya
   cargados en variables del worker.
3. Si el resultado es `Sesion valida`, la sesion queda guardada en el worker.
4. Ejecuta `Sincronizar catalogo`.
5. La app usa el snapshot guardado en categorias y comparativas.

Si el backend no logra ver precios por reCAPTCHA/Cloudflare, usar el fallback
`Validar cookie` desde una sesion manual con precios visibles. Si ambos caminos
devuelven precios privados, la solucion estable es una API/feed oficial del
proveedor o un navegador remoto persistente ejecutado en la misma infraestructura
del worker.

Variables recomendadas en el worker:

```bash
CARREFOUR_COMERCIANTE_ENABLED=true
SOURCE_SESSION_SECRET=<clave-larga-aleatoria>
CARREFOUR_COMERCIANTE_REGION=CHACO
CARREFOUR_COMERCIANTE_SELLER_ID=506
CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio
```

`SOURCE_SESSION_SECRET` cifra las cookies guardadas. Si no se configura, el MVP guarda en modo local sin cifrado fuerte, util solo para desarrollo. En produccion usar un worker con disco durable/volumen o mover `worker/data/source-sessions.json` y `worker/data/source-snapshots.json` a una base de datos.

## Matching con IA

La IA es opcional y debe quedar apagada por defecto para cuidar costo. Solo ayuda a resolver matches dudosos cuando ya existen candidatos devueltos por Tokin.

```bash
AI_MATCHING_ENABLED=true
OPENAI_API_KEY=<api_key>
AI_MATCHING_MODEL=gpt-4.1-nano
AI_MATCHING_MIN_CONFIDENCE=82
AI_MATCHING_MAX_CANDIDATES=5
AI_MATCHING_TIMEOUT_MS=6000
```

## Datos y persistencia

- El catalogo vivo del worker se guarda como snapshot actual en `worker/data/catalog.json`.
- No se debe editar a mano `worker/data/catalog.json`; se regenera desde las fuentes.
- Las corridas historicas/evolucion usan Supabase solo si `SUPABASE_PERSIST_PRICE_LISTS=true` y las claves estan configuradas.
- Los CSV reales de listas externas pueden cargarse en `worker/data/imports/*.csv`; los `.example.csv` no se cargan.
