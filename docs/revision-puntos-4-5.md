# Revision local: puntos 4 y 5

Rama existente: `codex/migration-20260907`. Cambios sin commit, push ni deploy.
Se preservan los cambios locales anteriores de los puntos 1, 2 y 3.

## Comportamiento

- Categorias y Busqueda general usan la ultima evaluacion guardada del Excel activo, incluida una captura diaria vinculada a esa misma lista. Historial permite abrir exactamente esa carga y Revisiones usa la misma seleccion.
- Excel es precio de venta. Tokin es referencia del proveedor, nunca reemplazo de un precio Excel ausente.
- Vinculacion por EAN de unidad o codigo Tokin exacto. Identidades ambiguas y coincidencias solo por nombre no habilitan una decision.
- El catalogo con imagenes queda como detalle secundario. Un error de lectura no produce un semaforo favorable.
- La prioridad economica usa diferencia absoluta con la mediana de mayoristas comparables, vigentes, regulares y con stock confirmado, multiplicada por ventas equivalentes a 30 dias. Es un escenario, no perdida de ventas ni beneficio garantizado.
- Muestra contribucion con costos confirmados, stock valorizado y dias de cobertura. Las condiciones de terceros y su base impositiva requieren validacion comercial.
- El cron conserva condiciones y actividad del mismo articulo/presentacion sin renovar sus fechas. Una respuesta incompleta del worker no se guarda como nueva evaluacion.
- Listas de mas de 1000 articulos se leen por paginas. La API de referencia envia solo filas identificadas, sin el log pesado de consultas.

## Datos que debe aportar el cliente

Columnas opcionales: `Unidades vendidas`, `Dias del periodo`, `Ventas hasta`,
`Stock unidades`, `Fecha stock`. Cantidades en la misma unidad de venta, no bultos.
Fechas ISO, DD/MM/AAAA o fecha numerica de Excel. Ausencia no equivale a cero.
Ventas de mas de 45 dias y stock de mas de 7 dias no generan estimaciones vigentes.

No requiere nueva migracion SQL: los datos opcionales se conservan en el JSON
existente de cada articulo. No incluye conexion automatica con un ERP.
Los historicos sin actividad o disponibilidad verificable siguen sin impacto calculable.

## Archivos de esta entrega

Rutas relativas a la raiz del repositorio; algunos ya tenian cambios locales anteriores.

- `README.md`
- `docs/revision-puntos-4-5.md`
- `apps/web/src/app/api/price-list/route.ts`
- `apps/web/src/app/api/price-list/reference/route.ts`
- `apps/web/src/app/busqueda-general/page.tsx`
- `apps/web/src/app/importacion/page.tsx`
- `apps/web/src/app/price-list-history.tsx`
- `apps/web/src/components/category-pricing/CategoryPricingDashboard.tsx`
- `apps/web/src/components/price-list/CatalogCommercialPanel.tsx`
- `apps/web/src/components/price-list/ImportDecisionTable.tsx`
- `apps/web/src/components/price-list/PricingImpactDetail.tsx`
- `apps/web/src/components/price-history/PriceHistoryDecisionPanel.tsx`
- `apps/web/src/components/price-review/PricingReviewDashboard.tsx`
- `apps/web/src/lib/business-activity.ts`
- `apps/web/src/lib/business-activity-route.test.ts`
- `apps/web/src/lib/commercial-reference.ts`
- `apps/web/src/lib/commercial-reference.test.ts`
- `apps/web/src/lib/commercial-reference-data.ts`
- `apps/web/src/lib/commercial-reference-data.test.ts`
- `apps/web/src/lib/pricing-impact.ts`
- `apps/web/src/lib/pricing-impact.test.ts`
- `apps/web/src/lib/test-fixtures/pricing-business.ts`
- `apps/web/src/lib/catalog-evolution-snapshot.ts`
- `apps/web/src/lib/catalog-evolution-snapshot.test.ts`
- `apps/web/src/lib/price-list-commercial.ts`
- `apps/web/src/lib/price-list-history-analysis.ts`
- `apps/web/src/lib/price-list-history.ts`
- `apps/web/src/lib/price-list-persistence.ts`
- `apps/web/src/lib/price-list-review-data.ts`
- `apps/web/src/lib/price-list-review.ts`
- `apps/web/src/lib/price-list-storage.ts`
- `apps/web/src/lib/supabase-admin.ts`
- `apps/web/src/types/search.ts`
- `worker/src/catalog.ts`
- `worker/src/types.ts`

Sin cambios en `apps/web/src/app/page.tsx`, `worker/data/catalog.json` ni `package-lock.json`.

## Verificacion

- `npm run test`: 129 pruebas aprobadas (28 worker y 101 web).
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado. Aviso experimental de Node Type Stripping, sin errores de compilacion.
- `git diff --check`: aprobado.
- Playwright con Chrome, 1440x1000 y 390x844: misma evaluacion en categorias/busqueda/importacion/historial, prioridad por volumen, filtros, errores de lectura, ausencia de Excel, detalle secundario, modal de impacto con cierre por teclado y sin desborde horizontal.
- Importacion CSV y exportacion XLSX conservan fechas, actividad e impacto. Guardado comprobado mediante payload interceptado, sin escritura en produccion.
- Historial abre por ID una carga fuera de las primeras del listado. Revisiones muestra impacto y conserva sus filtros.
- Regresion del punto 3: editor de costos, IVA, margen/recargo, guardado, exportacion e historial/evolucion.
- Rutas `/`, `/busqueda-general`, `/importacion`, `/historial`, `/evolucion` y `/revisiones`: HTTP 200.

Pruebas de navegador y Supabase con datos controlados. No se verifico ni publico
una nueva corrida real en produccion. Preview local: http://127.0.0.1:3010/.
