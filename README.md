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
ENABLE_LIVE_SEARCH=false
NEXT_PUBLIC_TARGET_GROSS_MARGIN_PERCENT=20
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
AUTO_SYNC_ON_STARTUP=false
ENABLE_LIVE_SEARCH=false
CATEGORY_SEARCH_MODE=catalog
PRICE_LIST_DIRECT_AGUIAR_LOOKUP=false
CATALOG_SYNC_SECRET=
CATALOG_SYNC_TIMEOUT_MS=1200000
SOURCE_SESSION_STORE_BACKEND=supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SOURCE_SESSION_SECRET=

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
- Supabase guarda historial/evolucion de corridas y, en produccion, sesiones/snapshots de fuentes privadas como Carrefour Comerciante.
- `SOURCE_SESSION_STORE_BACKEND=supabase` fuerza que el worker guarde sesiones y snapshots en Supabase; usar `auto` o `file` solo para desarrollo.
- `CATEGORY_SEARCH_MODE=catalog` hace que categorias consulte el catalogo precargado; usar `live` solo para diagnostico.
- `ENABLE_LIVE_SEARCH=false` desactiva el endpoint de scraping online.
- `AUTO_SYNC_ON_STARTUP=false` evita que el worker actualice listas al arrancar; la actualizacion queda a cargo del cron.
- `PRICE_LIST_DIRECT_AGUIAR_LOOKUP=false` evita consultas directas a Tokin al evaluar listas importadas.
- `NEXT_PUBLIC_TARGET_GROSS_MARGIN_PERCENT=20` propone el margen objetivo inicial del editor de costos. Cada articulo guarda su propio objetivo confirmado; no habilita calculos sin condiciones de compra y venta.
- `CATALOG_SYNC_SEED_MAX_TERMS=160` limita cuantas semillas de `worker/data/catalog-search-seeds.txt` usa el cron diario.
- `CRON_SECRET` en Vercel y `CATALOG_SYNC_SECRET` en el worker deben tener el mismo valor, salvo que uses `WORKER_CRON_SECRET`.
- El cron diario no ejecuta `/catalog/sync` completo: consulta cuatro fuentes por dia (Aguiar/Tokin, Maxiconsumo Chaco y dos rotativas), procesa dos terminos por fuente y consolida en Supabase los snapshots acumulados. Asi conserva avances dentro del limite de Vercel aunque una fuente falle o tarde demasiado.

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
- `/revisiones`: asuntos operativos de la ultima lista guardada.
- `/alertas`: alertas del catalogo diario, cobertura y diferencias mayoristas.
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
- `POST /search`: busqueda viva directa; queda desactivada por defecto con `ENABLE_LIVE_SEARCH=false`.

## Fuentes configuradas

Fuentes activas o preparadas:

- Aguiar Resistencia / Tokin
- Maxiconsumo Chaco
- Maxiconsumo Web
- Supermayorista Vital Online
- Carrefour Comerciante / Maxi Pedido
- Cheek S.A. Resistencia (revista digital)
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
5. Cheek S.A. Resistencia
6. Yaguar / Jaguar
7. Cucher Mercados
8. Minoristas: Vea, Carrefour, ChangoMas, Jumbo, Disco, DIA, La Anonima y Cordiez

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

### Cheek S.A. Resistencia

El cron descarga la revista digital oficial publicada en
https://cheeksa.com.ar/, renderiza sus paginas y usa OCR para guardar las
ofertas como un snapshot mayorista en Supabase. No requiere credenciales.

```bash
CHEEK_ENABLED=true
CHEEK_HOME_URL=https://cheeksa.com.ar/
CHEEK_OCR_LANGUAGE=spa
CHEEK_OCR_TIMEOUT_MS=240000
```

La revista informa precios promocionales y vigencia, pero no representa
necesariamente el catalogo completo ni confirma stock. Cuando aparece una
edicion nueva, el snapshot anterior de Cheek se reemplaza para no mezclar
ofertas vencidas.

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

- Todos los dias 12:00 Argentina: `0 15 * * *` UTC.

El cron llama `GET /api/cron/catalog-sync`, valida `CRON_SECRET`, actualiza un
bloque rotativo de fuentes/terminos y luego consolida los snapshots del worker.
Despues analiza las familias configuradas, persiste alertas deduplicadas en
Supabase y, si Resend esta configurado, envia un resumen por correo. Una falla de
alertas o correo no invalida una actualizacion correcta del catalogo.
`WORKER_URL` es obligatorio en produccion; no se usa un worker publico de
respaldo porque podria ocultar una configuracion incorrecta.

La sincronizacion protege el ultimo dato valido: una corrida vacia o una caida
masiva por debajo del 20% de un catalogo previo grande no reemplaza el snapshot.
En ese caso `usingLastGoodSnapshot` queda activo y la web muestra la antiguedad
real del catalogo conservado.

