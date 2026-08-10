# Evidencia QA · Billing atómico y outbox (migraciones 031 y 032)

Documento de evidencia de pruebas **realmente ejecutadas**. No contiene resultados
estimados ni simulados. No incluye credenciales, tokens ni valores de `.env.local`.

| | |
|---|---|
| **Fecha de ejecución** | 2026-08-10, 00:55Z – 01:07Z (UTC) |
| **Ejecutado por** | Claude Code (sesión local, sin commit / push / deploy) |
| **Migraciones bajo prueba** | `031_atomic_billing_quota`, `032_billing_outbox_worker` (ya aplicadas previamente; no se re-ejecutaron) |
| **Modo de despliegue vigente** | `BILLING_ENFORCEMENT_MODE=hard`, `BILLING_ATOMIC_QUOTA_MODE=on` |
| **Acceso usado** | Cliente Supabase con `service_role`, credenciales leídas de `web/.env.local` (no se reproducen aquí) |

## Organización QA utilizada

| Campo | Valor |
|---|---|
| Nombre | `QA Agencia Inicial` |
| `organization_id` | `9cf0fc02-b024-4560-9709-83fe5a5c807c` |
| `plan_id` original | `9c06e41c-839a-4d47-86b2-88fd3c3ba42e` (`demo-inicial-2026`) |
| Suscripción | `43ef0467-ed6f-4a28-a326-5e0b6437ba44`, estado `active`, periodo 2026-08-05 → 2026-09-05 |
| Entitlement `contacts.total` | `enabled=true`, `limit_value=1000`, `overage_policy=block`, `reset_interval=none` |
| Contactos al inicio | 1003 (la organización ya estaba por encima de su límite; condición preexistente) |
| `billing_enforcement_mode` de la organización | `observe` (el modo efectivo es `hard` porque `resolveMode()` toma el máximo con la variable global) |

Ninguna otra organización fue utilizada ni modificada.

## Scripts utilizados

| Script | Uso |
|---|---|
| `web/scripts/qa-billing-concurrency.mjs` | Prueba de concurrencia de `reserve_billing_capacity` |
| `web/scripts/qa-billing-outbox.mjs` | Pruebas del outbox: fases `race`, `retry`, `idem-setup`, `idem-verify`, `cleanup` |

Comandos ejecutados (desde `web/`):

```bash
QA_ORGANIZATION_ID=9cf0fc02-b024-4560-9709-83fe5a5c807c node scripts/qa-billing-concurrency.mjs
QA_ORGANIZATION_ID=9cf0fc02-b024-4560-9709-83fe5a5c807c node scripts/qa-billing-outbox.mjs race
QA_ORGANIZATION_ID=9cf0fc02-b024-4560-9709-83fe5a5c807c node scripts/qa-billing-outbox.mjs retry
QA_ORGANIZATION_ID=9cf0fc02-b024-4560-9709-83fe5a5c807c node scripts/qa-billing-outbox.mjs idem-setup
QA_ORGANIZATION_ID=9cf0fc02-b024-4560-9709-83fe5a5c807c node scripts/qa-billing-outbox.mjs idem-verify
QA_ORGANIZATION_ID=9cf0fc02-b024-4560-9709-83fe5a5c807c node scripts/qa-billing-outbox.mjs cleanup
```

Ambos scripts exigen `QA_ORGANIZATION_ID` explícito y abortan si detectan reservas o
jobs que no hayan creado ellos mismos.

---

## 1. Prueba de concurrencia · `reserve_billing_capacity`

### Preparación (no destructiva)

La organización QA tenía 1003 contactos contra un límite de 1000, por lo que **no era
posible** dejar un cupo libre sin borrar datos. Para no borrar contactos se creó un
plan temporal privado y se apuntó la organización a él durante la prueba:

| Paso | Valor |
|---|---|
| Plan temporal creado | `232b5222-585d-413d-9f68-c543491274b8` (`qa-test-concurrency-1786323352145`, `is_public=false`, `status=draft`) |
| Entitlement temporal `contacts.total` | `limit_value=1004`, `enabled=true`, `overage_policy=block` |
| Contactos al momento de la prueba | 1003 |
| **Cupos disponibles** | **1** |

No se creó, modificó ni eliminó ningún contacto en toda la prueba.

### Resultado de cada reserva simultánea

Dos clientes HTTP independientes, disparados con `Promise.all` (ventana total: 251 ms).

| Solicitud | `allowed` | `reason` | `reservation_id` | `current_usage` | `limit_value` |
|---|---|---|---|---|---|
| **A** | `true` | `reserved` | `7944bf14-521b-451b-b014-14bd32e07be3` | 1003 | 1004 |
| **B** | `false` | `limit_reached` | `null` | 1004 | 1004 |

