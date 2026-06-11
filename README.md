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

## Worker endpoints

- `GET /health`: estado del worker.
- `GET /catalog`: snapshot actual del catalogo.
- `POST /catalog/sync`: sincroniza fuentes y reemplaza el snapshot.
- `POST /catalog/search`: busca sobre el catalogo actual.
- `POST /catalog/category-search`: agrupa resultados por familia/categoria.
- `POST /catalog/price-list`: compara una lista importada.
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
- Sabor y Aroma Mayorista

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

### Carrefour Comerciante / Maxi Pedido

Fuente mayorista esperada: https://comerciante.carrefour.com.ar/

El sitio permite ver productos publicos, pero oculta precios como `private` hasta completar el formulario de comercio. Para Chaco se detecto:

- Provincia: `CHACO`
- Sucursal: `506` - CARREFOUR MAXI RESISTENCIA CHACO
- Tipo de entrega: `envio` o `retiro` (`envio` es el valor recomendado porque coincide con el flujo validado del formulario)

Datos a completar en el worker:

```bash
CARREFOUR_COMERCIANTE_ENABLED=false
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
se obtuvo esa cookie. Cloudflare puede atar `cf_clearance` al User-Agent.

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