Variables necesarias en produccion:

```bash
# Vercel / frontend
WORKER_URL=https://URL-DEL-WORKER-PERSISTENTE
CRON_SECRET=<clave-larga-aleatoria>
WORKER_CRON_SECRET=<misma-clave-si-el-worker-usa-CATALOG_SYNC_SECRET>
CATEGORY_SEARCH_MODE=catalog
ENABLE_LIVE_SEARCH=false
ALERT_CATEGORY_QUERIES=alfajores,jugos en polvo,galletitas,mermeladas,chocolates,salsas y aderezos,cereales y barritas,golosinas
ALERT_CATEGORY_TIMEOUT_MS=20000

# Correo opcional
RESEND_API_KEY=<api-key-de-resend>
ALERT_EMAIL_TO=<destinatario>
ALERT_EMAIL_FROM=Aguiar Alertas <alertas@dominio-verificado.com>

# Worker
CATALOG_SYNC_SECRET=<misma-clave>
CATEGORY_SEARCH_MODE=catalog
ENABLE_LIVE_SEARCH=false
AUTO_SYNC_ON_STARTUP=false
PRICE_LIST_DIRECT_AGUIAR_LOOKUP=false
CATALOG_SYNC_TIMEOUT_MS=1200000
CATALOG_SYNC_SEED_MAX_TERMS=160
```

Operacion recomendada: dejar categorias y busqueda general en modo `catalog`;
revisar `/health` o `/catalog` para confirmar `lastSyncedAt` despues del cron.
El cron de Vercel corre a las `15:00 UTC` (`12:00` de Argentina) y llama a
`/api/cron/catalog-sync`. Cada dia rota el bloque consultado para evitar el
limite de duracion de Vercel; los resultados anteriores se conservan y el
catalogo final se reconstruye desde los snapshots guardados por fuente.
El archivo `worker/data/catalog-search-seeds.txt` agrega familias y lineas de la
lista general de articulos para que el cron precargue mas productos y la
importacion de Excel compare contra el snapshot, sin scraping por cada carga.

Las alertas requieren ejecutar la migracion
`supabase/migrations/20260721210000_pricing_alerts.sql`. Se deduplican por
fuente/producto/tipo y usan estados `Nueva`, `Revisada` y `Resuelta`. Si una
familia falla durante la corrida, el sistema conserva las alertas anteriores en
lugar de resolverlas de forma incorrecta.

