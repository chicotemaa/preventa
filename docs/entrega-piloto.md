# Entrega para revision: piloto de pricing Aguiar

Revision del 22/09/2026. Rama: `main`. Publicacion solicitada por el usuario
despues de la revision. Destino: https://preventa-web.vercel.app/guia.
Esta entrega complementa `actualizacion-operativa.md`; no convierte la informacion
historica en precios actuales ni certifica disponibilidad productiva.

## Que cambia para el usuario

- Excel es venta Aguiar. Tokin es proveedor Arcor; no reemplaza una venta ausente.
- La posicion del precio se distingue de la recomendacion: Excel puede estar
  arriba del mayorista y aun necesitar confirmar costo antes de sugerir una baja.
- Se bloquean recomendaciones fuertes con datos viejos, moneda no ARS,
  equivalencia debil, costo sin confirmar o precio condicionado/promo.
- UxB solo admite una cantidad entera de unidades. No interpreta `40 gr` o
  `3x12` como cantidad sin confirmacion. Se conserva precision antes de redondear.
- Importacion pagina 50 filas. Filtros y paginas no recortan el XLSX exportado.
- Una respuesta parcial o con filas repetidas no se guarda como carga completa.
  Un error al guardar deja disponible la evaluacion para descargar/reintentar.
- Alertas automaticas identifican su base como proveedor Tokin frente al mercado.
  No representan margen Aguiar. Las alertas antiguas sin origen se marcan para
  revision y no muestran su precio propio o diferencia como verificados.
- `/ejemplo` contiene diez escenarios simulados, editables y restablecibles.
  No tiene persistencia ni consulta proveedores. `/guia` contiene los PDF.

## Material para presentar

- `apps/web/public/ayuda/manual-aguiar.pdf`: acceso, pasos, formulas, ejemplo,
  costos, rutina y guia tecnica.
- `apps/web/public/ayuda/presentacion-gerencia.pdf`: propuesta de piloto,
  demostracion y criterios de aceptacion.
- `.demo/ACCESO-PRIVADO.txt`: credencial verificada contra la web productiva. Ignorado por Git,
  permisos 0600. Compartir solo con personas autorizadas, separado de los PDF.
- El ejemplo no representa precios actuales ni cotizaciones de proveedores.
- El Excel HUMAN de junio tiene 1.034 articulos; confirmar su vigencia antes de
  activarlo como lista de venta. La prueba no lo guardo en produccion.

## Verificaciones

- `npm test`: 157 pruebas (31 worker, 126 web).
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado.
- Pruebas unitarias de cantidad por bulto, moneda, promo, decisiones, referencia
  de alertas, integridad de importacion, cron y guardado completo.
- La escritura Supabase se prueba con dobles de prueba; no con una escritura
  productiva de estas modificaciones. No se requiere nueva migracion SQL.
- La verificacion visual, navegacion y exportacion se ejecutan contra el preview
  local con snapshot historico, sin iniciar consultas en vivo ni guardar cargas.
- Navegador: diez rutas en 1440 y 390 px, sin errores JavaScript ni desbordamiento.
  Se probo cambiar flete, confirmar costo, restablecer ejemplo, importar y exportar
  1.034 filas, paginar y buscar sin recortar la exportacion.
- `/guia`, `/ejemplo` y ambos PDF: 401 sin acceso y 200 con acceso autorizado.
- Manual de nueve paginas y presentacion de cuatro: renderizados y revisados
  visualmente; sin contrasenas ni claves. La ficha privada tiene permisos 0600.

## Archivos de esta etapa

Se preservan los cambios operativos listados en `actualizacion-operativa.md`.
Adicionales:

```text
.gitignore
.vercelignore
apps/web/.vercelignore
worker/.vercelignore
apps/web/src/app/app-header.tsx
apps/web/src/app/importacion/page.tsx
apps/web/src/app/ejemplo/page.tsx
apps/web/src/app/guia/page.tsx
apps/web/src/components/price-list/ImportDecisionTable.tsx
apps/web/src/components/price-list/CostConditionsEditor.tsx
apps/web/src/components/price-list/PricingExample.tsx
apps/web/src/components/price-history/PriceHistoryDecisionPanel.tsx
apps/web/src/components/pricing-alerts/PricingAlertsDashboard.tsx
apps/web/src/lib/price-comparison-safety.ts
apps/web/src/lib/price-position.ts
apps/web/src/lib/price-freshness.ts
apps/web/src/lib/price-list-commercial.ts
apps/web/src/lib/price-list-decision.ts
apps/web/src/lib/price-list-history-analysis.ts
apps/web/src/lib/price-list-review.ts
apps/web/src/lib/price-list-batches.ts
apps/web/src/lib/price-list-batches.test.ts
apps/web/src/lib/pricing-alerts.ts
apps/web/src/lib/pricing-alerts.test.ts
apps/web/src/lib/pricing-example.ts
apps/web/src/lib/pricing-example.test.ts
MANUAL.md
docs/preparacion-demo.md
docs/entrega-piloto.md
scripts/build-pilot-docs.py
apps/web/public/ayuda/manual-aguiar.pdf
apps/web/public/ayuda/presentacion-gerencia.pdf
```

`worker/data/catalog.json`, el Excel original y credenciales productivas no se
modificaron. Las claves locales, capturas y archivos temporales no se publican.

## Pendientes para operar con datos reales

1. Publicar ambos servicios y verificar la misma version en sus alias productivos.
   El acceso del usuario final es la web; no requiere servidor local.
2. Confirmar Excel vigente, costo neto, impuestos, flete y condiciones comerciales.
3. Renovar precios reales y comprobar por articulo fecha, unidad y equivalencia.
4. Verificar en produccion primer cron, guardado, lectura y recuperacion de datos.
   El cron actual es incremental, no descarga todo el mercado diariamente.
5. Completar fuentes faltantes y sesiones autorizadas; no prometer renovacion
   automatica de cookies protegidas por el proveedor.
6. Para escala empresarial: trabajos reanudables, cursor durable, control
   transaccional de duplicados, usuarios/roles, auditoria y restauracion probada.

## Criterio de aceptacion comercial

Validar manualmente una muestra de 20 articulos con Excel, Tokin y al menos dos
mayoristas donde exista cobertura. Cada diferencia debe tener precio, unidad,
fecha, condicion y enlace trazables. Las decisiones finales las aprueba gerencia;
no se aplican cambios de venta automaticamente.