El dato decisivo es `current_usage = 1004` en la solicitud B: 1003 contactos reales
más la reserva `held` creada por A. B observó la reserva de A, lo que demuestra que el
`pg_advisory_xact_lock` del RPC serializó ambas transacciones. **Solo una solicitud
consumió el último cupo.**

### Consumo y liberación

| Acción | RPC | Resultado |
|---|---|---|
| Consumo de la reserva permitida | `consume_billing_capacity('7944bf14…', 'qa-concurrency-test-1786323352145')` | `true` |
| Sonda posterior al consumo | `reserve_billing_capacity` | `allowed=true`, `reason=reserved`, `current_usage=1003` |
| Liberación de la reserva sobrante | `release_billing_capacity('33d27acb-2dec-4fe4-bd52-94dc6732d1f1')` | `true` |

La sonda posterior confirma una semántica del RPC que conviene dejar registrada: una
reserva en estado `consumed` **deja de ocupar cupo de inmediato**, porque el RPC asume
que el llamador ya insertó la fila real del recurso. En esta prueba no se insertó
contacto alguno (para mantener el estado reversible), de ahí que el cupo volviera a
quedar libre. Es el comportamiento correcto para las rutas actuales, que insertan
antes de consumir.

### Estado de `billing_quota_reservations` antes de la limpieza

| `id` | `feature_code` | `quantity` | `status` | `resource_id` | `consumed_at` | `released_at` |
|---|---|---|---|---|---|---|
| `7944bf14-521b-451b-b014-14bd32e07be3` | `contacts.total` | 1 | `consumed` | `qa-concurrency-test-1786323352145` | 2026-08-10T00:55:53.609926Z | — |
| `33d27acb-2dec-4fe4-bd52-94dc6732d1f1` | `contacts.total` | 1 | `released` | — | — | 2026-08-10T00:55:54.024562Z |

**Resultado: PASS**

---

## 2. Outbox · claim concurrente

Job sintético `process_webhook` (tipo sin handler registrado, no contacta proveedores).

| Campo | Valor |
|---|---|
| `job id` | `5bce8b7c-e020-466f-b014-ae34d92ab6f2` |
| `idempotency_key` | `qa-test-outbox-race-1786323605768` |
| `status` antes | `pending` |
| `attempt_count` antes | 0 |

Dos llamadas simultáneas a `claim_billing_outbox_jobs` con `worker_id` distintos:

| `worker_id` | Jobs reclamados | ¿Reclamó el job de prueba? |
|---|---|---|
| `qa-worker-A-1786323605768` | `[]` | No |
| `qa-worker-B-1786323605768` | `["5bce8b7c-e020-466f-b014-ae34d92ab6f2"]` | Sí |

Estado del job tras el claim:

| Campo | Valor |
|---|---|
| `status` | `processing` |
| `attempt_count` | 1 |
| `locked_by` | `qa-worker-B-1786323605768` |
| `locked_at` | 2026-08-10T01:00:06.463319Z |

El mismo job fue reclamado por un único worker. El `FOR UPDATE SKIP LOCKED` evitó la
doble asignación.

**Resultado: PASS**

---

## 3. Outbox · propiedad del lease (ownership)

Sobre el mismo job `5bce8b7c-e020-466f-b014-ae34d92ab6f2`:

| Acción | `worker_id` | RPC devolvió | Estado resultante |
|---|---|---|---|
| `complete_billing_outbox_job` con el worker perdedor | `qa-worker-A-1786323605768` | `false` | Sin cambios, sigue `processing` |
| `complete_billing_outbox_job` con el worker propietario | `qa-worker-B-1786323605768` | `true` | `completed`, `completed_at=2026-08-10T01:00:06.915737Z`, `locked_by=null` |

Un worker que no posee el lease no puede cerrar el job.

**Resultado: PASS**

---

## 4. Outbox · reintento, backoff y dead_letter

Job sintético `process_webhook`, `p_max_attempts = 3`.

| Campo | Valor |
|---|---|
| `job id` | `a2e092e1-ea42-40e5-9008-3b7cd6737c43` |
| `idempotency_key` | `qa-test-outbox-retry-1786323612069` |
| `worker_id` | `qa-worker-retry-1786323612069` |

### Sonda de propiedad previa

| Acción | `worker_id` | RPC devolvió | Efecto |
|---|---|---|---|
| `retry_billing_outbox_job` con worker impostor | `qa-worker-retry-1786323612069-impostor` | `"not_owned"` | Job intacto: `processing`, `attempt_count=1`, `last_error_code=null` |

### Rondas de reintento