La importacion conserva por separado el precio recibido en el Excel y el precio
obtenido de Tokin/Arcor. El Excel tiene prioridad; Tokin se usa como fallback
cuando el Excel no trae precio. Ambos valores, el precio seleccionado y el
motivo de seleccion quedan versionados en el historial.

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
SOURCE_SESSION_STORE_BACKEND=supabase
SUPABASE_URL=<url-del-proyecto>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SOURCE_SESSION_SECRET=<clave-larga-aleatoria>
CARREFOUR_COMERCIANTE_REGION=CHACO
CARREFOUR_COMERCIANTE_SELLER_ID=506
CARREFOUR_COMERCIANTE_DELIVERY_TYPE=envio
```

`SOURCE_SESSION_SECRET` cifra las cookies antes de guardarlas. Con Supabase activo, la sesion queda en `source_sessions`, los catalogos por fuente quedan en `source_catalog_snapshots` y el catalogo consolidado queda en `catalog_snapshots`. Si Supabase no esta configurado, el worker cae a storage local solo para desarrollo.

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

### Evaluacion consistente e impacto comercial

- Categorias y Busqueda general enlazan los productos con la ultima importacion manual guardada usando EAN de unidad o codigo exacto de Tokin. No enlazan por parecido del nombre, no convierten EAN de bulto a unidad y excluyen identidades ambiguas.
- La mesa comparte los calculos de Importacion, Historial y Revisiones: Excel es venta, Tokin referencia del proveedor. Usa la ultima evaluacion guardada de la lista manual activa (incluida su actualizacion diaria vinculada por `sourceRunId`). No mezcla precios de capturas distintas ni renueva artificialmente su vigencia. El cron conserva las condiciones y actividad solamente cuando coinciden fila, codigo/EAN y UxB; mantiene sus fechas originales. Una carga diaria de otra lista no puede reemplazar la activa.
- El catalogo completo y sus imagenes quedan en el detalle secundario. Sin carga Excel o sin identidad exacta no se declara competitividad de Aguiar. Una falla al leer Supabase es visible y permite reintentar.
- No requiere migracion SQL. Se conservan datos opcionales de actividad en el JSON de cada articulo. Las listas de mas de 1000 filas se leen por paginas.

Columnas opcionales del Excel (cantidades en la misma unidad de venta, nunca en bultos):

| Columna | Dato |
| --- | --- |
| Unidades vendidas | Cantidad real del periodo, admite cero |
| Dias del periodo | Entero entre 1 y 366 |
| Ventas hasta | Fecha de cierre del periodo |
| Stock unidades | Stock propio disponible, admite cero |
| Fecha stock | Fecha de ese inventario |

Fechas: celdas de fecha de Excel, `AAAA-MM-DD` o `DD/MM/AAAA`. No se adivinan cantidades ausentes. Ventas con mas de 45 dias o stock con mas de 7 dias no generan estimaciones vigentes.

- Volumen equivalente 30 dias = unidades vendidas / dias del periodo * 30. Es un escenario constante, no un pronostico.
- Exposicion de precio = diferencia absoluta entre venta Excel y mediana mayorista * volumen equivalente. Se deduplican fuentes; se excluyen precios viejos, matches debiles, stock desconocido/sin stock y promociones/condiciones detectadas. Una sola fuente se indica como cobertura limitada; el minimo no se llama precio de mercado.
- Se muestran ademas venta a precio Excel, contribucion estimada con costos confirmados, stock valorizado y dias de cobertura. No son perdida de ventas, rentabilidad neta ni beneficio garantizado. Los impuestos/condiciones de terceros requieren validacion comercial.
- Importacion ordena por exposicion o severidad. Revisiones prioriza exposicion calculable; datos faltantes siguen visibles. XLSX incluye actividad, formulas derivadas y alcance. No hay integracion automatica con ERP: el cliente debe aportar ventas/stock reales en el Excel.

### Condiciones de costo

- Excel es precio de venta; Tokin es referencia del proveedor, no costo final ni precio propio. La diferencia publicada Excel/Tokin se conserva separada del recargo sobre costo ajustado.
- En Importacion, abrir **Condiciones de costo** en el articulo. Confirmar si compra y venta incluyen IVA y sus tasas, porcentaje del IVA compra recuperable, descuentos adicionales, bonificacion monetaria adicional, flete por unidad, financiacion, otros costos por unidad y margen objetivo. Los valores vacios no se interpretan como cero. No se presume una alicuota ni un regimen fiscal.
- Descuento y bonificacion son porcentajes sucesivos sobre mercaderia neta: `neto * (1 - descuento) * (1 - bonificacion)`. No volver a informar descuentos ya incluidos en Tokin. Bonificaciones en unidades requieren prorrateo previo; no son el porcentaje monetario de este formulario.
- Costo ajustado = mercaderia descontada + IVA no recuperable + financiacion + flete + otros costos. Financiacion se aplica a mercaderia descontada mas IVA no recuperable; flete y otros costos se informan por unidad netos de IVA recuperable, incluyendo cargos no recuperables.
- Recargo = `(venta neta - costo ajustado) / costo ajustado`. Margen estimado = `(venta neta - costo ajustado) / venta neta`. El piso se calcula como `costo ajustado / (1 - margen objetivo)` y se convierte a la misma base IVA del Excel. Es margen sobre los costos informados, **no rentabilidad neta**; no calcula automaticamente gastos fijos, comisiones, impuestos ni costos omitidos.
- Sin condiciones completas, o con Tokin desactualizado/no comparable, no se calcula margen ni piso. El mercado publicado queda visible, pero no habilita consejo firme de baja o aumento. La base impositiva y condiciones de los competidores tambien deben verificarse antes de ejecutar una decision.
- Aplicar modifica la carga en pantalla. **Guardar en historial** persiste condiciones por articulo en `source_prices` JSON version 5; modificar una carga guardada requiere guardar una nueva version. XLSX incluye condiciones y desglose. No requiere migracion SQL.
- Historial/Revisiones usan el mismo motor. Evolucion calcula cada margen con venta, Tokin y condiciones de la misma captura, validando la fecha de Tokin en esa captura. Las cargas anteriores sin condiciones no reconstruyen un margen ficticio. Las condiciones no se copian automaticamente a otro articulo ni a nuevas importaciones. El cron conserva las de su Excel de origen solo para el mismo articulo y presentacion, sin renovar su fecha de confirmacion.

### Vigencia de precios

- Cada precio consultado por el worker lleva `observedAt`; la referencia Tokin de una importacion conserva `ownPrice.tokinObservedAt`. Estas fechas se mantienen en snapshots e historial JSON, sin migracion SQL adicional.
- El extractor manual de Carrefour incluye `capturedAt`. Importar un lote viejo conserva esa fecha; los lotes anteriores sin fecha se guardan como datos sin vigencia verificada. La importacion de snapshots admite `observedAt` por producto y no lo deduce de `syncedAt`.
- `lastSyncedAt` indica la consolidacion del catalogo, no la renovacion de todos sus precios. Una sincronizacion parcial conserva la fecha de los articulos no consultados y reemplaza la version anterior del mismo SKU/presentacion aunque el precio suba.
- Para decisiones actuales, solo se usan referencias de hasta 36 horas. Entre 36 y 72 horas se pide actualizar; despues se marcan desactualizadas. Los datos sin fecha (incluidos catalogos legacy y CSV externos sin trazabilidad) se conservan para revision, sin acreditar vigencia.
- La fecha se muestra en los detalles de categoria, busqueda e importacion y en el XLSX. Un costo Tokin sin vigencia no habilita margen ni precio objetivo. Las alertas monetarias excluyen referencias vencidas; la cobertura puede seguir mostrando datos guardados.
- El cron sigue siendo incremental: consulta fuentes y terminos por bloques. No garantiza renovar todo el surtido cada dia. Tras publicar worker y web, los precios anteriores quedaran sin fecha hasta ser consultados realmente; no se les asigna la fecha del deploy o del cron.

- En produccion, el catalogo consolidado del worker se guarda en Supabase, tabla `catalog_snapshots`, cuando existen `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SOURCE_SESSION_STORE_BACKEND=supabase`.
- `worker/data/catalog.json` queda como fallback local/desarrollo; no se debe editar a mano porque se regenera desde las fuentes.
- Las corridas historicas/evolucion usan Supabase solo si `SUPABASE_PERSIST_PRICE_LISTS=true` y las claves estan configuradas.
- Las cargas nuevas guardan dentro de `price_list_run_items.source_prices` un objeto JSON versionado con precios de competencia, `Precio Excel`, `Precio Tokin/Arcor` y dimensiones del articulo. Las filas antiguas guardadas como array siguen siendo compatibles.
- Una carga sin ningun precio propio de Excel/Tokin no se guarda para evolucion. Las cargas parciales se guardan como borrador y registran cobertura propia en `price_list_runs.metadata`.
- Las cargas antiguas sin detalle propio pueden archivarse desde Historial; se cambia su estado a `archived` sin eliminar filas.
- No hace falta una migracion adicional para esta separacion porque `source_prices` ya es `jsonb`. Solo las cargas guardadas despues de este cambio pueden reconstruir ambos precios; las anteriores se muestran como `Propio historico` cuando el origen no se puede determinar.
- Las sesiones privadas y snapshots por fuente usan Supabase desde el worker cuando existen `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SOURCE_SESSION_STORE_BACKEND=supabase`.
- Antes de usar el modo offline persistido en produccion, aplicar las migraciones `supabase/migrations/20260701213000_source_sessions.sql` y `supabase/migrations/20260707123000_catalog_snapshots.sql`.
- Para confirmar o rechazar equivalencias desde **Revisiones** y reutilizarlas en importaciones futuras, aplicar tambien `supabase/migrations/20260720193000_product_match_overrides.sql`.
- Los CSV reales de listas externas pueden cargarse en `worker/data/imports/*.csv`; los `.example.csv` no se cargan.

### Preparacion de una demo privada

Ver `docs/preparacion-demo.md` para el recorrido, las verificaciones y los pendientes reales.

- `npm run demo:access` genera credenciales locales en `.demo/access.json` (ignorado por Git, permisos 0600); no cambia `.env` ni Vercel.
- `npm run demo:check -- --remote` audita configuracion, catalogo local y conectividad configurada. Solo hace lecturas; salida 1 significa que quedan pendientes.
- Tras `npm run build`, `npm run demo:preview -- --local-worker` abre web privada en `http://127.0.0.1:3010` y worker en 4041, usando el snapshot historico local, sin Supabase ni sincronizacion. No demuestra persistencia real.
- Produccion requiere `APP_ACCESS_USERNAME` y `APP_ACCESS_PASSWORD` (24 caracteres minimo) en el servidor web, y `WORKER_API_SECRET` (32 minimo) compartido entre web y worker. Falta de configuracion cierra el acceso, no lo deja publico. `WORKER_URL` debe ser explicito y HTTPS fuera de localhost.
- Cron conserva `CRON_SECRET` / `WORKER_CRON_SECRET` / `CATALOG_SYNC_SECRET`, separado de la clave API. El acceso privado de demo es compartido y no reemplaza usuarios individuales, roles, MFA ni auditoria por usuario.
- El worker tambien cierra el acceso si NODE_ENV esta ausente. Desarrollo sin claves requiere `NODE_ENV=development`; no usarlo en despliegues publicos.
- No publicar solo una mitad del cambio: configurar web y worker y revisar el despliegue coordinado. No usar variables `NEXT_PUBLIC_*` para secretos. Rotar claves previamente expuestas antes de compartir un acceso externo.
