# Preparacion de la presentacion

Revision: 22 de septiembre de 2026. Cambios locales sin commit, push ni deploy.
Rama existente: `codex/migration-20260907`.

## Alcance

Demo funcional del asistente, no aprobacion de una operacion empresarial desatendida.
Excel es precio de venta propio. Tokin es referencia de proveedor. Mayoristas son la referencia competitiva prioritaria.
Sin presentacion equivalente, vigencia y condiciones de costo confirmadas no hay margen ni consejo firme de cambio de precio.

## Evidencia encontrada

| Control | Resultado observado |
| --- | --- |
| Cron en produccion | Log de Vercel del 22/09/2026: inicio 12:24:07 de Argentina, HTTP 200, termino en 40 segundos |
| Alcance de esa corrida | Tokin, Maxiconsumo Chaco, DIA y La Anonima; dos terminos por fuente. Cuatro fuentes reportaron actualizacion |
| Catalogo consolidado remoto | El log informa 10.644 productos; no acredita 10.644 precios renovados ese dia |
| Alertas | El log informa 75 generadas, sin error de alertas |
| Evolucion diaria | No se guardo: el cron informa que no encontro una lista importada con articulos. Revisar la carga activa y que web/cron lean el mismo Supabase |
| Versiones publicadas | La lista de deployments muestra `main` b9a6fb3 como ultima produccion y 4b92c65 como preview. Los cambios locales actuales no estan alli |
| Catalogo local | 1.410 productos, consolidacion 08/06/2026 UTC; ninguno tiene `observedAt`. No es copia actual de produccion |
| Conexion local a produccion | No hay WORKER_URL ni credenciales de Supabase en esta copia local. No se valido persistencia remota ni se escribieron datos |

El cron esta configurado para las 12 argentinas, pero la ejecucion observada fue a las 12:24. El horario configurado no prueba puntualidad al minuto.
Es incremental: Tokin y Maxiconsumo Chaco tienen prioridad diaria; otras fuentes rotan. No prometer actualizacion completa de todos los articulos todos los dias.

## Excel disponible

Fuente inspeccionada sin modificar: `Lista de Articulos - HUMAN.xlsx`, hoja `01-06-2026`, columnas A:K.
Tiene 1.034 articulos con descripcion/codigo, precio unitario positivo y UxB. Hay 868 filas con EAN de unidad y 869 con EAN de display; dos repeticiones adicionales de EAN de unidad requieren revision, no asumir equivalencia unica.
Nueve descripciones contienen "alfajor". No hay columnas de ventas, stock, condiciones impositivas ni fecha de observacion por precio.
No renombrar el archivo ni reimportarlo como si sus precios fueran de hoy. Solicitar Excel vigente al cliente para una demo comercial actual.

## Acceso y configuracion

El navegador solicita usuario y clave HTTP Basic para todas las paginas privadas. Cada API privada vuelve a validar el acceso antes de leer o modificar datos.
Las escrituras desde otro origen se rechazan. El worker exige una clave de API independiente; `/health` solo expone `{ok:true}`. Los endpoints de cron conservan su propia autenticacion Bearer.

| Entorno | Variables |
| --- | --- |
| Web, solo servidor | APP_ACCESS_USERNAME, APP_ACCESS_PASSWORD, WORKER_API_SECRET, WORKER_URL |
| Worker | WORKER_API_SECRET, igual al de web |
| Cron, conservar configuracion | CRON_SECRET en web; WORKER_CRON_SECRET apunta a CATALOG_SYNC_SECRET/CRON_SECRET del worker |
| Persistencia, conservar configuracion | SUPABASE_URL y clave privada de servidor; SOURCE_SESSION_SECRET y storage Supabase en worker |

`npm run demo:access` genera claves aleatorias en `.demo/access.json`. Ese archivo tiene permisos restringidos y no se versiona. El comando no carga variables remotas ni modifica los `.env` existentes. Repetirlo conserva las claves.
La clave API tiene al menos 32 caracteres; la clave de usuario, al menos 24. Usar HTTPS fuera de localhost y no poner secretos en NEXT_PUBLIC, capturas, documentos ni chats.
Antes de publicar, configurar ambos servicios y hacer un despliegue coordinado: un frontend nuevo contra un worker viejo no acredita que el backend este protegido. Rotar cualquier clave de servicio que se haya compartido anteriormente.
Este acceso compartido es temporal para demo/piloto. Faltan usuarios individuales, roles, revocacion por usuario, limites de intentos y auditoria empresarial.

## Comandos reproducibles

```bash
npm run test
npm run typecheck
npm run build
npm run demo:access
npm run demo:check -- --remote
npm run demo:preview -- --local-worker
```

El chequeo no importa datos, no ejecuta cron y no consulta proveedores. Su informe `.demo/readiness.json` no contiene claves. Un codigo de salida 1 indica pendientes, no que la app haya fallado al compilar.
La vista local abre en `http://127.0.0.1:3010`, con las credenciales del archivo privado. `DEMO_PORT` y `DEMO_WORKER_PORT` permiten elegir otros puertos. La opcion `--local-worker` usa datos locales historicos y deshabilita Supabase en esos procesos, no en produccion.

Con la vista local en marcha, comprobar las rutas y el worker real:

```bash
CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run demo:browser
```

