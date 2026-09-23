# Actualizacion operativa

Revision del 22/09/2026. Publicacion solicitada despues de la revision del usuario.
Los cambios no actualizan por si solos los precios del
catalogo remoto ni convierten el Excel historico en una lista vigente.

## Hallazgos verificados

- Produccion conservaba 10.644 productos y una consolidacion del 22/09/2026,
  pero ninguno tenia `observedAt`. No era posible acreditar la vigencia individual.
- El cron diario recorre cuatro fuentes y dos terminos por fuente. Tokin y
  Maxiconsumo Chaco son diarios; las otras fuentes rotan. No es una descarga
  completa de todas las empresas cada dia.
- El avance por fecha saltaba bloques en fuentes que solo se visitan semanalmente.
- No se encontro una lista `manual_import` activa reconocida. Las capturas
  `scheduled_catalog` historicas no deben convertirse en Excel propio.
- El archivo entregado `Lista de Articulos - HUMAN.xlsx`, hoja `01-06-2026`,
  contiene 1.034 articulos, todos con `Precio x Unid` y `UxB`. Tiene 923 EAN
  unitarios informados y 30 articulos del subrubro Alfajores. Se conserva la
  precision original. La fecha de la hoja es junio, no septiembre.

## Cambios

### Vigencia y decisiones

Configuracion incorpora **Estado para decidir**. Muestra la disponibilidad del
Excel activo, productos guardados, precios consultados en 36 horas, precios de
mas de 36 horas y datos sin fecha verificable. Las fechas invalidas o futuras
no cuentan como vigentes. La cobertura mantiene visibles las fuentes esperadas
sin datos y ordena proveedor, mayoristas y minoristas.

`GET /catalog/status` entrega metadatos y conteos por fuente, sin enviar todo el
catalogo al navegador. Requiere la clave API del worker. El proxy privado
`GET /api/catalog-status` agrega el estado de la lista Excel; no expone secretos.
Un fallo al leer el backend o Supabase queda como "no se pudo verificar", no como
una consulta exitosa con cero resultados.

Un precio vigente no significa equivalencia confirmada ni costo neto confirmado.
Siguen siendo necesarios match, presentacion, unidad, impuestos y condiciones
comerciales compatibles antes de recomendar cambios.

### Recorrido diario

El bloque de una fuente rotativa avanza segun sus visitas programadas, no segun
los dias que no fue consultada. Se registra `sourceOffsets` por fuente en la
respuesta y en el log del cron. Repetir la misma fecha conserva el mismo bloque.

La ejecucion considera las dos tandas de fuentes al reservar tiempo. Si no queda
presupuesto para el analisis posterior, conserva el catalogo guardado y declara
`analysisDeferred`, sin simular una captura de evolucion terminada.

Esto sigue siendo incremental: no hay un cursor durable con reintentos de cada
termino fallido. Renovar todo el surtido diariamente requiere trabajos reanudables
fuera de una unica funcion de cinco minutos. Esa arquitectura sigue pendiente.

### Evolucion y guardado

- Solo se evalua el Excel manual activo. Una captura del mismo dia vinculada a
  otro Excel, o archivada, ya no bloquea la evaluacion.
- La lista se pagina completa, sin el corte silencioso a 1.500 filas.
- Hay un limite explicito de 10.000 filas y un plazo de ejecucion. Si se exceden,
  se informa el problema; no se guarda un subconjunto como si fuera toda la lista.
- Las cargas nuevas permanecen archivadas mientras se escriben sus detalles;
  solo pasan a `review` o `draft` al finalizar. Ante un error se intenta rollback.
  Una interrupcion no deja una carga parcial como nueva referencia activa.
- Venta Excel y costo proveedor Tokin permanecen separados. No se rejuvenecen
  fechas de precios retenidos, condiciones de costo ni datos de ventas/stock.

## Como ayuda a decidir

