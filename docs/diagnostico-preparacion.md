# Diagnostico de preparacion

Fecha de evaluacion: 22/09/2026.

## Estimacion

- Presentacion y piloto asistido: aproximadamente 85%.
- Operacion empresarial desatendida: aproximadamente 60%.

Son estimaciones de madurez de ingenieria, no porcentajes de tareas terminadas,
de exactitud del matching ni de precios actualizados. Aprobar tests o publicar
una version no prueba que el catalogo comercial este completo o vigente.

## Base del diagnostico

| Area | Evidencia | Limite real |
| --- | --- | --- |
| Flujos | Importacion, categorias, busqueda, revisiones, alertas, historial y evolucion; pruebas de escritorio y movil | Falta aceptar un caso vigente del cliente de punta a punta contra produccion |
| Comparacion | Excel como venta; Tokin como proveedor; mayoristas primero; equivalencia y vigencia como restricciones | Los casos ambiguos necesitan revision humana |
| Costos | Margen, recargo y precio objetivo con condiciones confirmadas | Sin impuestos, flete y descuentos del cliente no se acredita costo final |
| Datos | El cron remoto del 22/09 informa cuatro fuentes actualizadas y 10.644 productos consolidados | Solo dos terminos por fuente en esa corrida; no prueba renovacion diaria de todo el catalogo |
| Evolucion | Persistencia y paginacion probadas; captura incompleta rechazada | El ultimo log remoto no encontro lista manual para guardar la evolucion diaria |
| Acceso | Web privada y clave API independiente para worker; cron separado | Acceso compartido de piloto, sin roles, revocacion individual, auditoria empresarial ni limites de intentos |
| Verificacion | 136 tests; typecheck y build; recorridos locales y escenarios simulados | Los mocks no acreditan persistencia ni disponibilidad real de todos los proveedores |

## Antes de usarla para decidir precios reales

1. Guardar una lista Excel vigente y comprobar su recarga desde el mismo Supabase
   que usa el cron. El Excel disponible de junio no debe presentarse como actual.
2. Auditar al menos 20 articulos reales, incluyendo unidad/bulto, impuestos,
   costo proveedor, precio de venta, equivalencia y mayorista comparado.
3. Confirmar la siguiente captura diaria vinculada a esa lista. Mostrar cobertura
   y fecha de cada precio, no solo la fecha de ejecucion del cron.
4. Resolver las fuentes criticas sin datos o sesion valida; no prometer
   renovacion automatica de Carrefour sin evidencia de autorizacion vigente.
5. Para una empresa grande: usuarios y roles, auditoria de cambios, rotacion de
   secretos expuestos, backup con prueba de restauracion, monitoreo y pruebas de
   carga. El acceso temporal no sustituye estos controles.

## Publicacion

Consultar el commit y el deployment verificado al publicar. La autorizacion de
Vercel y las variables privadas de ambos servicios son requisitos previos, no
parte de los archivos versionados. No incorporar `.demo/`, `.env`, cookies ni
datos generados al repositorio.

Detalle del recorrido y verificaciones: [Preparacion de demo](preparacion-demo.md).