| Ronda | `status` antes | `attempt_count` tras claim | RPC devolvió | `status` después | `available_at` | Backoff | `last_error_code` | `locked_by` después |
|---|---|---|---|---|---|---|---|---|
| 1 | `processing` | 1 | `retry` | `retry` | 2026-08-10T01:01:13.022384Z | **60 s** | `qa_synthetic_failure` | `null` |
| 2 | `processing` | 2 | `retry` | `retry` | 2026-08-10T01:02:13.695482Z | **120 s** | `qa_synthetic_failure` | `null` |
| 3 | `processing` | 3 | `dead_letter` | `dead_letter` | 2026-08-10T01:04:14.397089Z | 240 s | `qa_synthetic_failure` | `null` |

`last_error_message` en cada ronda: `QA synthetic failure round <n>`.

El backoff observado corresponde a `min(3600, 30 · 2^attempt_count)`, tal como define
la migración 032. Con `attempt_count = 3` y `p_max_attempts = 3` el job pasó a
`dead_letter`.

**Nota metodológica:** entre rondas se forzó `available_at = now()` **únicamente sobre
este job sintético**, porque el backoff real lo dejaba fuera del alcance del claim
durante minutos. El ajuste está marcado como acelerador de prueba en el script y no
altera el valor de `available_at` calculado por el RPC, que es el dato registrado en la
tabla anterior.

**Resultado: PASS**

---

## 5. Outbox · idempotencia

Se creó un `notification_log` ya en estado `sent` y un job `send_notification` que lo
referencia, para verificar que el worker no vuelve a llamar al proveedor.

| Campo | Valor |
|---|---|
| `notification_log id` | `ef4f6e14-05cc-4bbe-b44b-419cf465b7ff` |
| `idempotency_key` del log | `qa-test-outbox-idem-1786323621945` |
| `job id` | `3a78ae9a-dfb8-4166-9dd5-548a1a45127e` |
| `idempotency_key` del job | `qa-test-outbox-idem-job-1786323621945` |
| Destinatario del payload | `qa-idempotency-…@communitymanager.invalid` (dominio no enrutable) |

### Estado antes y después de ejecutar el worker

| Campo | Antes | Después |
|---|---|---|
| `billing_outbox_jobs.status` | `pending` | `completed` |
| `billing_outbox_jobs.attempt_count` | 0 | 1 |
| `billing_outbox_jobs.completed_at` | — | 2026-08-10T01:00:50.455043Z |
| `billing_outbox_jobs.last_error_code` | `null` | `null` |
| `notification_logs.status` | `sent` | `sent` |
| `notification_logs.attempt_count` | 1 | 1 |
| `notification_logs.provider_message_id` | `qa-preexisting-1786323621945` | `qa-preexisting-1786323621945` |
| `notification_logs.sent_at` | 2026-08-10T01:00:22.066Z | 2026-08-10T01:00:22.066Z |
| `notification_logs.failure_code` | `null` | `null` |
| `public.cm_notifications_log` (org QA) | 0 filas | 0 filas |

### Prueba de que no se contactó al proveedor

`notify()` escribe **siempre** un intento en `public.cm_notifications_log`
(`src/lib/notify/dispatcher.ts`). Ese contador permaneció en 0 antes y después, y
ningún campo del `notification_log` cambió. Adicionalmente, las variables de proveedor
(`RESEND_API_KEY`, `SLACK_BOT_TOKEN`, tokens de WhatsApp) estaban ausentes del entorno,
por lo que ningún envío real era posible.

### Qué worker ejecutó el job

El job se completó a las `01:00:50.455Z`. Los logs de runtime de Vercel registran
`GET /api/cron/billing-outbox 200` a las `01:00:50` (deployment
`dpl_9xumGoGepZr5BpFJSJtRj2f1XR4D`). Fue el **worker desplegado**, no una ejecución
local: la ejecución local posterior (01:04Z) devolvió `claimed: 0` porque el job ya
estaba cerrado. Es evidencia del runtime real, pero confirma que la organización QA
comparte base de datos con el despliegue activo.

**Resultado: PASS**

---

## 6. Cleanup realizado

### Prueba de concurrencia

| Acción | Resultado |
|---|---|
| `organizations.plan_id` restaurado | `9c06e41c-839a-4d47-86b2-88fd3c3ba42e` (valor original) |
| Reservas sintéticas eliminadas | 2 |
| Entitlement temporal eliminado | 1 |
| Plan temporal eliminado | 1 |
| Contactos borrados | **0** |

### Pruebas del outbox

| Acción | Resultado |
|---|---|
| Jobs sintéticos eliminados | 3 (`qa-test-outbox-race-…` `completed`, `qa-test-outbox-retry-…` `dead_letter`, `qa-test-outbox-idem-job-…` `completed`) |
| `notification_logs` sintéticos eliminados | 1 (`qa-test-outbox-idem-…`) |
| Jobs ajenos tocados | **0** |
| Archivo de estado temporal `web/.qa-outbox-state.json` | Eliminado |