| Evidencia | Decision que habilita |
| --- | --- |
| Excel con precio de venta | Evaluar la posicion comercial real de Aguiar |
| Tokin comparable y costo confirmado | Calcular margen y piso de venta, sin confundir recargo con margen |
| Mayoristas comparables y vigentes | Priorizar ajustes, negociacion o mantenimiento del precio |
| Fechas o fuentes faltantes | Posponer decisiones fuertes y pedir la evidencia concreta que falta |
| Capturas completas del mismo Excel | Distinguir una variacion real de un cambio de lista o una carga incompleta |

## Validacion

- Tests de rotacion durante 98 dias: cubren todos los bloques de un ejemplo de
  28 terminos para cada fuente rotativa.
- Tests de evolucion: 1.501 filas completas, idempotencia por Excel, captura
  incompleta, fallo de escritura, ausencia de Excel y limites de tiempo/tamano.
- Tests de vigencia: fecha futura, ausente, reciente y antigua; cobertura esperada,
  prioridad mayorista y proteccion de la API.
- Los tests de guardado usan Supabase simulado. No constituyen una prueba de
  escritura en la base productiva con estas modificaciones.
- No requiere una migracion SQL nueva; utiliza estados y columnas existentes.
- `npm test`: 148 tests aprobados (31 worker y 117 web).
- `npm run typecheck` y `npm run build`: aprobados.
- Navegacion local: ocho paginas en 1440 y 390 px, sin errores JavaScript ni
  desbordamiento horizontal. Se probaron consulta de estado y despliegue del
  detalle de fuentes.
- Importacion real del HUMAN en navegador: 1.034 filas distintas, 1.034 precios
  Excel y 1.034 UxB conservados. Sin guardar en produccion. Esto valida la
  lectura, no garantiza que todos los matches del mercado sean correctos.

## Archivos de esta revision

Frontend y API:

```text
apps/web/src/app/api/catalog-status/route.ts
apps/web/src/app/api/cron/catalog-sync/route.ts
apps/web/src/app/configuracion/page.tsx
apps/web/src/components/catalog/CatalogOperationsPanel.tsx
apps/web/src/components/catalog/CatalogFreshnessBanner.tsx
apps/web/src/lib/catalog-readiness.ts
apps/web/src/lib/catalog-sync-sources.ts
apps/web/src/lib/catalog-evolution-snapshot.ts
apps/web/src/lib/price-list-persistence.ts
apps/web/src/lib/pricing-alert-store.ts
apps/web/src/lib/pricing-alert-sync.ts
apps/web/src/lib/supabase-admin.ts
apps/web/src/types/search.ts
```

Worker, pruebas y documentacion:

```text
worker/src/server.ts
worker/src/types.ts
worker/src/price-observations.ts
worker/src/price-observations.test.ts
apps/web/src/lib/catalog-readiness.test.ts
apps/web/src/lib/catalog-sync-sources.test.ts
apps/web/src/lib/catalog-cron-route.test.ts
apps/web/src/lib/catalog-evolution-snapshot.test.ts
apps/web/src/lib/catalog-evolution-integrity.test.ts
apps/web/src/lib/pricing-alert-sync-budget.test.ts
README.md
docs/actualizacion-operativa.md
```

`worker/data/catalog.json` y el Excel original no se modificaron. Las capturas de
prueba y los scripts locales estan en `.demo/`, excluidos de Git.

## Pendientes reales

1. Revisar y publicar ambos servicios. Comprobar el primer cron real posterior.
2. Confirmar si los precios del Excel de junio siguen vigentes antes de activarlo
   como lista de venta actual. No se guardo como lista nueva en produccion.
3. Ejecutar una renovacion real de precios. Las fechas no pueden reconstruirse
   honestamente a partir de `lastSyncedAt`.
4. Completar acceso/cobertura de fuentes faltantes. Una sesion privada rechazada
   no se resuelve inventando precios ni omitiendo la validacion del proveedor.
5. Trabajos durables con cursor, reintentos e idempotencia transaccional para
   capturas completas. Dos ejecuciones concurrentes aun pueden duplicar una
   captura; el control actual es por consulta, no por restriccion unica SQL.
6. Para uso empresarial: usuarios y roles individuales, auditoria, prueba de
   restauracion de backups y monitoreo operativo. El acceso compartido actual
   corresponde a un piloto.
