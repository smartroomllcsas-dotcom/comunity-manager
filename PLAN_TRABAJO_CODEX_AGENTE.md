# Plan de trabajo conjunto: Codex + agente

Fecha: 2026-08-09
Proyecto: CommunityManager

## Estado de ejecución

- [x] B1 — Reservas atómicas implementadas para contactos, canales, marcas y
  flujos; migraciones `031` y `032` aplicadas y deployment manual Production
  listo.
- [x] B2 — Outbox, leases, reintentos, backoff, cron y notificaciones
  preparados y desplegados.
- [x] B3 — Tests, lint, build, documentación, commit y deployment manual
  completados.
- [x] Evidencia operativa — `/contacts` abre el modal de alta y una cuenta en
  el límite recibe el rechazo esperado del plan al intentar guardar.
- [x] Evidencia QA — La prueba directa de reservas atómicas y el outbox quedó
  ejecutada con resultado PASS; evidencia en
  `web/QA_BILLING_EVIDENCE_CLAUDE.md`.
- [ ] Pendiente — Ejecutar dos altas completas simultáneas por API/UI y una
  notificación real sandbox; la prueba directa del RPC y la idempotencia
  sintética ya están cerradas.

## Regla de integración

Codex es el responsable único de la integración final y de subir los cambios.
El agente puede revisar, proponer, implementar en su rama o generar evidencias,
pero no debe publicar directamente en `master`, Production, Vercel ni Supabase.

Antes de subir cualquier cambio, Codex debe revisar el diff completo, ejecutar
las pruebas, confirmar que no se sobrescribieron cambios locales y aprobar la
migración o despliegue correspondiente.

## Frente A — agente

### A1. Auditoría independiente

- Revisar los límites actuales y señalar cada ruta que todavía haga
  `check -> insert/update` fuera de una operación atómica.
- Revisar `billing_outbox_jobs`, `notification_logs` y las transiciones de
  suscripción.
- Entregar una lista de hallazgos con archivo, línea, riesgo y prueba sugerida.

### A2. Evidencia operativa

- Organizar las referencias de las compras sandbox de los tres planes.
- Asociar cada compra con organización, plan, pago, suscripción, deployment y
  límites observados.
- Confirmar capturas de `/admin/plans`, `/admin/payment-gateways` y
  `/settings/billing`.
- Preparar la matriz de cambio de plan, vencimiento, gracia, suspensión y
  reactivación en una cuenta no productiva.

### A3. Restricciones

- No cambiar secretos ni variables de Production.
- No ejecutar `db push`, deploy ni publicar ramas.
- No marcar un pendiente como cerrado sin evidencia reproducible.

## Frente B — Codex

### B1. Concurrencia atómica — prioridad P0

- Diseñar la operación PostgreSQL que serialice la decisión y el alta del
  recurso.
- Cubrir como mínimo contactos, canales, marcas y flujos.
- Añadir pruebas de dos solicitudes simultáneas en el límite.
- Crear migración nueva, actualizar rutas y documentar rollback.

### B2. Outbox y notificaciones — prioridad P0

- Implementar reclamación con lease, reintentos y backoff.
- Procesar `billing_outbox_jobs` de forma idempotente.
- Conectar los eventos de billing con `notification_logs` sin duplicar envíos.
- Añadir cron protegido y pruebas de éxito, fallo, reintento y duplicado.

### B3. Validación e integración

- Ejecutar tests, lint, build y `git diff --check`.
- Revisar los cambios del agente antes de incorporarlos.
- Actualizar checklist y guía operativa solo con evidencia confirmada.
- Crear commit, subir la rama y preparar el despliegue cuando corresponda.

## Orden de entrega

1. Auditoría del agente y diseño técnico de concurrencia.
2. Migración/RPC y rutas atómicas.
3. Pruebas de concurrencia y regresión.
4. Outbox y notificaciones.
5. QA operacional, revisión final y publicación por Codex.

## Criterio de terminado

Un bloque solo se considera terminado cuando tiene código, pruebas aprobadas,
diff revisado, documentación actualizada y evidencia reproducible. La salida
comercial seguirá bloqueada hasta cerrar los P0 restantes.