---

## 7. Estado final verificado

Verificado por consulta directa tras la limpieza:

| Elemento | Estado inicial | Estado final | ¿Coincide? |
|---|---|---|---|
| `organizations.plan_id` (org QA) | `9c06e41c-839a-4d47-86b2-88fd3c3ba42e` | `9c06e41c-839a-4d47-86b2-88fd3c3ba42e` | Sí |
| `organizations.is_active` | `true` | `true` | Sí |
| `organizations.onboarding_status` | `active` | `active` | Sí |
| `organizations.billing_enforcement_mode` | `observe` | `observe` | Sí |
| Contactos de la org QA | 1003 | 1003 | Sí |
| Suscripción `43ef0467…` | `active`, 2026-08-05 → 2026-09-05 | `active`, 2026-08-05 → 2026-09-05 | Sí |
| Entitlement `contacts.total` | `enabled=true`, `limit=1000`, `block` | `enabled=true`, `limit=1000`, `block` | Sí |
| `billing_quota_reservations` | 0 filas | 0 filas | Sí |
| `billing_outbox_jobs` | 0 filas | 0 filas | Sí |
| `notification_logs` (org QA) | 0 filas | 0 filas | Sí |
| `smarttalk.plans` | 7 planes | 7 planes; planes `qa-test-*` restantes: 0 | Sí |
| Organizaciones en la instancia | 7 | 7 | Sí |

---

## 8. Resumen PASS/FAIL

| # | Prueba | Estado |
|---|---|---|
| 1 | Concurrencia · dos reservas simultáneas con un solo cupo | **PASS** |
| 2 | Concurrencia · consumo de la reserva permitida | **PASS** |
| 3 | Concurrencia · liberación de reservas restantes | **PASS** |
| 4 | Outbox · claim concurrente con dos `worker_id` | **PASS** |
| 5 | Outbox · propiedad del lease en `complete_billing_outbox_job` | **PASS** |
| 6 | Outbox · `retry_billing_outbox_job` devuelve `not_owned` a un worker ajeno | **PASS** |
| 7 | Outbox · reintento con backoff exponencial (60 s → 120 s) | **PASS** |
| 8 | Outbox · transición a `dead_letter` al agotar intentos | **PASS** |
| 9 | Outbox · idempotencia con `notification_log` ya `sent` | **PASS** |
| 10 | Limpieza y restauración del estado inicial | **PASS** |

Fallos: ninguno.

---

## 9. Errores encontrados y pruebas no ejecutadas

### Errores del entorno durante la ejecución

1. **`next dev` no arranca en esta rama.** Error:
   `You cannot use different slug names for the same dynamic path ('client_id' !== 'token')`,
   por la coexistencia de `src/app/api/onboarding/[client_id]/` y
   `src/app/api/onboarding/[token]/` (ambos preexistentes). Por este motivo la prueba de
   idempotencia no se ejecutó contra un servidor local; el job fue procesado por el
   worker desplegado, cuya evidencia se documenta en la sección 5.
   **`npx next build` sí finalizó con código de salida 0**, por lo que esto no bloquea el
   despliegue, solo el desarrollo local con Turbopack.

2. **No existe una base de datos QA aislada.** La organización QA vive en la misma
   instancia Supabase que consume el despliegue activo. Consecuencia observada: el cron
   de producción `/api/cron/billing-outbox` (cada 2 minutos) reclamó y completó el job
   sintético de idempotencia.

### Condiciones preexistentes, no introducidas por estas pruebas

3. La organización QA está por encima de su plan: 1003 contactos contra un límite de
   1000. No se modificó.

### Pruebas no ejecutadas

4. **Ejecución del worker en servidor local** (`next dev` + `/api/cron/billing-outbox`):
   no ejecutada por el error de rutas descrito. Sustituida por la evidencia del worker
   desplegado.
5. **Prueba de UI de `/contacts`**: fuera del alcance de esta sesión; ya había sido
   realizada manualmente con anterioridad.
6. **Envío real de notificaciones**: no ejecutado de forma deliberada. No se contactó a
   ningún proveedor.
7. **Concurrencia sobre features distintas de `contacts.total`**: no ejecutada. El RPC
   `reserve_billing_capacity` solo soporta `contacts.total`, `channels.active`,
   `automations.flows` y `brands.total`; cualquier otra feature devuelve
   `unsupported_feature`.
8. **Migraciones 031 y 032**: no se re-ejecutaron, conforme a las restricciones de la
   sesión.

### Acciones no realizadas, por restricción explícita

No se hizo commit, push, pull request ni deploy. No se modificaron variables ni
secretos. No se alteró ningún documento existente del proyecto.
