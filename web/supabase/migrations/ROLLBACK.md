# Rollback de las migraciones de billing

Procedimiento inverso de las migraciones que no lo traían escrito (H-07), más
las que sí. **Todo el SQL de este archivo se ejecutó y se verificó** contra
PostgreSQL 16.14 en una base desechable el 2026-08-10; ver §46.8 del informe
`AGENT_NEXT_PHASE_IMPLEMENTATION.md`.

> **Antes de revertir nada en un entorno real: haz backup.** El procedimiento
> está en `docs/BACKUP_RESTORE_RUNBOOK.md`.

---

## Orden

Las migraciones se revierten en **orden inverso** al de aplicación. Revertir la
031 con la 032 todavía activa deja el worker de outbox apuntando a funciones que
ya no existen.

```
035  →  034  →  032  →  031
```

---

## 035 · Downgrade programado

**Qué revertir:** la función `finalize_epayco_approved_payment` vuelve a su
versión de la 033, y el índice auxiliar desaparece.

```sql
DROP INDEX IF EXISTS smarttalk.idx_subscriptions_pending_plan_change;
-- Reaplicar íntegro el cuerpo de:
--   supabase/migrations/20260810000100_033_subscription_reactivation.sql
```

**Datos:** las columnas `pending_plan_id`, `pending_plan_price_id` y
`change_effective_at` existen desde la migración 010 y **no se borran**. Tras el
rollback nadie las consume, así que un downgrade programado antes de revertir
quedaría congelado: el cron ya no lo aplicaría. Para limpiarlos:

```sql
UPDATE smarttalk.subscriptions
   SET pending_plan_id = NULL, pending_plan_price_id = NULL, change_effective_at = NULL
 WHERE pending_plan_id IS NOT NULL;
```

**Comprobación:**

```sql
SELECT pg_get_functiondef(p.oid) ~ 'plan_downgrade_scheduled' AS tiene_035
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='smarttalk' AND p.proname='finalize_epayco_approved_payment';
-- esperado tras el rollback: f
```

---

## 034 · Lease del worker de recuperación

Aditiva y sin dependencias: se revierte sola.

```sql
DROP INDEX IF EXISTS smarttalk.idx_billing_webhook_events_recovery;
ALTER TABLE smarttalk.billing_webhook_events DROP COLUMN IF EXISTS locked_by;
```

**Efecto en la aplicación:** el worker detecta la columna ausente, lanza
`WebhookRecoverySchemaError` y el cron responde `503 SCHEMA_NOT_READY` en vez de
procesar sin lease. Es degradación segura, no caída.

---

## 032 · Worker de outbox

```sql
DROP FUNCTION IF EXISTS smarttalk.claim_billing_outbox_jobs(INT, TEXT, INT);
DROP FUNCTION IF EXISTS smarttalk.complete_billing_outbox_job(UUID, TEXT);
DROP FUNCTION IF EXISTS smarttalk.retry_billing_outbox_job(UUID, TEXT, TEXT, TEXT, INT);
```

**Antes de revertir**, deja la cola vacía o asume que los jobs pendientes se
quedan sin procesar:

```sql
SELECT status, COUNT(*) FROM smarttalk.billing_outbox_jobs GROUP BY status;
```

**Efecto en la aplicación:** `processBillingOutboxJobs` lanza
`billing outbox claim failed` y el cron `/api/cron/billing-outbox` responde 500.
Las notificaciones de D-2 y D-6 dejan de entregarse; los jobs quedan en la tabla
sin perderse.

La tabla `billing_outbox_jobs` la crea la **010**, no la 032: no se borra aquí.

---

## 031 · Reservas atómicas de cupo

```sql
-- Las firmas importan: `DROP FUNCTION` con tipos que no coinciden no borra
-- nada y no avisa. Estas son las reales (verificadas con
-- pg_get_function_identity_arguments), no las que uno supondría.
DROP FUNCTION IF EXISTS smarttalk.reserve_billing_capacity(UUID, TEXT, BIGINT);
DROP FUNCTION IF EXISTS smarttalk.consume_billing_capacity(UUID, TEXT);
DROP FUNCTION IF EXISTS smarttalk.release_billing_capacity(UUID);
DROP INDEX IF EXISTS smarttalk.idx_billing_quota_reservations_active;
DROP TABLE IF EXISTS smarttalk.billing_quota_reservations;
```

Si dudas de una firma, consúltala antes de escribir el `DROP`:

```sql
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'smarttalk' AND p.proname LIKE '%billing%';
```

**Antes de revertir: pon `BILLING_ATOMIC_QUOTA_MODE=off` y despliega.** Con la
variable en `on`, `reserveBillingCapacity` llama a una función inexistente,
devuelve `{status:"error"}` y las rutas responden
`503 BILLING_QUOTA_UNAVAILABLE`: **el alta de contactos, canales, marcas y
flujos deja de funcionar**. Con la variable en `off` el código ni siquiera
llama al RPC y se vuelve al comportamiento previo a la 031.

Ese orden —variable primero, SQL después— es lo que convierte este rollback en
seguro. Al revés hay ventana de caída.

Comprueba que no queden reservas vivas antes de borrar la tabla:

```sql
SELECT status, COUNT(*) FROM smarttalk.billing_quota_reservations GROUP BY status;
```

---

## Verificación posterior

```sql
-- Funciones que deben haber desaparecido
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'smarttalk'
   AND p.proname = ANY(ARRAY[
     'reserve_billing_capacity','consume_billing_capacity','release_billing_capacity',
     'claim_billing_outbox_jobs','complete_billing_outbox_job','retry_billing_outbox_job'
   ]);
-- esperado: 0 filas

-- Columna del lease
SELECT column_name FROM information_schema.columns
 WHERE table_schema='smarttalk' AND table_name='billing_webhook_events' AND column_name='locked_by';
-- esperado: 0 filas
```

---

## Reaplicación

Los cuatro archivos son idempotentes (`CREATE OR REPLACE`,
`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), así que volver a
aplicarlos en orden restaura el estado sin pasos adicionales:

```
031 → 032 → 034 → 035
```

Verificado en la base desechable: rollback completo y reaplicación, ambos sin
error.

---

# 036 · Desactivación reversible de marcas

Rollback de `20260812000100_036_brand_pause_lifecycle.sql`.

## Antes de nada: ¿hay marcas pausadas?

El rollback devuelve el conteo de cupo a «todas las marcas cuentan». Si alguna
marca está pausada, revertir sin reactivarla la deja **ocupando cupo pero sin
recibir nada**: lo peor de los dos mundos. Comprueba primero:

```sql
SELECT id, name, smarttalk_organization_id
FROM public.cm_clients
WHERE status = 'paused';
```

Si devuelve filas, decide explícitamente qué hacer con ellas —reactivarlas por
la interfaz, o dejarlas pausadas asumiendo que consumirán cupo— antes de seguir.

## Pasos

```sql
-- 1. Restaurar el conteo de brands.total de la migración 031.
--    Sólo cambia esa rama; el resto del cuerpo es idéntico.
--    Reaplica el archivo 031 completo:
--    \i supabase/migrations/20260809000100_031_atomic_billing_quota.sql

-- 2. Tablas nuevas. CASCADE no es necesario: nada más las referencia.
DROP TABLE IF EXISTS smarttalk.brand_channel_pause_state;
DROP TABLE IF EXISTS smarttalk.brand_lifecycle_events;
```

**El CHECK de `cm_clients.status` no se revierte automáticamente, y es
deliberado.** La migración lo extiende (`… OR status = 'paused'`) sólo si
existía uno. Quitar esa alternativa haría fallar cualquier fila que siguiera en
`paused`. Si de verdad quieres restringirlo otra vez, hazlo después de haber
resuelto el punto anterior:

```sql
-- Sólo si NO quedan filas en 'paused'.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.cm_clients'::regclass AND contype = 'c';
-- y reescribe la restricción a mano con la definición que tenías.
```

## Verificación

```sql
SELECT to_regclass('smarttalk.brand_channel_pause_state'),
       to_regclass('smarttalk.brand_lifecycle_events');
-- esperado: NULL, NULL

-- La función vuelve a contar todas las marcas
SELECT prosrc LIKE '%IS DISTINCT FROM ''paused''%' AS sigue_excluyendo
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'smarttalk' AND p.proname = 'reserve_billing_capacity';
-- esperado: false
```

## Reaplicación

`036` es idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE
FUNCTION`, y el bloque del CHECK detecta si ya admite `paused`). Verificado en
la base desechable: aplicada, reaplicada y comprobada con
`supabase/qa/002_qa_brand_pause_capacity.sql` (5/5 en verde).

Orden completo de reaplicación:

```
031 → 032 → 034 → 035 → 036
```