En otro sistema, usar su Chrome instalado o el Chromium de Playwright. Las capturas se guardan en `.demo/`. No contienen las claves.

## Recorrido de siete minutos

1. Abrir Importacion y cargar una lista vigente de 20 a 30 articulos. Confirmar precio unitario, UxB, EAN de unidad y fecha de origen antes de avanzar. Dejar ausente lo que el cliente no haya informado.
2. Mostrar una fila comparable: venta Excel, proveedor Tokin, mejor mayorista y diferencia. Explicar que un menor costo del proveedor no es el precio de venta propio.
3. Abrir Condiciones de costo. Confirmar IVA, descuentos ya incluidos, flete y otros costos solo con datos del cliente. Mostrar diferencia entre recargo y margen.
4. Mostrar un caso sin equivalencia o sin vigencia: la herramienta debe pedir revision en vez de recomendar una baja.
5. Si hay ventas y stock fechados, ordenar por impacto. Sin ellos, explicar el faltante; no mostrar volumen inventado.
6. Guardar en historial, abrir la carga y comprobar los mismos precios. Buscar el articulo en categorias y verificar la evaluacion vinculada al Excel guardado.
7. Descargar XLSX y cotejar una fila. Mostrar cobertura y alertas al final, distinguiendo dato presente, dato vigente y fuente pendiente.

## Criterios antes de presentar datos actuales

- [ ] Usuario del cliente confirma la lista Excel vigente, unidades e impuestos.
- [ ] Hay al menos 20 articulos revisados, con precio propio y referencias recientes; cubrir tambien casos sin datos sin maquillarlos.
- [ ] Importar, guardar, recargar Historial y exportar funciona contra el Supabase del entorno de presentacion.
- [ ] El cron encuentra la lista guardada y persiste una evaluacion diaria vinculada. Si no, revisar SUPABASE_URL de web y cron, filtros de cargas activas y migraciones.
- [ ] Comparar unidad contra unidad; mostrar bulto aparte. No convertir un EAN de display en EAN unitario.
- [ ] Confirmar cobertura real de mayoristas y no prometer acceso automatico a Carrefour si la sesion no esta autorizada.
- [ ] Configurar acceso privado de web y worker, publicar solo despues de la revision y probar ambas URLs sin credenciales.
- [ ] Preparar capturas o exportacion del caso revisado, identificadas con fecha, para no depender de conectividad durante la reunion.

## Cambios de esta preparacion

- `apps/web/src/lib/app-access.ts`, `apps/web/src/middleware.ts`: control de acceso y origen.
- `apps/web/src/lib/worker-request.ts`: autenticacion del proxy, destino explicito, sin redirecciones de credenciales.
- `apps/web/src/app/api/**/route.ts` excepto cron: guardias; proxies de busqueda/sesiones usan clave API.
- `apps/web/src/lib/catalog-evolution-snapshot.ts` y `pricing-alert-sync.ts`: consultas posteriores al cron usan clave API. Los envios de correo no reciben esa clave.
- `worker/src/api-access.ts`, `worker/src/server.ts`: acceso del backend, cron separado y salud minima.
- Tests de acceso de web/worker/proxy y ajuste del test de cron.
- `apps/web/src/app/configuracion/page.tsx`: ajuste del grid para que las variables tecnicas no ensanchen la pagina en movil.
- `scripts/demo-*.mjs`, `package.json`, `.gitignore`, ejemplos de entorno y README.

Se preservaron los cambios locales anteriores. `worker/data/catalog.json`, `apps/web/src/app/page.tsx` y el lockfile no se modificaron en esta preparacion. No hay migracion SQL nueva.

## Verificaciones ejecutadas

- `npm run test`: 136 pruebas aprobadas (30 worker, 106 web). Incluye acceso, origen, claves de API/cron separadas y las regresiones comerciales anteriores.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado. Hubo advertencias de cache de Webpack por poco espacio en disco; se elimino solamente el cache generado de este proyecto, no archivos fuente ni datos.
- `git diff --check`: aprobado. `.demo/access.json`, informe y logs estan ignorados por Git; repetir la generacion de claves conserva el archivo existente.
- `npm run demo:browser`: aprobado con Chrome/Playwright, ocho paginas a 1440 y 390 px, sin desborde ni errores JavaScript. Se verificaron 401 sin credenciales, 403 para escrituras de otro origen, consulta web -> worker real al catalogo local y ausencia de vigencia ficticia. Configuracion ya no desborda en movil.
- Recorridos de regresion con respuestas de prueba interceptadas: importacion -> condiciones de costo -> guardar -> historial/evolucion -> XLSX; misma evaluacion en categorias/busqueda/revisiones, orden por impacto, casos sin Excel y error de lectura. Aprobados. El guardado simulado NO acredita una escritura en Supabase real.
- `npm run demo:check -- --remote`: termina con codigo 1 de forma esperada porque faltan conexiones locales y el snapshot local no tiene fechas de precio. No se presento ese resultado como aprobacion de produccion.
- Vercel: inspeccion de deployments y log del cron, solo lectura. No se publicaron cambios, no se disparo otra sincronizacion y no se modificaron variables remotas.

Pendiente de aceptacion: lista Excel vigente y caso real guardado/recargado en el Supabase del entorno de presentacion, seguido del despliegue autorizado de web y worker con sus claves. Hasta entonces la vista local sirve para revision funcional, no para decidir precios actuales.
