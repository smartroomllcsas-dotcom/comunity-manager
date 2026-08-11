# Implementación de la siguiente fase — P0/P1 de ciclo de vida, outbox, contract tests y multicanal

Fecha: 2026-08-10 (iteración 1) · **2026-08-10 iteración 2 — §§11-16**
Rama: `codex/add-manual-contact`
Documento hermano: `web/AGENT_NEXT_PHASE_AUDIT.md` (auditoría que originó este trabajo)

> **Cómo leer este documento.** Las secciones 1-10 corresponden a la primera
> iteración (ciclo de vida, UI, outbox, contract tests, multicanal). Las
> secciones **11 a 16** son la segunda iteración: arnés PostgreSQL reproducible,
> contract tests de ePayco ampliados, fixtures de ciclo de vida, matriz E2E,
> hallazgos de seguridad y **las instrucciones para que Codex revise y
> publique** (§16). Los resultados de ejecución de §1 están actualizados a la
> segunda iteración.

## Qué NO se hizo

- No se tocó Production, ni secretos, ni DNS, ni variables de Vercel/Supabase.
- El agente **no ejecutó ninguna migración**. La 033 la aplicó Codex por su
  cuenta (§4).
- No se repitió ninguna compra: la reactivación real quedó cerrada por Codex con
  la referencia ePayco **380694488** (§4.1).
- No hay commit, push, PR ni deploy. Los cambios están solo en el árbol de
  trabajo de esta rama.
- No se usó ninguna credencial real de proveedor: todas las claves de las
  pruebas son sintéticas y se fijan dentro del proceso de test.
- No se creó ni borró dato alguno.
- `CHECKLIST_PRUEBAS_PENDIENTES.md` y `PLAN_TRABAJO_CODEX_AGENTE.md` quedaron
  intactos.

---

## 1. Resultados de ejecución

Valores tras la **iteración 5** (ejecutados el 2026-08-10):

| Comando | Resultado real |
|---|---|
| `npx vitest run` | **500 passed / 30 files**, 0 fallos |
| `npm test` (vitest + `node --test tests/*.test.mjs`) | 19 tests node: **6 passed, 13 skipped** — los 13 son el arnés PostgreSQL |
| `npm run lint` | **0 errores**, 168 warnings — todos preexistentes; no se añadió ninguno |
| `npx tsc --noEmit` | **0 errores en `src/`**. Los restantes están en `.next/dev/types/validator.ts`, artefacto generado y obsoleto; verificado con `git stash` que son idénticos sin estos cambios |
| `npm run build` | **Compiled successfully**; `/api/cron/billing-webhook-recovery`, `/api/epayco/checkout`, `/api/billing/cancel` y `/api/billing/resume` en el manifiesto |
| `git diff --check` | sin salida |
| `node scripts/qa-postgres-suite.mjs` (4 guardas) | Verificadas en ejecución: sin variable, host gestionado, host remoto y conexión inexistente — las cuatro abortan (§11.3) |

Pruebas nuevas aportadas: **313** (de 187 iniciales a 500).

| Archivo de prueba | Casos | Iteración |
|---|---:|---|
| `src/qa-e2e/payment-contracts.test.ts` | 52 | 1 y 2 |
| `src/qa-e2e/webhook-recovery.test.ts` | 48 | 4 y **5** |
| `src/qa-e2e/channel-webhooks.test.ts` | 41 | 1 |
| `src/qa-e2e/lifecycle-matrix.test.ts` | 39 | 2 |
| `src/qa-e2e/security-posture.test.ts` | 34 | 2, 3, 4 y **5** |
| `src/qa-e2e/epayco-checkout-route.test.ts` | 23 | 3 |
| `src/qa-e2e/subscription-transitions.test.ts` | 19 | 1 y 4 |
| `src/qa-e2e/subscription-cancel.test.ts` | 18 | 1 |
| `src/lib/billing/outbox-contract.test.ts` | 16 | 1 y 3 |
| `src/lib/billing/subscription-ui.test.ts` | 15 | 1 |
| `src/qa-e2e/resilience.test.ts` | 9 | 1, 2 y 3 |
| `tests/postgres-integration.test.mjs` | **13 preparadas, 0 ejecutadas** | 1 y 2 |

### 1.1 Prueba preparada ≠ prueba ejecutada

| Categoría | Cantidad | Significado |
|---|---:|---|
| **Ejecutadas y en verde** | **500** (vitest) + **6** (node) | Corrieron en esta máquina; la salida está arriba |
| **Preparadas, no ejecutadas** | **13** (`tests/postgres-integration.test.mjs`) | Escritas y sintácticamente válidas; se saltan solas |

> **PostgreSQL/RLS NO está aprobado.** 13 pruebas preparadas, **0 ejecutadas**,
> por falta de una base QA desechable. Este entorno sólo tiene el cliente
> `libpq`: no hay servidor PostgreSQL, ni Docker, ni Supabase CLI operativo.
> Ninguna de las 13 debe contarse como aprobada.

> **13 pruebas preparadas, 0 ejecutadas por falta de base QA desechable.**
> Este entorno sólo tiene el cliente `libpq`: no hay servidor PostgreSQL, ni
> Docker, ni Supabase CLI operativo. Comprobado explícitamente. Ninguna de las
> 13 debe contarse como aprobada.

---

## 2. Archivos modificados y creados

### Código de aplicación — nuevo

| Archivo | Rol |
|---|---|
| `src/lib/billing/subscription-actions.ts` | Lógica de servidor de cancelación y reversión: validación de sesión, organización, rol y estado; guardas optimistas; registro en `subscription_events` |
| `src/app/api/billing/cancel/route.ts` | `POST` — programa la baja al final del período |
| `src/app/api/billing/resume/route.ts` | `POST` — «Mantener suscripción» |
| `src/lib/billing/subscription-ui.ts` | Derivación pura del estado de pantalla (qué botón, qué aviso, hasta cuándo hay acceso) |
| `src/components/billing/SubscriptionLifecycleCard.tsx` | Tarjeta de gestión con modal de confirmación |

### Código de aplicación — modificado

| Archivo | Cambio |
|---|---|
| `src/app/api/admin/subscriptions/route.ts` | `PATCH` endurecido: grafo de transiciones válidas, prohibición de activar sin pago, guarda optimista, idempotencia y registro obligatorio en `subscription_events` con `actor_type='admin'` |
| `src/app/(dashboard)/settings/billing/page.tsx` | Monta la tarjeta de ciclo de vida; incluye `cancelled` en la consulta de suscripción; ancla `#planes-disponibles` para el salto al checkout; recarga tras cada acción |

### Migración — **APLICADA EN SUPABASE**

| Archivo | Estado |
|---|---|
| `supabase/migrations/20260810000100_033_subscription_reactivation.sql` | El propietario confirmó `Success. No rows returned` al ejecutarla en Supabase. Falta la prueba funcional de reactivación (§4) |

### Pruebas

| Archivo | Estado |
|---|---|
| `src/qa-e2e/subscription-cancel.test.ts` | nuevo |
| `src/qa-e2e/subscription-transitions.test.ts` | nuevo |
| `src/qa-e2e/payment-contracts.test.ts` | nuevo |
| `src/qa-e2e/channel-webhooks.test.ts` | nuevo |
| `src/qa-e2e/resilience.test.ts` | nuevo |
| `src/lib/billing/subscription-ui.test.ts` | nuevo |
| `src/lib/billing/outbox-contract.test.ts` | nuevo |
| `tests/postgres-integration.test.mjs` | nuevo (se salta por defecto) |
| `src/qa-e2e/helpers/fake-supabase.ts` | modificado (§6) |

---

## 3. Prioridad 1 — Ciclo de vida

### 3.1 Cancelación para usuario autenticado

**`POST /api/billing/cancel`** — sin cuerpo de petición.

Garantías implementadas:

1. **Endpoint seguro.** Requiere sesión (`401`), que el usuario sea un agente
   con organización (`404`) y que su rol sea `admin` (`403`). Es la misma regla
   que `/api/billing/checkout`: quien puede contratar puede dar de baja.
2. **Ámbito por organización.** La suscripción se resuelve *desde*
   `agents.organization_id`; el cliente nunca envía un identificador. No existe
   superficie para actuar sobre la suscripción de otra organización — hay una
   prueba explícita de ello.
3. **`cancel_at_period_end=true` sin cambiar `status`.** El acceso continúa: ni
   el estado ni `current_period_end` se tocan. El paso efectivo a `cancelled`
   lo sigue haciendo el cron.
4. **`subscription_events` con `actor_type='user'`** y `actor_id` = el usuario
   real, `reason='cancel_scheduled_by_user'`, `correlation_id` derivado del
   período, y `metadata.effective_at` con la fecha de fin de acceso.
5. **Idempotencia.** Repetir la llamada devuelve `200 {alreadyScheduled:true}`
   sin escribir un segundo evento.
6. **Concurrencia.** El `UPDATE` lleva guarda optimista sobre `status` y sobre
   `cancel_at_period_end`, con `.select("id")` para poder contar filas
   afectadas; cero filas ⇒ `409 CONCURRENT_MODIFICATION`.

Transiciones rechazadas: `past_due`, `suspended` y `cancelled` no son
cancelables (`404`, no entran en la búsqueda); una `active` con el período ya
vencido devuelve `409 SUBSCRIPTION_PERIOD_ENDED` en lugar de provocar un
`cancelled` inmediato en la siguiente corrida del cron.

### 3.2 Reversión — «Mantener suscripción»

**`POST /api/billing/resume`**, mismas validaciones. Solo opera sobre `trial` o
`active` con baja programada; idempotente (`alreadyActive:true`); registra
`reason='cancel_scheduled_reverted_by_user'`. **No reactiva nada**: una
suscripción `suspended` o `cancelled` devuelve `404`.

### 3.3 Reactivación

Se implementó según la regla explícita del encargo: **nunca cambiar
directamente a `active` sin pago aprobado**.

- **Vía de cliente:** los estados `suspended`, `cancelled` y `past_due` ofrecen
  «Reactivar plan» / «Actualizar pago / Renovar», que llevan al bloque de
  planes y de ahí al checkout existente. Ninguna acción de la pantalla escribe
  el estado de la suscripción.
- **Vía de admin:** `PATCH /api/admin/subscriptions` **rechaza** ahora los
  destinos `active` y `trial` con `409 REACTIVATION_REQUIRES_PAYMENT`. Antes
  aceptaba cualquier estado de la lista, dejaba `current_period_end` en el
  pasado y el cron devolvía la suscripción a `past_due` al día siguiente.
- **Vía de pago:** el RPC `finalize_epayco_approved_payment` sigue siendo el
  único que activa. Se verificó que la ruta de confirmación no escribe
  `subscriptions` en absoluto.
- **Períodos vencidos:** el RPC arranca en `NOW()` salvo que la suscripción esté
  `active` con período futuro, así que una reactivación nunca hereda un período
  vencido. **Verificado en producción** por la compra 380694488, que dejó la
  cuenta activa hasta el 10/09/2026 (§4.1). El caso límite de reactivar desde
  `cancelled` sigue sin verificación automatizada (§11.4, tests 5-7).

**Grafo de transiciones admitidas para admin** (`ALLOWED_ADMIN_TRANSITIONS`):

```
trial     -> cancelled, suspended
active    -> past_due, cancelled, suspended
past_due  -> suspended, cancelled
suspended -> cancelled
cancelled -> (ninguna)
```

Toda transición efectiva escribe `subscription_events` con `actor_type='admin'`,
`actor_id`, motivo y `previous_status`. Repetir el estado actual es idempotente.

### 3.4 Interfaz en `/settings/billing`

| Estado | Qué se muestra | Acción |
|---|---|---|
| `active` / `trial` vigente | «Activa» + fecha de acceso | **Cancelar al final del periodo** → modal de confirmación con la fecha exacta y el recordatorio de que es reversible |
| Baja programada | Aviso ámbar «Tu suscripción se cancelará el …» + fecha de finalización | **Mantener suscripción** (revierte `cancel_at_period_end`) |
| `past_due` en gracia | Aviso ámbar con la **fecha límite** antes de la suspensión | **Actualizar pago / Renovar** → checkout |
| `past_due` con gracia vencida | Aviso rojo | **Actualizar pago / Renovar** → checkout |
| `active` con período vencido | «Pendiente de renovación» | **Actualizar pago / Renovar** → checkout |
| `suspended` | Aviso rojo explicando la causa | **Reactivar plan** → checkout |
| `cancelled` | Aviso rojo | **Reactivar plan** → checkout |
| Sin suscripción | Aviso rojo | **Reactivar plan** → checkout |
| Rol distinto de `admin` | Estado y aviso visibles, **sin ninguna acción** | — |

Bajo todo estado que exige pago se muestra: «La reactivación se completa
únicamente cuando la pasarela confirma el pago».

### 3.5 Pruebas del ciclo de vida

- **Cancelación** (`subscription-cancel.test.ts`, 18): 401/404/403, aislamiento
  entre organizaciones, marca sin cambiar estado, evento con actor real,
  idempotencia, período vencido, estados no cancelables, trial vigente,
  reversión, y el ciclo completo cancelar → mantener → cancelar comprobando que
  hay exactamente un evento por acción efectiva.
- **Vencimiento, gracia, suspensión, cron repetido y lote**
  (`subscription-transitions.test.ts`, 13): segunda corrida del cron devuelve
  ceros y no duplica eventos; la ventana de gracia queda correctamente fijada;
  la baja programada se materializa con su motivo; **lote de 250 suscripciones
  vencidas** procesado completo sin filas a medias (250 eventos, 50 canceladas /
  200 a `past_due`) y sin tocar las vigentes.
- **Transiciones inválidas** (mismo archivo): 403 sin super admin, 409 al
  activar sin pago, 409 al devolver una cancelada a trial, 409 fuera del grafo,
  idempotencia, 404 y 400.
- **UI** (`subscription-ui.test.ts`, 15): un caso por cada fila de la tabla
  anterior, más dos invariantes — ningún estado ofrece una acción que active sin
  pago, y un usuario sin rol admin nunca ve acciones.

---

## 4. Migración 033 — aplicada y verificada en producción

`supabase/migrations/20260810000100_033_subscription_reactivation.sql`

### 4.1 Evidencia de cierre — reactivación real

Codex cerró la reactivación con una compra real. **No debe repetirse.**

| Dato | Valor |
|---|---|
| Plan | Demo Inicial |
| Importe | $59.000 COP |
| Referencia ePayco | **380694488** |
| Estado del pago | Aprobado |
| Acceso de la cuenta | Activa **hasta el 10/09/2026** |

Con esto, **la reactivación deja de ser un pendiente**: el camino
`pago aprobado → RPC → suscripción activa con período futuro` está demostrado
de extremo a extremo sobre datos reales. Lo que sigue abierto es distinto y más
estrecho: la **verificación automatizada** de los casos límite (reactivar desde
`cancelled` sin duplicar, doble llamada al RPC, período que no hereda el
vencido), que son los tests 5, 6 y 7 de §11.4 y siguen **preparados, no
ejecutados**.

### 4.2 Qué corrige la migración

**Problema.** El RPC selecciona la suscripción a reactivar con
`status IN ('trial','active','past_due','suspended')`. Falta `'cancelled'`, así
que un cliente que canceló y vuelve a pagar entra por la rama `ELSE` e **inserta
una suscripción nueva**: la organización queda con dos filas.

**Cambio.** Una sola línea: añadir `'cancelled'` al `SELECT ... FOR UPDATE`. El
resto del cuerpo ya es correcto para reactivar (período desde `NOW()`, limpieza
de `grace_ends_at`/`suspended_at`/`cancelled_at`, evento registrado).

### 4.3 Lo que sigue abierto

1. **Decisión de negocio ya materializada, no documentada.** Reutilizar la fila
   cancelada frente a conservarla como histórico eran dos políticas válidas; la
   migración aplicada implementa la **reutilización**. Conviene dejarlo escrito
   como regla de producto, porque ahora es el comportamiento en producción.
2. **Casos límite sin verificación automatizada:** reactivar desde `cancelled`
   sin duplicar y la reentrada del RPC con el mismo `event_key`. La compra
   380694488 demuestra el camino feliz, no estos dos. Tests 5-7 de §11.4.
3. El rollback está documentado en la cabecera del archivo: reaplicar la
   definición de la función que contiene la migración `010`.

---

## 5. Prioridad 2 — Outbox

**No se inventó ninguna regla de negocio.** Los cuatro tipos sin handler siguen
sin handler; lo que se añadió es la prueba que congela y documenta su
comportamiento actual (`outbox-contract.test.ts`, 12 casos):

- `renew_subscription`, `reconcile_payment`, `expire_subscription` y
  `apply_plan_change` **no se completan**: cada uno va a reintento con
  `p_error_code='handler_failed'` y el mensaje
  `No handler registered for billing job type '<tipo>'`.
- Agotados los 5 intentos, terminan en `dead_letter`.
- Un lote mixto **no se bloquea**: el job `send_notification` del mismo lote se
  completa correctamente mientras el otro va a reintento.
- El único tipo implementado valida su payload antes de llamar al proveedor
  (`payload.request is required` / `is invalid`), sin efectos de red.

### Gap de contrato pendiente

Para los cuatro tipos falta, en el repositorio, absolutamente todo el contrato:

| Falta | Detalle |
|---|---|
| Productor | Ningún código encola estos tipos hoy. No está definido quién debería hacerlo ni cuándo |
| Esquema de payload | No hay forma documentada del `payload` de cada tipo |
| Semántica de éxito | Qué significa "completado" para una renovación o una conciliación |
| Idempotencia | Con qué clave se deduplica un reintento (¿`correlation_id`? ¿`payment_id`?) |
| Fallo permanente | Qué debe ocurrir al llegar a `dead_letter`: ¿alerta? ¿intervención manual? ¿degradación del servicio? |

Recomendación: o se escribe ese contrato y se implementan, o se retiran los
cuatro del enum `BillingOutboxJobType` para que nadie asuma que existen. En
ambos casos hace falta una alerta sobre `billing_outbox_jobs.status='dead_letter'`,
que hoy no existe.

---

## 6. Prioridad 3 — Contract tests

`src/qa-e2e/payment-contracts.test.ts` (40 casos), **sin llamar a ningún
proveedor real**.

### Firmas

- **Wompi integridad:** orden exacto de concatenación; el campo opcional
  `expiresAt` verificado por separado; cuatro mutaciones (referencia, monto,
  moneda, secreto) que deben producir firmas distintas.
- **Wompi eventos:** lectura de propiedades anidadas por ruta con puntos; una
  propiedad ausente se firma como cadena vacía y no como `"undefined"`; alterar
  el estado del evento invalida la firma.
- **PayU:** firma de checkout con separador `~`; `formatPayUConfirmationValue`
  con cinco casos incluido el recorte del decimal cero y el valor no numérico;
  firma de confirmación con `state_pol`; los cuatro `state_pol` documentados
  (4/6/5/104) producen firmas distintas.
- **Comparación en tiempo constante:** insensible a mayúsculas, tolerante a
  longitudes distintas, y rechazo de una alteración de un solo carácter.

### Payloads de checkout

- Wompi: URL de redirect, monto en centavos, firma coincidente, y rechazo de
  monedas distintas de COP.
- PayU: formulario sandbox, monto en unidades con dos decimales, `test=1`, firma
  coincidente.

### Estados

El mapeo de ePayco (`mapEpaycoStatus`) ya estaba cubierto en
`src/qa-e2e/epayco.test.ts`. **Wompi y PayU no tienen mapeo implementado**, así
que no hay nada que probar: es parte del gap de §7.

### Idempotencia

- Reenviar la misma transacción tres veces ⇒ un solo pago, un solo evento de
  webhook, **una sola invocación** del RPC de activación.
- Dos transacciones distintas sobre el mismo checkout ⇒ la segunda se ignora en
  lugar de cobrar dos veces el período.
- Conciliación: firma inválida, monto distinto, moneda distinta, ambiente
  distinto (sandbox vs producción), referencia interna que no corresponde, y
  checkout expirado — cada uno con su `last_error` esperado y sin invocar el RPC.

### Coherencia pasarela ↔ webhook

Guardián del riesgo más grave de la auditoría:

- Se afirma que **PayU publica `confirmationUrl` = `/api/webhooks/payments/payu`
  y que esa ruta NO existe**. La prueba falla en cuanto alguien la implemente
  sin actualizar la expectativa.
- Para **toda** pasarela: si `isActivationReady()` es `true`, su URL de
  confirmación debe corresponder a una ruta existente del App Router. Hoy Wompi
  y PayU devuelven `false`, lo que se afirma explícitamente.

### RLS y PostgreSQL

`tests/postgres-integration.test.mjs` — **se salta por defecto**. Solo corre con
`QA_DATABASE_URL` apuntando a una base desechable, y **aborta con error** si la
cadena de conexión contiene `supabase.co`, `production` o `prod.`. Todas las
escrituras van dentro de `BEGIN … ROLLBACK`. Cubre:

1. RLS habilitado en las 14 tablas de billing.
2. Cada una con al menos una policy declarada.
3. Las 6 funciones de billing no ejecutables por `anon` ni `authenticated`.
4. Existencia del índice único `(provider, environment, event_key)`.
5. Reactivación desde `suspended`: una sola fila, período futuro.
6. Reactivación desde `cancelled`: sin duplicado (falla sin la migración 033 —
   ese fallo *es* la documentación del gap).
7. Doble llamada al RPC: misma suscripción devuelta, un solo evento.

**Limitación honesta:** los casos 5–7 dependen de un helper de siembra SQL
(`smarttalk.qa_seed_reactivation_case`) que **no existe todavía**. Si no está,
esos tests salen sin aserciones en lugar de fallar en falso. Crearlo requiere
decidir el fixture de organización/plan/checkout, y esa decisión pertenece a
quien tenga la base de QA aislada.

---

## 7. Prioridad 4 — Multicanal y seguridad

### Matriz de canales (`channel-webhooks.test.ts`, 41 casos)

Ejecutada sobre las **rutas reales** con firmas HMAC de secretos sintéticos.

| Verificación | Facebook | Instagram | Messenger | WhatsApp |
|---|---|---|---|---|
| `hub.challenge` con token correcto | ✅ | ✅ | ✅ | ✅ |
| Rechazo de verify token incorrecto (403) | ✅ | ✅ | ✅ | ✅ |
| Rechazo de `hub.mode` distinto de `subscribe` | ✅ | ✅ | ✅ | ✅ |
| Rechazo sin cabecera de firma (401) | ✅ | ✅ | ✅ | ✅ |
| Rechazo de firma con otro secreto (401) | ✅ | ✅ | ✅ | ✅ |
| Rechazo de cuerpo alterado con firma válida | ✅ | ✅ | ✅ | ✅ |
| Aceptación de firma válida (200) | ✅ | ✅ | ✅ | ✅ |
| Encolado en `webhook_events` | ✅ | ✅ | ✅ | procesa en línea |
| Payload de prueba de Meta reconocido | ✅ | — | — | — |
| Cuerpo no-JSON rechazado con 400 tras validar firma | ✅ | — | — | — |

Además: **aislamiento de secretos** — el secreto de Instagram no valida un
evento de Facebook, el de WhatsApp no valida uno de Instagram, e Instagram
acepta su propio `META_IG_APP_SECRET`.

**Hallazgo documentado por prueba:** un reenvío del mismo payload **encola un
segundo evento**. La cola no deduplica en la entrada; la unicidad depende del
procesamiento aguas abajo por `mid`/`wa_message_id`. La prueba congela ese
comportamiento para que un cambio sea deliberado.

**Nota de aislamiento:** el procesamiento de WhatsApp (`persistWhatsAppWebhook`,
`processIncomingMessage`) se sustituye por dobles. Sin ellos la ruta abre
conexiones reales al backend legacy y la prueba se cuelga — se detectó al
ejecutarla. Esta suite valida la capa de seguridad de la ruta, no el
procesamiento.

### Rate limiting

- 201 peticiones firmadas desde una IP cruzan el umbral de 200/min y devuelven
  `429` con cabecera `Retry-After`.
- Los hits se registran con clave `webhook-facebook:<ip>`.
- **Aislamiento por IP:** una IP bloqueada no afecta a otra.
- `RATE_LIMIT_WHITELIST` reconoce la IP configurada y no la ajena.

### Resiliencia (`resilience.test.ts`, 8 casos)

- **Timeouts — trinquete.** Se midió el inventario real: **26 módulos de
  servidor** (`lib/**`, `app/api/**`) hacen `fetch` sin `AbortSignal.timeout`
  ni `AbortController`. La lista está congelada en el test: **un módulo nuevo
  sin timeout rompe la prueba**, corregir uno existente la mantiene verde. No
  se corrigió ninguno — es deuda del pendiente P2 y tocarla excedía el encargo.
  Además se afirma que `lib/social/**` y `lib/notify/**` **conservan** sus
  timeouts explícitos.
- **Backoff del outbox:** la progresión exacta `[30, 60, 120, 240, 480, 960,
  1920, 3600, 3600]`, monotonía, y el total de los 5 intentos configurados
  (930 s ≈ 15,5 min antes del dead letter).
- **Degradación del rate limiter:** con la base caída cae a `memory-fallback`,
  sigue limitando y lo reporta en el resultado — el fail-open queda documentado
  como comportamiento observable, incluida su limitación por worker en
  serverless. Con base disponible cuenta contra la ventana persistida.

### Auditoría

Sin cambios de código, pero el hueco se estrechó: **todas** las transiciones que
ahora produce la aplicación escriben `subscription_events` (cliente con
`actor_type='user'`, admin con `actor_type='admin'`, cron con `'system'`, RPC
con `'provider'`). `billing_audit_events` **sigue sin ningún productor**; ese
pendiente no se abordó porque exige decidir qué acciones administrativas se
auditan y con qué esquema.

---

## 8. Cambios en el helper de pruebas

`src/qa-e2e/helpers/fake-supabase.ts` recibió tres mejoras. Las tres fueron
necesarias porque el fake no reproducía comportamiento del que dependen las
rutas — y esa infidelidad hacía pasar pruebas que no probaban nada:

1. **`select()` encadenado ya no convierte un `update`/`delete` en lectura.**
   Antes, `.update(...).select("id")` se degradaba a `SELECT`, de modo que la
   guarda optimista de las rutas nuevas era intesteable.
2. **Índices únicos emulables** (`uniqueIndexes`). Un `INSERT` que los viole
   devuelve `{code:"23505"}` como PostgREST. Sin esto, la prueba de
   idempotencia de webhooks pasaba en falso: el fake aceptaba el duplicado y la
   ruta nunca ejercitaba su rama de deduplicación.
3. **`rpcHandlers` opcionales.** Permiten emular el efecto observable de una
   función SQL. Se usa para reproducir que el RPC de activación deja el checkout
   fuera de `pending`.

Sin handler ni índices declarados, el comportamiento es idéntico al anterior:
las 8 suites que ya existían siguen verdes sin cambios.

**Lo que esto NO prueba:** que el índice único exista realmente en la base, ni
que el cuerpo del RPC sea correcto. Eso solo lo demuestra el arnés PostgreSQL
de §6, que hoy se salta.

---

## 9. Riesgos

| # | Riesgo | Severidad | Mitigación / estado |
|---|---|---|---|
| 1 | **La migración 033 modifica una función `SECURITY DEFINER` que maneja dinero** | Alta | Aplicación SQL confirmada; falta probar la reactivación real desde `cancelled` y conservar la evidencia |
| 2 | **La política de reactivación desde `cancelled` es una decisión de negocio que tomé yo** (reutilizar la fila) | Alta | Documentada en §4 y en la cabecera del SQL. Si el negocio prefiere histórico, descartar la migración |
| 3 | **El `PATCH` de admin cambió de comportamiento**: ya no permite `→ active` ni `→ trial` | Media | Es lo pedido explícitamente. Si existía un procedimiento operativo que reactivaba así, deja de funcionar y hay que reemplazarlo por el checkout |
| 4 | La suite QA sigue corriendo contra un Supabase en memoria | Media | El arnés PostgreSQL existe pero se salta; depende del aislamiento QA (P0 de la auditoría, no abordado aquí) |
| 5 | Las pruebas de UI son de lógica, no de DOM | Media | `deriveSubscriptionUi` está cubierta al 100 % de sus ramas, pero **no se probó el render, el modal ni el `fetch` del componente**: no hay `@testing-library/react` en el proyecto y no instalé dependencias nuevas |
| 6 | El cron sigue sin paginar | Media | Se probó con 250 filas en memoria, lo que **no** mide el timeout real de la función serverless |
| 7 | 26 módulos de servidor siguen sin timeout | Media | Congelados en un trinquete para que no crezcan; ninguno corregido |
| 8 | El aviso de suspensión sigue sin notificación al cliente | Media | No abordado: exige decidir plantilla, canal y momento |
| 9 | La página muestra los límites del plan aunque la suscripción esté `cancelled` | Baja | La tarjeta de estado lo hace explícito con aviso rojo, pero las barras de uso siguen mostrando el plan anterior |
| 10 | `billing_audit_events` sin productor | Baja | Sin cambios; `subscription_events` sí cubre ahora todas las transiciones de la app |

---

## 10. Pendientes

### Bloqueantes antes de aplicar nada en un entorno

1. Revisar y decidir sobre la **migración 033** (§4), incluida la política de
   reactivación desde `cancelled`.
2. Levantar una **base desechable** con las migraciones aplicadas y ejecutar
   `QA_DATABASE_URL=… node --test --experimental-strip-types tests/postgres-integration.test.mjs`.
   Esto convierte 7 tests saltados en verificación real de RLS, índices y RPC.
3. Escribir el helper `smarttalk.qa_seed_reactivation_case` que los casos 5–7 de
   ese arnés necesitan.

### Siguiente tramo de trabajo

4. Contrato de los cuatro tipos de outbox, o retirarlos del enum (§5).
5. Webhooks de PayU y Wompi, o mover el bloqueo de `isActivationReady()` desde
   el código a configuración de base de datos.
6. Notificación al cliente al entrar en gracia y al suspender.
7. Paginación y medición real del cron de ciclo de vida.
8. Prorrateo y validación de downgrade en el cambio de plan (§1.1 de la
   auditoría) — no abordado aquí.
9. Pruebas de DOM del componente, si se acepta añadir `@testing-library/react`.
10. Productor de `billing_audit_events` para acciones administrativas.

### Fuera del alcance de este trabajo

El **aislamiento QA** (P0 de la auditoría: proyecto Supabase y Vercel propios)
no se tocó, porque exige cambiar infraestructura y variables. Sigue siendo el
bloqueo que impide ejecutar los E2E multicanal reales y las pruebas de carga.

---
---

# Iteración 2 — 2026-08-10

## 11. Script reproducible de la suite PostgreSQL/RLS

### 11.1 Qué se entrega

| Archivo | Rol |
|---|---|
| `scripts/qa-postgres-suite.mjs` | Runner con guardas, carga de fixtures, ejecución y limpieza |
| `supabase/qa/001_qa_lifecycle_fixtures.sql` | Funciones `qa_seed_lifecycle_case`, `qa_seed_reactivation_case`, `qa_fixture_user`, `qa_cleanup_fixtures` |
| `tests/postgres-integration.test.mjs` | Ampliado de 7 a **13 tests** |

### 11.2 Comando exacto

```bash
cd web
supabase start                 # Postgres desechable en 127.0.0.1:54322
supabase db reset              # aplica supabase/migrations/ desde cero
QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/qa-postgres-suite.mjs
```

### 11.3 Guardas — verificadas en ejecución

El runner no puede apuntarse a un entorno real. Las cuatro guardas se probaron
de verdad y esta es su salida literal:

| Entrada | Salida |
|---|---|
| sin `QA_DATABASE_URL` | `✖ Falta QA_DATABASE_URL` + instrucciones |
| `…@db.abcdefgh.supabase.co…` | `✖ QA_DATABASE_URL coincide con /supabase\.co/i y parece un entorno gestionado o productivo` |
| `…@10.1.2.3:5432…` | `✖ El host '10.1.2.3' no es local` |
| `…@127.0.0.1:54322…` sin servidor | `✖ No se pudo conectar: connect ECONNREFUSED` |

Además, ya conectado: (a) aborta si hay organizaciones cuyo nombre no empieza
por `[QA` —salvo `--allow-nonempty`—; (b) aborta si faltan las funciones de las
migraciones; (c) **informa** si la migración 033 está aplicada, sin exigirla.

### 11.4 Los 13 tests

| # | Verifica |
|---|---|
| 1 | RLS habilitado en las 14 tablas de billing |
| 2 | Cada una con al menos una policy declarada |
| 3 | Las 6 funciones de billing no ejecutables por `anon` ni `authenticated` |
| 4 | Índice único de webhooks — por catálogo **y** provocando un `23505` real |
| 5 | Reactivar desde `suspended`: una sola fila, período futuro, `suspended_at` limpiado |
| 6 | Reactivar desde `cancelled`: sin duplicado (prueba de la migración 033) |
| 7 | Doble llamada al RPC: misma suscripción, un solo evento |
| 8 | Los fixtures producen los 8 estados del ciclo de vida |
| 9 | `grace_period` vs `past_due_expired` dejan la gracia vigente/terminada |
| 10 | Renovación: el período nuevo arranca donde terminaba el anterior, sin regalar días |
| 11 | Cambio de plan: mueve `plan_id` en suscripción y organización, sin duplicar |
| 12 | Cada activación deja **un** `subscription_event` con `actor_type='provider'` y el `correlation_id` del proveedor |
| 13 | Un checkout expirado no puede activar (`checkout_not_pending`) |

Todo test que escribe corre dentro de `BEGIN … ROLLBACK`. Los registros llevan
prefijo `[QA-FIXTURE]` y correos `.invalid`, así que un fallo de rollback sería
evidente e inofensivo; `qa_cleanup_fixtures()` lo detecta y lo reporta.

### 11.5 Estado honesto

**No se ejecutaron contra una base real.** Este entorno sólo tiene el cliente
`libpq` (no hay servidor Postgres, ni Docker, ni Supabase CLI operativo), y se
verificó explícitamente. Lo probado en ejecución son las guardas del runner y
que la suite se salta limpiamente. **Los 13 tests siguen sin evidencia de
ejecución** — es el pendiente P-01 de §15.

---

## 12. Contract tests de ePayco — completados

`src/qa-e2e/payment-contracts.test.ts` pasó de 40 a **52 casos**. Cobertura de
lo solicitado:

| Requisito | Casos | Dónde |
|---|---|---|
| Pago pendiente | `x_cod_response=3` deja el pago `pending`, el checkout **sin cerrar** y no activa | §"estados de pago" |
| Pago rechazado | `=2` cierra el checkout como `rejected`, no activa | ídem |
| Pago fallido | `=4` cierra como `failed` | ídem |
| Código desconocido | `=99` cae a `pending` (fail-safe), no activa | ídem |
| Firma inválida | Rechazo `400` **antes de tocar la base**: cero eventos, cero pagos | §"conciliación" |
| Monto alterado | `400` + `last_error=amount_or_currency_mismatch` | ídem |
| Moneda alterada | `400` + mismo `last_error` | ídem |
| Referencia alterada | `400` + `last_error=reference_mismatch` | ídem |
| Ambiente alterado | `400` + `last_error=environment_mismatch` | ídem |
| Confirmación incompleta | Falta `x_transaction_id`, `x_ref_payco` o `x_extra1` ⇒ `400`, con la firma recalculada para aislar la validación | §"incompletas" |
| Monto no numérico | `400` | ídem |
| Webhook duplicado | Tres reenvíos ⇒ 1 pago, 1 evento, **1** activación | §"idempotencia" |
| Idempotencia | Segunda y tercera respuesta `{duplicate:true}` | ídem |
| **Concurrentes** | 2 y 5 confirmaciones simultáneas de la misma transacción ⇒ 1 pago, 1 evento, 1 activación | §"concurrentes" |

### 12.1 Hallazgo nuevo — la ruta no serializa, la base sí

El caso «dos transacciones **distintas** llegando a la vez al mismo checkout»
**falló al escribirlo**, y el fallo era correcto: ambas confirmaciones leen el
checkout mientras sigue `pending`, así que **las dos invocan el RPC**. Lo único
que impide la doble activación es el `SELECT … FOR UPDATE` dentro de la función
SQL.

Comportamiento real, ahora congelado en el test:

- 2 eventos de webhook, **2** invocaciones del RPC;
- respuestas `200` y `500`;
- el checkout queda `approved` una sola vez;
- **el evento perdedor queda `failed`** con `last_error='atomic_activation_failed'`.

Consecuencia operativa: ese evento fallido depende de que ePayco reintente o de
una recuperación manual, porque no existe worker que recorra
`billing_webhook_events` en estado `failed` (§5 de la auditoría, sigue abierto).

Para poder probarlo, el stand-in del RPC en el fake ahora replica el guard
(`checkout_not_pending`) y el fake convierte una excepción del handler en
`{error}` como hace supabase-js.

---

## 13. Fixtures de ciclo de vida

Se entregan **en dos planos que describen los mismos escenarios**:

| Plano | Archivo | Uso |
|---|---|---|
| SQL | `supabase/qa/001_qa_lifecycle_fixtures.sql` → `qa_seed_lifecycle_case(caso)` | Suite PostgreSQL (§11) |
| En memoria | `src/qa-e2e/helpers/fixtures.ts` → `LIFECYCLE_FIXTURES` | Suite rápida |

Casos cubiertos: `active`, `past_due`, `grace_period`, `past_due_expired`,
`suspended`, `cancelled`, `renewal`, `plan_change`, `scheduled_cancellation` y
`no_subscription` (sólo SQL).

El fixture SQL siembra el escenario **completo**: organización, plan A y plan B,
precios, suscripción en el estado pedido, `checkout_session` pendiente y
`payment` aprobado listo para invocar el RPC. Devuelve un `jsonb` con todos los
identificadores. El caso `plan_change` apunta el checkout al plan B, que es lo
que permite el test 11.

### 13.1 Matriz de coherencia backend ↔ pantalla

`src/qa-e2e/lifecycle-matrix.test.ts` (**39 casos**) recorre los estados y cruza
dos fuentes de verdad que hasta ahora nadie comparaba:

- `checkBillingFeature` — ¿la organización conserva acceso?
- `deriveSubscriptionUi` — ¿la pantalla exige pago?

Invariantes verificadas:

1. Si el backend niega el acceso, la pantalla **siempre** exige pago y sólo
   ofrece `renew`/`reactivate`.
2. Si la pantalla ofrece cancelar, el backend **siempre** concede acceso.
3. Los estados que conservan acceso son exactamente: `active`, `past_due`,
   `grace_period`, `plan_change`, `renewal`, `scheduled_cancellation`.
4. La baja programada conserva acceso completo hasta `current_period_end`.
5. `suspended` y `cancelled` nunca conservan acceso.

---

## 14. Matriz E2E multicanal con mocks

Cobertura ya verificada en `src/qa-e2e/channel-webhooks.test.ts` (41 casos), sin
red y con secretos sintéticos:

| Verificación | Facebook | Instagram | Messenger | WhatsApp |
|---|:--:|:--:|:--:|:--:|
| `hub.challenge` con token correcto | ✅ | ✅ | ✅ | ✅ |
| Verify token incorrecto ⇒ 403 | ✅ | ✅ | ✅ | ✅ |
| `hub.mode` distinto de `subscribe` | ✅ | ✅ | ✅ | ✅ |
| Sin cabecera de firma ⇒ 401 | ✅ | ✅ | ✅ | ✅ |
| Firma con otro secreto ⇒ 401 | ✅ | ✅ | ✅ | ✅ |
| Cuerpo alterado con firma válida ⇒ 401 | ✅ | ✅ | ✅ | ✅ |
| Firma válida ⇒ 200 | ✅ | ✅ | ✅ | ✅ |
| Encolado en `webhook_events` | ✅ | ✅ | ✅ | n/a (en línea) |
| Aislamiento de secreto entre canales | ✅ | ✅ | ✅ | ✅ |
| Payload de prueba de Meta | ✅ | — | — | — |
| Cuerpo no-JSON ⇒ 400 tras validar firma | ✅ | — | — | — |
| Rate limiting 200/min + `Retry-After` | ✅ | — | — | — |
| Aislamiento de cupo por IP | ✅ | — | — | — |

**Mocks empleados y por qué:** el procesamiento de WhatsApp
(`persistWhatsAppWebhook`, `processIncomingMessage`, `processStatusUpdate`) se
sustituye por dobles porque, sin ellos, la ruta abre conexiones reales al
backend legacy y la prueba se cuelga —se detectó al ejecutarla—. `after()` de
Next se ejecuta de inmediato para poder aseverar la cola.

**Hallazgo congelado:** un reenvío del mismo payload **encola un segundo
evento**. La cola no deduplica en la entrada; la unicidad depende del
procesamiento aguas abajo por `mid`/`wa_message_id`.

**Fuera de alcance** (requiere ambiente QA aislado y app de Meta de prueba):
ventana de 24 h, plantillas aprobadas, adjuntos multimedia y límites reales de
Meta.

---

## 15. Hallazgos de la revisión de seguridad y operación

Congelados como pruebas en `src/qa-e2e/security-posture.test.ts` (14 casos) y
`src/qa-e2e/resilience.test.ts`. Cada hallazgo abierto tiene un test que afirma
el estado **actual**: cuando se corrija, el test falla y obliga a cerrarlo con
evidencia.

### H-01 · La ruta de cobro de ePayco no tiene timeout — **P1**

- **Archivo.** `src/lib/epayco/client.ts:44` (`POST /login`) y `:59`
  (`POST /payment/session/create`).
- **Cómo se detectó.** El trinquete de timeouts de la iteración 1 **falló solo**
  al reejecutarlo: la migración a ePayco Checkout v2 (commit `a960455`) añadió
  dos llamadas servidor-a-servidor sin `AbortSignal.timeout`.
- **Riesgo.** Son llamadas sincrónicas dentro de `POST /api/epayco/checkout`. Si
  `apify.epayco.co` se degrada, la función serverless queda colgada hasta agotar
  su presupuesto y el usuario no recibe ni error ni checkout.
- **Prueba sugerida.** Apuntar `EPAYCO_API_BASE_URL` a un endpoint que demore
  60 s y verificar que la ruta corta y responde error controlado.
- **Estado.** **No corregido a propósito**: el archivo tiene tres commits
  recientes de otro autor y no se puede validar contra la API real de ePayco.
  Registrado en el trinquete y con test dedicado.

### H-02 · `/api/epayco/checkout` sin rate limiting — **P1**

- **Archivo.** `src/app/api/epayco/checkout/route.ts:7` (el `POST` completo no
  invoca `rateLimit`).
- **Riesgo.** Es la ruta de cobro que usa la UI. Su hermana
  `/api/billing/checkout` sí limita a 10/min por usuario
  (`src/lib/billing/rate-limit.ts:8`). Un usuario autenticado puede crear
  sesiones de pago en bucle contra ePayco y llenar `checkout_sessions`.
- **Prueba sugerida.** 30 peticiones en un minuto con la misma sesión; esperar
  `429` a partir del umbral. Hoy devolvería 30 sesiones creadas.

### H-03 · `/api/epayco/checkout` no es idempotente — **P1**

- **Archivo.** `src/app/api/epayco/checkout/route.ts:106`
  (`idempotency_key: randomUUID()`).
- **Riesgo.** La clave se genera **en el servidor**, así que no deduplica nada:
  un doble clic o un reintento de red crea dos `checkout_sessions` y dos
  sesiones en ePayco para el mismo plan. La ruta genérica sí exige
  `Idempotency-Key` del cliente y responde `409 IDEMPOTENCY_CONFLICT`.
- **Prueba sugerida.** Dos `POST` concurrentes con la misma cabecera
  `Idempotency-Key`; esperar una sesión y un `409` o la misma sesión repetida.

### H-04 · `getEpaycoConfig()` expone claves privadas — **P2**

- **Archivo.** `src/lib/epayco/client.ts:111-119` (devuelve `privateKey` y
  `pKey`).
- **Riesgo.** Hoy es **inerte: no tiene ningún consumidor** —verificado por
  test—. El riesgo es futuro: basta que una ruta devuelva su resultado al
  navegador para filtrar el material con el que se firman las confirmaciones.
- **Prueba sugerida.** El test ya afirma cero consumidores; si aparece uno,
  falla y obliga a revisar el destino de esos campos.

### H-05 · Los logs no llevan `correlation_id` — **P2**

- **Archivos.** `src/lib/billing/service.ts:196`,
  `src/lib/billing/subscription-actions.ts:167`,
  `src/app/api/epayco/confirmation/route.ts:158` y `:306`.
- **Estado.** La bitácora **sí** es correcta: los cuatro escritores de
  `subscription_events` fijan `correlation_id` con prefijo de origen
  (`lifecycle:`, `cancel:`, `resume:`, `admin:`) y el RPC usa la clave del
  proveedor. Verificado por test.
- **Riesgo.** Ningún `console.error/warn` de billing incluye ese identificador,
  así que ante un incidente **no se puede unir una línea de log con la fila de
  `subscription_events`**. Verificado: cero logs de billing lo mencionan.
- **Prueba sugerida.** Tras un fallo de activación, buscar el `event_key` en
  logs y en la tabla, y medir si se puede reconstruir la secuencia.

### H-06 · Backup y restauración documentados, sin ensayo registrado — **P1**

- **Archivos.** `docs/RUNBOOK.md:102-124` (cron diario
  `/etc/cron.d/backup-stacks`, rotación 7 días, procedimiento de restore con
  `psql`); `GUIA_OPERATIVA_FASE_2_DESPLIEGUE.md:220-228` y `:477-485`.
- **Estado.** El procedimiento **existe y está escrito**, incluido el aviso de
  que el restore borra el estado posterior al backup.
- **Riesgo.** No hay evidencia en el repositorio de una restauración **probada**
  (fecha, archivo, responsable, tiempo). Un backup no verificado no es un
  backup. Además `RUNBOOK.md:83` advierte que perder `TOKEN_ENCRYPTION_KEY`
  deja los tokens irrecuperables, y la clave no forma parte del backup de base.
- **Prueba sugerida.** Restaurar el último dump sobre la base desechable de
  §11 y correr allí la suite PostgreSQL. Cierra dos pendientes a la vez.

### H-07 · Rollback de migraciones incompleto — **P1**

- **Archivos.** `supabase/migrations/20260809000100_031_atomic_billing_quota.sql`
  y `…032_billing_outbox_worker.sql`: ningún `DROP FUNCTION` ni bloque inverso.
- **Estado.** Sólo la **033** entrega rollback documentado (reaplicar la
  definición de la 010, indicado en su cabecera).
- **Riesgo.** `BILLING_ATOMIC_QUOTA_MODE=off` desactiva el **uso** de las RPC de
  la 031 desde la app, pero no hay camino escrito para revertir los objetos SQL
  de la 031 ni de la 032.
- **Prueba sugerida.** En la base desechable: aplicar todo, ejecutar el SQL
  inverso propuesto y verificar que la app arranca con las variables en `off`.

### H-08 · PCI — sin hallazgos

- **Verificado por test.** (a) No existe ningún campo de tarjeta
  (`card_number`, `cvv`, `expiry_*`) en el código de la aplicación: el checkout
  es hospedado. (b) `sanitizeEpaycoPayload`
  (`src/lib/epayco/client.ts:212-236`) usa **lista blanca**, así que descarta
  número de tarjeta, documento, correo, teléfono, IP y la propia firma; se
  probó con un payload que incluye todos esos campos. (c) Ningún componente de
  cliente importa `@/lib/epayco/client`. (d) Sólo la clave pública lleva
  prefijo `NEXT_PUBLIC_`.
- **Nota.** Esto cubre el código de la aplicación. **No sustituye** una
  evaluación PCI-DSS formal del alcance del comercio.

### H-09 · Rate limiting — resumen de cobertura

| Ruta | Rate limiting |
|---|---|
| `/api/billing/checkout` | ✅ 10/min por usuario |
| `/api/epayco/confirmation` | ✅ 120/min por IP |
| `/api/webhook/*` | ✅ 200/min por IP |
| `/api/epayco/checkout` | ❌ **H-02** |
| `/api/billing/cancel` · `/resume` | ❌ por diseño: exigen rol `admin` y son idempotentes |

Sigue vigente de la auditoría: el limitador es **fail-open** y en fallo de base
cae a un contador por worker (verificado en `resilience.test.ts`), y cada
verificación hace `INSERT`+`COUNT` en la misma base que protege.

---

## 16. Instrucciones exactas para que Codex revise y publique

### 16.1 Archivos de esta iteración

**Nuevos**

```
web/scripts/qa-postgres-suite.mjs
web/supabase/qa/001_qa_lifecycle_fixtures.sql
web/src/qa-e2e/lifecycle-matrix.test.ts
web/src/qa-e2e/security-posture.test.ts
```

**Modificados**

```
web/tests/postgres-integration.test.mjs      # 7 -> 13 tests, usa los fixtures
web/src/qa-e2e/payment-contracts.test.ts     # 40 -> 52 casos
web/src/qa-e2e/resilience.test.ts            # H-01 en el trinquete + test dedicado
web/src/qa-e2e/helpers/fixtures.ts           # LIFECYCLE_FIXTURES
web/src/qa-e2e/helpers/fake-supabase.ts      # errores de rpc + tipo del cliente
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md       # este documento
```

**Sin tocar en esta iteración:** ningún archivo de `src/app`, `src/lib` ni
`src/components`. La iteración 2 es exclusivamente pruebas, fixtures,
herramientas y documentación.

### 16.2 Verificación antes de publicar

```bash
cd web
git status --porcelain          # esperar sólo los archivos de §16.1 y de la iteración 1
npx vitest run                  # esperado: 400 passed / 28 files
npm test                        # esperado: node 6 passed, 13 skipped
npm run lint                    # esperado: 0 errores, 168 warnings
npx tsc --noEmit | grep '^src/' # esperado: sin salida
npm run build                   # esperado: Compiled successfully
git diff --check                # esperado: sin salida
```

Tras `npm run build`, `src/lib/skills/data.generated.ts` cambia sólo su
comentario de fecha (lo regenera el `prebuild`). Restaurarlo antes de commitear:

```bash
git checkout -- src/lib/skills/data.generated.ts
```

### 16.3 Decisiones que requieren tu criterio

1. **La migración 033 ya fue aplicada** en Supabase según el propietario
   (`Success. No rows returned`). Sigue **sin prueba funcional**: los tests 5, 6
   y 7 de §11.4 la validarían, y ninguno se ha ejecutado. Antes de dar por buena
   la reactivación, ejecuta la suite de §11.2 contra una base desechable.
2. **H-01, H-02 y H-03 tocan la ruta de cobro** y no los corregí porque
   `src/lib/epayco/client.ts` y `src/app/api/epayco/checkout/route.ts` tienen
   trabajo reciente de otro autor. Decide si se arreglan en esta rama o en la
   suya; los tres tienen prueba sugerida y test que los congela.
3. **El `PATCH` de admin cambió de comportamiento** en la iteración 1 (§3.3): ya
   no permite `→ active` ni `→ trial`. Si existía un procedimiento operativo que
   reactivaba así, hay que reemplazarlo por el checkout antes de publicar.

### 16.4 Orden de publicación sugerido

1. Revisar el diff completo de ambas iteraciones.
2. Ejecutar §16.2 y confirmar los seis resultados.
3. Ejecutar §11.2 contra una base desechable y **pegar la salida** en este
   documento como evidencia. Sin eso, los tests 1-13 siguen sin verificar.
4. Decidir sobre §16.3.
5. Commit en la rama del agente. Sugerencia de mensaje:
   `test: add PostgreSQL/RLS harness, ePayco contract tests and lifecycle fixtures`
6. **No publicar en Production** hasta que la suite PostgreSQL tenga evidencia y
   H-01/H-02/H-03 estén resueltos o aceptados de forma explícita.

---

## 17. Pendientes de la iteración 2

| # | Pendiente | Prioridad |
|---|---|---|
| P-01 | **Ejecutar la suite PostgreSQL de §11** contra una base desechable. Los 13 tests están escritos y no verificados; este entorno no tiene servidor Postgres | P0 |
| P-02 | H-01 · timeout en las dos llamadas de ePayco v2 | P1 |
| P-03 | H-02 · rate limiting en `/api/epayco/checkout` | P1 |
| P-04 | H-03 · idempotencia real en `/api/epayco/checkout` | P1 |
| P-05 | H-06 · ensayo de restauración registrado (fecha, archivo, responsable, duración) | P1 |
| P-06 | H-07 · rollback escrito para las migraciones 031 y 032 | P1 |
| P-07 | Worker de recuperación para `billing_webhook_events` en estado `failed`; la §12.1 demuestra que la concurrencia los produce | P1 |
| P-08 | H-05 · incluir `correlation_id` en los logs de billing | P2 |
| P-09 | H-04 · retirar o restringir `getEpaycoConfig()` | P2 |
| P-10 | Pendientes heredados de §10 que siguen abiertos: contrato del outbox, webhooks de Wompi/PayU, notificación al suspender, paginación del cron, prorrateo del cambio de plan, pruebas de DOM y productor de `billing_audit_events` | P1/P2 |

Ningún punto de esta tabla debe marcarse como cerrado sin evidencia
reproducible: salida de comando, ID de deployment o consulta SQL.

> **Estado tras la iteración 3:** P-02 (H-01), P-03 (H-02) y P-04 (H-03) quedan
> **cerrados** con las pruebas de §18. El resto sigue abierto.

---
---

# Iteración 3 — 2026-08-10

## 18. H-01, H-02 y H-03 — cerrados con prueba

Archivo de prueba: `src/qa-e2e/epayco-checkout-route.test.ts` (**23 casos, todos
ejecutados en verde**). Ejercita la ruta real con `fetch` global sustituido por
un doble; **la API de ePayco no se contacta en ningún momento**.

### 18.1 H-01 · Timeout en las dos llamadas — CERRADO

**Cambio.** `src/lib/epayco/client.ts` gana un envoltorio `epaycoFetch()` que
aplica `AbortSignal.timeout(...)` a **todas** las llamadas salientes, y un tipo
de error `EpaycoGatewayError` con `code` y `step` para que la ruta distinga qué
falló y dónde.

| Elemento | Valor |
|---|---|
| Timeout por llamada | `EPAYCO_HTTP_TIMEOUT_MS`, **por defecto 15 000 ms** |
| Llamadas cubiertas | `POST /login` (`step: "login"`) y `POST /payment/session/create` (`step: "session_create"`) |
| Timeout | `504` + `code: EPAYCO_TIMEOUT` |
| Caída de red | `502` + `code: EPAYCO_UNAVAILABLE` |
| Error HTTP del proveedor | `502` + `code: EPAYCO_HTTP_ERROR` |
| Respuesta sin `sessionId`/token | `502` + `code: EPAYCO_INVALID_RESPONSE` |

**Limpieza añadida:** si la pasarela falla después de crear la fila, la
`checkout_session` pendiente se marca `failed` con `completed_at`, en vez de
quedar huérfana bloqueando su clave de idempotencia.

Pruebas (7): 504 en timeout de `/login`; la sesión queda `failed`; el corte
ocurre dentro del plazo configurado (< 3 s con `EPAYCO_HTTP_TIMEOUT_MS=40`);
502 en caída de red; 502 con `step` en error HTTP; 502 en respuesta sin
`sessionId`; y el camino feliz sigue llamando a los dos endpoints.

El doble de `fetch` en modo `timeout` **no resuelve nunca**: sólo rechaza cuando
se dispara el `AbortSignal`. Si el envoltorio dejara de poner la señal, la
prueba se colgaría — es decir, verifica el timeout de verdad, no su presencia
textual.

### 18.2 H-02 · Rate limiting — CERRADO

**Política:** la misma que `/api/billing/checkout`, sin inventar un límite
nuevo — `BILLING_CHECKOUT_RATE_LIMIT` = **10 intentos / 60 s**, con clave
`billing-checkout:<userId>` (`src/lib/billing/rate-limit.ts:8-16`). Respuesta al
superarlo: `429`, `code: RATE_LIMITED`, cabecera `Retry-After`.

Pruebas (3): 12 peticiones producen al menos un `429` con `Retry-After`; el
rechazo ocurre **antes** de contactar a ePayco (el contador de llamadas no
avanza); y los hits se registran con la clave compartida de billing checkout.

### 18.3 H-03 · Idempotencia real — CERRADO

**Antes:** `idempotency_key: randomUUID()` generado en el servidor — no
deduplicaba nada. **Ahora:** la clave la envía el cliente y se respeta.

| Situación | Respuesta |
|---|---|
| Sin `Idempotency-Key` o > 200 caracteres | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Misma clave, misma compra, sesión viva | `200` con **la misma** `checkoutSessionId` y `reused: true` |
| Misma clave, otro plan/precio/ambiente | `409 IDEMPOTENCY_CONFLICT` |
| Misma clave, sesión ya aprobada o expirada | `409 IDEMPOTENCY_KEY_CONSUMED` |
| Dos peticiones concurrentes con la misma clave | Ambas `200`, **una sola fila** |

La carrera se resuelve con el índice único
`idx_checkout_sessions_org_idempotency (organization_id, idempotency_key)` —
**ya existente** en la migración 010, no hizo falta migración nueva. La petición
que pierde recibe `23505`, relee la fila ganadora y la adopta.

Pruebas (9), incluidas **dos concurrentes**: 2 peticiones simultáneas ⇒ 1 sesión
y el mismo id; 5 simultáneas ⇒ 1 sesión.

**Cliente actualizado.** `src/components/billing/EpaycoCheckout.tsx` envía
`Idempotency-Key: crypto.randomUUID()` por intento y ahora **muestra el mensaje
del servidor** en lugar del genérico «Error al crear checkout»: sin eso, el
usuario veía el mismo texto ante un timeout, una pasarela caída y un conflicto.

### 18.4 Decisión documentada — reutilización de sesión

Cuando llega una repetición válida de la clave, se reutiliza la **fila** de
`checkout_sessions` pero se solicita una **sesión nueva a ePayco**, porque la
tabla no tiene columna donde guardar el `sessionId` del proveedor. Alternativa
más limpia, no implementada por requerir migración: añadir
`provider_session_id` y devolver exactamente la misma sesión sin segunda
llamada. Queda como P-11.

---

## 19. Outbox — determinación sobre los tipos sin handler

**Determinación: se RETIRAN del tipo TypeScript. No se implementan.**

Motivo: de los seis valores del CHECK de la migración 010, **sólo
`send_notification` tiene handler**. Para los demás no existe productor, ni
contrato de payload, ni clave de idempotencia, ni prueba — los cuatro
requisitos que el encargo fija para considerarlos funcionales.

**Hallazgo adicional:** los tipos sin handler no son cuatro, son **cinco**.
`process_webhook` tampoco lo tiene y no figuraba en el encargo. Verificado con
prueba.

### 19.1 Cambio aplicado

```ts
// antes: seis valores, cinco de ellos ficticios
export type BillingOutboxJobType = "send_notification";

export const UNIMPLEMENTED_OUTBOX_JOB_TYPES = [
  "process_webhook", "renew_subscription", "reconcile_payment",
  "expire_subscription", "apply_plan_change",
] as const;
```

`BillingOutboxJob.job_type` pasa a `string`, porque el valor **llega de la
base**, cuyo CHECK sigue admitiendo los seis: el tipo debe describir lo que
puede aparecer, no lo que nos gustaría.

**Efecto:** ningún código de la aplicación puede encolar un tipo sin handler; si
uno llega por SQL, `processJob` lo rechaza y termina en `dead_letter` sin
bloquear el lote (probado).

### 19.2 Lo que NO se hizo y por qué

Estrechar el CHECK de la base exige una migración. **No se escribió**: retirar
valores de un CHECK es irreversible para las filas históricas y necesita
confirmar antes que no existan jobs de esos tipos en producción. Es P-12.

Pruebas: `outbox-contract.test.ts` (**16 casos**) — la lista de cinco coincide
con el CHECK; `process_webhook` falla igual; cada tipo va a reintento con
`handler_failed`; agotados los intentos, `dead_letter`; un lote mixto completa
el `send_notification` y reintenta el otro.

---

## 20. Propuesta técnica — recuperación de `billing_webhook_events` en `failed`

**No se implementó**: falta contrato de negocio para clasificar qué fallos son
reprocesables. Se entrega la propuesta y sus casos de prueba.

### 20.1 Por qué hace falta

La §12.1 demostró que dos confirmaciones concurrentes dejan un evento
`failed` con `last_error='atomic_activation_failed'`. Hoy su recuperación
depende de que ePayco reintente. Verificado por prueba: **no existe ningún
worker que recorra los eventos en `failed`**, pese a que la migración 010 creó
el índice `idx_billing_webhooks_pending (status, next_attempt_at)`, que sugiere
que estaba previsto.

### 20.2 Materia prima disponible

La fila guarda `payload` **saneado** (lista blanca de 17 campos),
`signature_valid`, `attempt_count`, `next_attempt_at` y `last_error`. Es
suficiente para reprocesar **salvo por un detalle**: `x_signature` **no se
almacena**, así que un reproceso no puede volver a validar la firma. Debe
confiarse en el `signature_valid=true` registrado en la ingesta. Esa es una
decisión de seguridad que requiere aprobación explícita.

### 20.3 Tabla de clasificación — **requiere confirmación de negocio**

Los siete motivos son los que la ruta puede registrar hoy (enumeración
verificada por prueba; si aparece uno nuevo, el test falla).

| `last_error` | Naturaleza | ¿Reprocesar? | Justificación |
|---|---|---|---|
| `atomic_activation_failed` | Infraestructura | **Sí** | El RPC es idempotente; falló por contención o error transitorio |
| `payment_insert_failed` | Infraestructura | **Sí** | Reintento seguro: el pago se busca antes de insertar |
| `checkout_session_not_found` | Posible orden de llegada | **Sí, con tope** | El webhook pudo adelantarse al commit de la sesión |
| `reference_mismatch` | Conflicto de datos | **No** | Reintentar no cambia el resultado |
| `amount_or_currency_mismatch` | Conflicto de datos | **No — escalar** | Discrepancia de importe: posible fraude o error de precio |
| `environment_mismatch` | Configuración | **No — escalar** | Confirmación de producción sobre checkout sandbox o al revés |
| `existing_payment_mismatch` | Conflicto de datos | **No — escalar** | La transacción ya existe con otra organización o importe |

Las tres filas marcadas «escalar» son las que necesitan decisión: a quién se
notifica, en qué plazo y si la cuenta se bloquea entretanto.

### 20.4 Diseño propuesto

- **Dónde:** `GET /api/cron/billing-webhook-recovery`, protegido con
  `CRON_SECRET` igual que los demás crons; cadencia sugerida `*/10 * * * *`.
- **Reclamo:** RPC con lease, reutilizando el patrón ya probado de
  `claim_billing_outbox_jobs` (migración 032) para evitar dos workers sobre la
  misma fila.
- **Selección:** `status='failed'` **y** `last_error` en la lista reprocesable
  **y** `attempt_count < 5` **y** `next_attempt_at <= NOW()`.
- **Backoff:** reutilizar `outboxRetryDelaySeconds` (30 s → 1 h), ya probado.
- **Agotamiento:** pasar a `dead_letter` (estado ya admitido por el CHECK) y
  emitir alerta.
- **Reproceso:** extraer de la ruta de confirmación la lógica posterior a la
  validación de firma para que worker y webhook compartan el mismo camino, en
  vez de duplicarlo.

### 20.5 Casos de prueba a escribir

1. Un evento `atomic_activation_failed` se reprocesa y queda `processed`, con la
   suscripción activa y **un solo** `subscription_event`.
2. Un evento `amount_or_currency_mismatch` **no** se selecciona jamás.
3. Reprocesar un evento cuyo checkout ya está `approved` no crea un segundo pago
   ni una segunda activación.
4. Tras 5 intentos fallidos el evento pasa a `dead_letter` y no vuelve a
   seleccionarse.
5. Dos workers concurrentes sobre el mismo evento: sólo uno lo procesa.
6. El backoff respeta `next_attempt_at`.
7. Sin `CRON_SECRET` válido, `401`.
8. Un evento con `signature_valid=false` no se reprocesa nunca.

---

## 21. Archivos de la iteración 3

**Nuevos**

```
web/src/qa-e2e/epayco-checkout-route.test.ts     # 23 casos: H-01, H-02, H-03
```

**Modificados — código de aplicación**

```
web/src/lib/epayco/client.ts                     # epaycoFetch + EpaycoGatewayError (H-01)
web/src/app/api/epayco/checkout/route.ts         # rate limiting + idempotencia + 504/502
web/src/components/billing/EpaycoCheckout.tsx    # Idempotency-Key + mensaje real de error
web/src/lib/billing/outbox.ts                    # tipos sin handler retirados (§19)
```

**Modificados — pruebas y documentación**

```
web/src/qa-e2e/security-posture.test.ts          # H-01/02/03 cerrados + guardas del runner + motivos de webhook
web/src/qa-e2e/resilience.test.ts                # H-01 fuera del trinquete
web/src/lib/billing/outbox-contract.test.ts      # usa UNIMPLEMENTED_OUTBOX_JOB_TYPES
web/src/qa-e2e/helpers/fake-supabase.ts          # soporte de `.is()`
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md           # este documento
```

**No se tocó:** ninguna migración, ningún secreto, ninguna variable de entorno.

---

## 22. Hallazgos abiertos tras la iteración 3

| Id | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| H-01 | Timeout en la ruta de cobro de ePayco | P1 | **CERRADO** (§18.1) |
| H-02 | Rate limiting en `/api/epayco/checkout` | P1 | **CERRADO** (§18.2) |
| H-03 | Idempotencia en `/api/epayco/checkout` | P1 | **CERRADO** (§18.3) |
| H-04 | `getEpaycoConfig()` expone `privateKey`/`pKey`; sin consumidores | P2 | Abierto |
| H-05 | Los logs de billing no incluyen `correlation_id` | P2 | Abierto |
| H-06 | Backup documentado, sin ensayo de restauración registrado | P1 | Abierto |
| H-07 | Migraciones 031 y 032 sin rollback escrito | P1 | Abierto |
| H-08 | PCI | — | Sin hallazgos (§15) |
| H-09 | Rate limiting fail-open y auto-amplificante bajo carga | P2 | Abierto |
| H-10 | Sin worker de recuperación de webhooks `failed` | P1 | Abierto — propuesta en §20 |
| H-11 | La cola de canales no deduplica en la entrada | P2 | Abierto (§14) |

---

## 23. Decisiones que requieren negocio

| # | Decisión | Por qué no la tomo yo | Bloquea |
|---|---|---|---|
| D-1 | **Reprocesar un webhook confiando en el `signature_valid` de la ingesta**, dado que `x_signature` no se almacena | Es una decisión de seguridad, no técnica | §20 completo |
| D-2 | **Qué hacer con los tres motivos «escalar»** (`amount_or_currency_mismatch`, `environment_mismatch`, `existing_payment_mismatch`): a quién se notifica, en qué plazo, si se bloquea la cuenta | Es política antifraude y de soporte | §20.3 |
| D-3 | **Retirar los cinco tipos del CHECK de la base**, o implementarlos | Requiere saber si el roadmap los contempla; retirarlos de un CHECK es irreversible | P-12 |
| D-4 | **Reutilizar la fila cancelada al reactivar** — ya es el comportamiento en producción tras la 033; falta escribirlo como regla de producto | Es política comercial | §4.3 |
| D-5 | **Política de prorrateo en el cambio de plan**: hoy un upgrade a mitad de período no acredita lo pagado, y un downgrade deja a la cuenta por encima del límite nuevo | Es política de precios | §1.1 de la auditoría |
| D-6 | **Aviso al cliente al entrar en gracia y al suspender**: canal, plantilla y momento | Es comunicación con el cliente | §3.5 de la auditoría |

---

## 24. Instrucciones exactas para que Codex revise y publique

### 24.1 Verificación — comandos y salida esperada

```bash
cd web
npx vitest run                    # 437 passed / 29 files
npm test                          # node: 6 passed, 13 skipped
npm run lint                      # 0 errores, 168 warnings
npx tsc --noEmit | grep '^src/'   # sin salida
npm run build                     # Compiled successfully
git diff --check                  # sin salida
git checkout -- src/lib/skills/data.generated.ts   # el prebuild sólo le cambia la fecha
```

### 24.2 Revisión dirigida — dónde mirar primero

1. **`src/app/api/epayco/checkout/route.ts`** — es el cambio con más superficie.
   Verificar el orden: autenticación → rate limit → rol → validaciones →
   idempotencia → inserción → ePayco. Y que el `catch` de `EpaycoGatewayError`
   sólo marque `failed` la sesión **que esta petición creó**
   (`createdSessionId`), nunca una reutilizada.
2. **`src/lib/epayco/client.ts`** — que ningún `fetch` esquive `epaycoFetch`.
   Hay un test que lo comprueba, pero conviene mirarlo.
3. **`src/components/billing/EpaycoCheckout.tsx`** — el `alert` ahora muestra
   texto del servidor; confirmar que ninguno de esos mensajes filtra
   información interna.
4. **`src/lib/billing/outbox.ts`** — el cambio de tipo (§19) es intencional.

### 24.3 Antes de publicar

1. **Ejecutar la suite PostgreSQL** (§11.2) contra una base desechable y pegar
   la salida en este documento. Sin eso, las 13 siguen siendo *preparadas*.
2. **Probar el checkout en sandbox** tras los cambios de §18: el camino feliz
   está cubierto por pruebas con dobles, pero **no se ha ejecutado contra ePayco
   real desde el cambio**. No repetir la compra 380694488; usar otra cuenta QA.
3. **Resolver D-1 y D-2** si se quiere avanzar con §20.

### 24.4 Publicación

```
git add -A
git commit -m "fix(payments): add ePayco timeout, rate limiting and real idempotency"
```

**No publicar en Production** hasta que (1) y (2) de §24.3 tengan evidencia. Los
cambios de §18 tocan la ruta de cobro: un despliegue sin prueba sandbox real
arriesga dejar el checkout inoperante.

---
---

# Iteración 4 — 2026-08-10 · Decisiones de negocio aplicadas

## 25. Resumen de las seis decisiones

| Id | Decisión | Estado | Evidencia |
|---|---|---|---|
| **D-1** | Reprocesar sólo con `signature_valid=true`; nunca firma inválida; registrar toda recuperación | **Implementada** | 29 pruebas en `webhook-recovery.test.ts` |
| **D-2** | Los tres conflictos notifican al admin y crean alerta; **sin bloquear la cuenta** | **Implementada** | ídem |
| **D-3** | No implementar los tipos de outbox; sin migración irreversible; no generar jobs nuevos | **Aplicada** | 3 pruebas en `security-posture.test.ts` |
| **D-4** | Reactivar desde `cancelled` reutiliza la misma fila | **Ya en producción** (migración 033) | §4.1 · ePayco 380694488 |
| **D-5** | Upgrade sin acreditar; downgrade al final del período | **Parcial** — ver §29 | Upgrade ya cumple; downgrade **NO implementado** |
| **D-6** | Aviso al admin al entrar en gracia y al suspender, una vez por transición | **Implementada** | 6 pruebas en `subscription-transitions.test.ts` |

---

## 26. D-1 y D-2 · Worker de recuperación de webhooks

### 26.1 Refactor previo necesario

Para no tener dos implementaciones de la liquidación, se extrajo el camino
posterior a la validación de firma desde la ruta a
**`src/lib/billing/epayco-activation.ts`** (`settleEpaycoConfirmation`). La ruta
y el worker recorren ahora el mismo código.

**El refactor no cambió el comportamiento del webhook**: los 61 casos de
`payment-contracts.test.ts` + `epayco.test.ts` pasaron **sin modificar ninguna
prueba**. Esa es la evidencia de que la ruta de cobro sigue igual.

### 26.2 D-1 — firma y auditoría

| Regla | Implementación |
|---|---|
| Sólo `signature_valid=true` | Filtro `.eq("signature_valid", true)` **en la consulta**, más una segunda comprobación dentro del bucle (defensa en profundidad) |
| Nunca reprocesar firma inválida | Un evento con firma inválida no se selecciona, no se reclama, no se audita y no se notifica: no se toca en absoluto. Probado |
| Registrar la recuperación | Cada resultado **intenta** escribir en `smarttalk.billing_audit_events` con `actor_type='system'`, `action`, `result` y `correlation_id` |

Esto además **estrena `billing_audit_events`**, que llevaba desde la migración
010 sin ningún productor (era el hallazgo H-03 de la auditoría original).

Acciones auditadas: `webhook_recovery_processed` (success),
`webhook_recovery_retry` (failed), `webhook_recovery_review_required` (denied),
`webhook_recovery_permanent_failure`, `webhook_recovery_exhausted`,
`webhook_recovery_payload_incomplete`.

#### Qué ocurre si falla `billing_audit_events`

**No puede afirmarse que toda recuperación quede auditada.** La escritura de
auditoría puede fallar (permisos, indisponibilidad) y la política elegida es:

| Aspecto | Decisión |
|---|---|
| ¿Aborta la recuperación? | **No.** El efecto sobre el cobro ya ocurrió cuando se audita; revertirlo dejaría un estado peor que el fallo de bitácora |
| ¿Se pierde en silencio? | **No.** Se emite `console.error` con la etiqueta `AUDITORÍA PERDIDA`, el `eventId` y la `action` |
| ¿Es observable? | **Sí.** Se cuenta en `auditFailures`, que el cron devuelve en su respuesta HTTP |
| Garantía real | «Todo fallo de auditoría es contado y visible», no «toda recuperación queda auditada» |

Lo mismo aplica a las escrituras de estado: `markEvent` **comprueba el error**,
lo registra y devuelve `false`; el evento entonces **no se cuenta como
recuperado** y suma en `writeFailures`. Antes ignoraba el error, de modo que un
evento podía quedar en `failed` mientras el worker lo reportaba como recuperado.

`auditFailures > 0` o `writeFailures > 0` en la respuesta del cron significa que
hay algo que conciliar a mano.

### 26.2.1 Selección y concurrencia

**Filtros de selección** (los cuatro exigidos):

```
status = 'failed'
AND signature_valid = true
AND attempt_count < 5
AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
```

`next_attempt_at` nulo es elegible de inmediato: un evento que acaba de fallar
en la ruta no trae turno agendado.

**Lease.** Cada evento se reclama con un `UPDATE` condicional sobre
(`locked_at` nulo **OR** lease vencido), fijando `locked_at` y `locked_by` con
un identificador de worker único por ejecución. El `UPDATE` es atómico en
PostgreSQL, así que dos crons simultáneos no pueden procesar el mismo evento: el
perdedor ve cero filas afectadas y suma en `skippedLocked`. `LEASE_SECONDS` es
120, de modo que un worker que muera con el lease puesto no bloquea la fila más
de dos minutos. El lease se libera en **todos** los caminos de salida, incluido
el `catch` de error inesperado.

**Agotamiento.** Como la consulta filtra `attempt_count < 5`, un evento que ya
está en el máximo no volvería a seleccionarse nunca. Por eso el paso a
`dead_letter` ocurre **en la misma pasada** en que el contador alcanza 5, no en
una futura.

### 26.2.2 Requisito de esquema — migración 034

`supabase/migrations/20260810000200_034_webhook_recovery_lease.sql` —
**APLICADA** por el propietario en Supabase (`Success. No rows returned`).

`billing_webhook_events` ya tenía `locked_at` (migración 010) pero **no
`locked_by`**. La migración lo añade junto con un índice parcial para la
consulta del worker. Es puramente aditiva: columna nullable + índice, sin tocar
datos, constraints ni funciones. El rollback está en su cabecera.

**Mientras no esté aplicada, el worker no procesa nada**: detecta el error
`42703`, lanza `WebhookRecoverySchemaError` y el cron responde
`503 SCHEMA_NOT_READY`. Preferible a procesar sin lease. Probado.

### 26.3 D-2 — clasificación aplicada

| `last_error` | Clase | Acción |
|---|---|---|
| `atomic_activation_failed` | recoverable | Reprocesa; reintenta con backoff hasta 5 |
| `payment_insert_failed` | recoverable | ídem |
| `checkout_session_not_found` | recoverable | ídem |
| `amount_or_currency_mismatch` | **review_required** | Alerta al admin + `dead_letter`. **No bloquea** |
| `environment_mismatch` | **review_required** | ídem |
| `existing_payment_mismatch` | **review_required** | ídem |
| `reference_mismatch` | permanent | `dead_letter` sin alerta |
| *motivo desconocido* | unknown | Se trata como revisión humana: **nunca se reprocesa a ciegas** |

Verificado por prueba que **la organización y la suscripción quedan intactas**
tras una alerta, y que el mensaje al administrador dice explícitamente que no se
bloqueó nada.

### 26.4 Piezas nuevas

| Archivo | Rol |
|---|---|
| `src/lib/billing/epayco-activation.ts` | Liquidación compartida por webhook y worker |
| `src/lib/billing/webhook-recovery.ts` | Selección, lease, clasificación, recuperación y auditoría |
| `src/lib/billing/notifications.ts` | Encola avisos al admin como jobs `send_notification` |
| `src/app/api/cron/billing-webhook-recovery/route.ts` | Cron protegido con `CRON_SECRET`; 503 si falta la 034 |
| `supabase/migrations/…034_webhook_recovery_lease.sql` | **APLICADA** — añade `locked_by` |
| `vercel.json` | Entrada del cron, `*/10 * * * *` |

> **⚠ Orden obligatorio de despliegue.** La entrada en `vercel.json` hace que el
> cron arranque en el primer deploy. La migración 034 ya está aplicada, por lo
> que el worker puede operar con lease desde el primer despliegue. Procesa
> únicamente eventos `failed` con firma válida y no bloquea cuentas, pero sigue
> siendo comportamiento nuevo en producción y debe ser vigilado.

---

## 27. D-6 · Avisos de gracia y suspensión

Implementado en `/api/cron/billing-lifecycle`. Al mover una suscripción a
`past_due` o a `suspended`, se encola un aviso al administrador.

**Una sola vez por transición, garantizado por la base**: la clave de
idempotencia es `lifecycle-grace:<subId>:<current_period_end>` y
`lifecycle-suspended:<subId>:<grace_ends_at>`, y
`billing_outbox_jobs.idempotency_key` es UNIQUE. Reejecutar el cron sobre el
mismo período no reenvía; un ciclo posterior con otra fecha sí (ambos probados).

La respuesta del cron ahora incluye `graceNotifications` y
`suspensionNotifications` para poder auditarlo desde los logs de Vercel.

Casos cubiertos: aviso en gracia; aviso en suspensión; segunda corrida sin
duplicado; **no** se avisa al cancelar por baja programada (D-6 sólo cubre
gracia y suspensión); sin administrador con correo el cron no falla y no encola;
un ciclo nuevo sí genera aviso nuevo.

**Limitación honesta:** el envío real depende de `RESEND_API_KEY` y del cron
`billing-outbox`. Lo probado es **el encolado correcto y único**, no la entrega
del correo.

---

## 28. D-3 · Tipos de outbox

Aplicado tal cual: **no se implementan, no se crea migración del CHECK, y
ningún código puede generar jobs de esos tipos.**

Verificado por tres pruebas: ninguna fuente inserta `job_type` de los cinco sin
handler; **el único `job_type` que la aplicación encola es `send_notification`**;
y ninguna migración nueva redefine el CHECK de `job_type` (sólo la 010 original).

### Consulta para decidir si se pueden retirar del CHECK

Antes de cualquier migración hay que confirmar que no existen filas reales.
Consulta de **solo lectura**, para ejecutar cuando haya acceso:

```sql
SELECT job_type, status, COUNT(*) AS filas, MIN(created_at) AS primera, MAX(created_at) AS ultima
  FROM smarttalk.billing_outbox_jobs
 WHERE job_type <> 'send_notification'
 GROUP BY job_type, status
 ORDER BY job_type, status;
```

Si devuelve cero filas, retirar los cinco valores del CHECK es seguro. Si
devuelve filas, hay que decidir qué hacer con ellas antes de tocar nada.

---

## 29. D-5 · Upgrade y downgrade — estado real

Aquí hay que ser preciso, porque la decisión tiene dos mitades con estados
distintos.

### 29.1 Upgrade — ya cumple, sin cambios

«El upgrade no acredita períodos anteriores.» El RPC no devuelve dinero ni
prorratea: cuando la suscripción está `active` con período vigente, el período
nuevo **arranca donde terminaba el anterior**, de modo que el cliente no pierde
los días pagados pero tampoco recibe crédito monetario. Es exactamente D-5.

Cubierto por el test 10 de §11.4 — **preparado, no ejecutado**.

### 29.2 Downgrade — NO implementado

«El downgrade se aplica al final del período vigente y conserva el acceso actual
hasta esa fecha.» **Hoy no ocurre**: al aprobarse el pago, el RPC cambia
`plan_id` de inmediato, así que un downgrade recorta los límites al instante.

**No lo implementé, y quiero ser explícito sobre por qué.** Requiere modificar
`finalize_epayco_approved_payment` para que, cuando el plan destino sea más
barato, escriba `pending_plan_id` / `pending_plan_price_id` /
`change_effective_at` en vez de aplicar el cambio — las tres columnas **ya
existen** desde la migración 010. Es decir: es una migración sobre la función
`SECURITY DEFINER` que mueve dinero, **sin posibilidad de probarla aquí** (no
hay PostgreSQL). La migración 033 se aplicó a producción a las pocas horas de
entregarla; repetir ese patrón con una función de cobro más compleja y sin
prueba sería imprudente.

**Diseño propuesto, para cuando haya base de pruebas:**

1. En el RPC, comparar `plan_prices.amount_minor` destino vs. actual.
2. Si es menor y la suscripción está `active` con período vigente: guardar el
   plan destino en `pending_plan_id`/`pending_plan_price_id`, fijar
   `change_effective_at = current_period_end`, **no** tocar `plan_id`.
3. En `/api/cron/billing-lifecycle`, al llegar a `change_effective_at`: aplicar
   el plan pendiente, limpiar las tres columnas y registrar
   `subscription_events` con `reason='plan_change_applied'`.
4. En la UI, avisar en el botón que el cambio se aplicará al final del período.

**Casos de prueba a escribir:** downgrade programa y no recorta; el acceso se
conserva hasta la fecha; el cron aplica el cambio; un upgrade posterior al
downgrade programado lo cancela; dos downgrades seguidos dejan sólo el último;
el cron es idempotente.

---

## 30. Archivos de la iteración 4

**Nuevos**

```
web/src/lib/billing/epayco-activation.ts              # liquidación compartida
web/src/lib/billing/webhook-recovery.ts               # D-1 + D-2
web/src/lib/billing/notifications.ts                  # avisos al admin
web/src/app/api/cron/billing-webhook-recovery/route.ts
web/src/qa-e2e/webhook-recovery.test.ts               # 29 casos
```

**Modificados**

```
web/src/app/api/epayco/confirmation/route.ts   # usa settleEpaycoConfirmation
web/src/app/api/cron/billing-lifecycle/route.ts # D-6
web/vercel.json                                 # cron */10 (⚠ activo al desplegar)
web/src/qa-e2e/subscription-transitions.test.ts # +6 casos D-6
web/src/qa-e2e/security-posture.test.ts         # D-3 + H-10 cerrado
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md
```

**No se tocó:** ninguna migración, ningún secreto, ninguna variable.

---

## 31. Hallazgos abiertos tras la iteración 4

| Id | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| H-01 · H-02 · H-03 | Timeout, rate limiting e idempotencia de ePayco | P1 | **CERRADOS** (§18) |
| H-10 | Sin worker de recuperación de webhooks | P1 | **CERRADO** (§26) |
| H-04 | `getEpaycoConfig()` expone `privateKey`/`pKey`; sin consumidores | P2 | Abierto |
| H-05 | Los logs de billing no incluyen `correlation_id` | P2 | Abierto |
| H-06 | Backup documentado, sin ensayo de restauración registrado | P1 | Abierto |
| H-07 | Migraciones 031 y 032 sin rollback escrito | P1 | Abierto |
| H-09 | Rate limiting fail-open y auto-amplificante bajo carga | P2 | Abierto |
| H-11 | La cola de canales no deduplica en la entrada | P2 | Abierto |
| **H-12** | **Downgrade se aplica de inmediato en vez de al final del período** (D-5) | **P1** | **Abierto** — §29.2 |

### Riesgos de esta entrega

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | **El refactor toca la ruta de cobro.** `settleEpaycoConfirmation` movió lógica del webhook | Alta | 61 pruebas preexistentes pasaron sin modificarse. Aun así, exige prueba sandbox real antes de Production |
| 2 | **El cron nuevo arranca solo al desplegar** | Media | Protegido con `CRON_SECRET`; sólo toca eventos `failed` con firma válida; no bloquea cuentas |
| 3 | El envío real del correo no está probado | Media | Depende de `RESEND_API_KEY` y del cron de outbox; probado el encolado único |
| 4 | **PostgreSQL/RLS sigue sin ejecutar** | Alta | 13 pruebas preparadas, 0 ejecutadas. No marcar como aprobado |
| 5 | D-5 a medias: el downgrade sigue recortando de inmediato | Media | Documentado como H-12 con diseño y casos de prueba |
| 6 | `billing_audit_events` estrena productor | Baja | Si la inserción falla, se registra en log y la recuperación continúa: la auditoría no bloquea el cobro |

---

## 32. Instrucciones para que Codex revise y publique

### 32.1 Verificación

```bash
cd web
npx vitest run                    # 500 passed / 30 files
npm test                          # node: 6 passed, 13 skipped
npm run lint                      # 0 errores, 168 warnings
npx tsc --noEmit | grep '^src/'   # sin salida
npm run build                     # Compiled successfully
git diff --check                  # sin salida
git checkout -- src/lib/skills/data.generated.ts
```

### 32.2 Revisión dirigida

1. **`src/lib/billing/epayco-activation.ts`** frente al `git diff` de
   `confirmation/route.ts`: confirmar que la extracción es fiel y que no se
   perdió ninguna validación. Es el cambio de mayor riesgo.
2. **`vercel.json`**: decidir conscientemente si el cron nuevo entra en este
   despliegue o se pospone comentando la entrada.
3. **`src/lib/billing/webhook-recovery.ts`**: verificar el filtro
   `signature_valid` y que ninguna rama desactiva la organización.
4. **`src/lib/billing/notifications.ts`**: el texto de los correos va al
   cliente; revisar redacción.

### 32.3 Antes de Production

1. Ejecutar la suite PostgreSQL (§11.2) contra una base desechable.
2. **Compra sandbox real** con una cuenta QA distinta de la de la referencia
   380694488, para validar el refactor de §26.1 y los cambios de §18 contra
   ePayco de verdad.
3. Ejecutar la consulta de §28 y decidir sobre el CHECK de `job_type`.
4. Decidir si H-12 (downgrade) entra antes o después de la salida comercial.

### 32.4 Publicación

```
git add -A
git commit -m "feat(billing): webhook recovery, lifecycle notifications and business decisions D1-D6"
```

Codex es quien hace commit, push y despliegue. Este agente no ejecutó ninguno.

---
---

# Iteración 5 — 2026-08-10 · Correcciones al worker de recuperación

Los ocho puntos de la revisión, con su evidencia.

## 33. Correcciones aplicadas

### 33.1 Filtros de selección — corregido

Antes la consulta sólo filtraba `status='failed'` y `signature_valid=true`: un
evento agendado para dentro de una hora se reprocesaba igual, y un evento
agotado se seleccionaba una y otra vez.

Ahora los cuatro filtros exigidos, en la propia consulta:

```
status = 'failed' AND signature_valid = true
AND attempt_count < 5
AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
```

Detalle no trivial: como `attempt_count < 5` excluye los agotados, el paso a
`dead_letter` se hace **en la misma pasada** en que el contador llega a 5. Si no,
esos eventos quedarían en `failed` para siempre sin que nadie los cerrara.

**Pruebas:** turno futuro no se selecciona ni se reclama; turno vencido sí;
`next_attempt_at` nulo es elegible; `attempt_count >= 5` no se selecciona; el
reintento que alcanza el máximo pasa a `dead_letter` y alerta; el reintento por
debajo del máximo agenda el siguiente turno con backoff.

### 33.2 Claim/lease — implementado

`UPDATE` condicional atómico sobre (`locked_at` nulo **OR** lease vencido) que
fija `locked_at` y `locked_by = vercel-webhook-recovery-<uuid>`. Quien ve cero
filas afectadas no procesa. `LEASE_SECONDS = 120`. El lease se libera en todos
los caminos de salida, incluido el `catch` de error inesperado.

**Requiere la migración 034** (`locked_by` no existía). Ver §26.2.2.

**Pruebas:** dos workers concurrentes reales (`Promise.all`) — `claimed` suma 1,
`skippedLocked` suma 1, y el RPC de activación se invoca **una sola vez**; lease
vigente de otro worker se salta; **lease vencido se reclama** (un worker muerto
no bloquea la fila); el lease se libera tras revisión y tras reintento fallido.

### 33.3 `markEvent` comprueba y reporta — corregido

Antes ignoraba el error de escritura, así que un evento podía quedar en `failed`
mientras el worker lo contaba como recuperado. Ahora comprueba, registra con
`console.error` y devuelve `false`; el llamador no cuenta el evento y suma en
`writeFailures`.

**Pruebas:** si el claim no se puede escribir, no se procesa ni se llama al RPC;
si la escritura de cierre falla tras liquidar, `recovered` es 0, `writeFailures`
es 1 y el evento **sigue en `failed`**; lo mismo al cerrar un evento de revisión.

### 33.4 Fallo de auditoría — definido

Documentado en §26.2. Resumen: **no aborta**, se registra como `AUDITORÍA
PERDIDA`, se cuenta en `auditFailures` y viaja en la respuesta del cron. La
afirmación «toda recuperación auditada» **se retiró del documento**; la garantía
real es «todo fallo de auditoría es contado y visible».

**Pruebas:** con la auditoría fallando, la recuperación no se revierte
(`recovered=1`, evento `processed`), `auditFailures=1` y la tabla queda vacía;
el cron devuelve `auditFailures` y `writeFailures` en su JSON.

### 33.5 Las cinco pruebas pedidas

| Pedida | Dónde | Estado |
|---|---|---|
| Evento fuera de `next_attempt_at` | «un evento con next_attempt_at en el futuro NO se selecciona» | ✅ |
| Dos workers concurrentes | «dos workers concurrentes: sólo uno procesa el evento» | ✅ |
| Lease vencido | «un lease vencido se puede reclamar…» | ✅ |
| Error al marcar el evento | «si markEvent falla tras liquidar…» + 2 más | ✅ |
| Reintento sin duplicar pago ni suscripción | «dos pasadas…» y «un reintento tras un fallo transitorio del RPC no duplica el pago» | ✅ |

`webhook-recovery.test.ts` pasó de 29 a **48 casos**.

### 33.6 PostgreSQL/RLS — sigue pendiente

> **13 pruebas preparadas, 0 ejecutadas por falta de base QA desechable.**
> No está aprobado. Sin `QA_DATABASE_URL` la suite se salta entera.

### 33.7 Downgrade — no implementado

Confirmado: no se tocó. Sigue como **H-12** en §31, con el diseño y los seis
casos de prueba en §29.2, a la espera de base PostgreSQL de prueba.

### 33.8 Sin commit, push, deploy ni secretos del agente

`git log` sin cambios del agente; `git status` sólo muestra el árbol de trabajo.
La migración 034 fue aplicada por el propietario en Supabase y respondió
`Success. No rows returned`; el agente no ejecutó `db push`.

## 34. Archivos de la iteración 5

**Nuevos**

```
web/supabase/migrations/20260810000200_034_webhook_recovery_lease.sql   # APLICADA
```

**Modificados**

```
web/src/lib/billing/webhook-recovery.ts                  # filtros, lease, errores
web/src/app/api/cron/billing-webhook-recovery/route.ts   # 503 SCHEMA_NOT_READY
web/src/qa-e2e/webhook-recovery.test.ts                  # 29 -> 48 casos
web/src/qa-e2e/security-posture.test.ts                  # 30 -> 34 casos
web/src/qa-e2e/helpers/fake-supabase.ts                  # .or() e inyección de errores
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md
```

El helper de pruebas ganó dos capacidades porque sin ellas los casos pedidos no
se podían escribir: `.or()` (la sintaxis que usa el claim) e inyección de
errores por tabla/operación con `skip`/`times`, para provocar fallos de
escritura reales en vez de simularlos.

## 35. Estado para publicar

| Requisito | Estado |
|---|---|
| Filtros completos | ✅ §33.1 |
| Lease `locked_at`/`locked_by` | ✅ §33.2 — migración 034 aplicada |
| `markEvent` reporta errores | ✅ §33.3 |
| Política de auditoría definida | ✅ §33.4 |
| Las cinco pruebas | ✅ §33.5 |
| PostgreSQL/RLS pendiente | ✅ declarado, no aprobado |
| Downgrade sin implementar | ✅ H-12 |
| Sin commit/push/deploy | ✅ |

**Orden de publicación:**

1. Revisar el diff de `webhook-recovery.ts` completo (se reescribió).
2. Desplegar y vigilar en la primera ejecución que `writeFailures` y
   `auditFailures` sean 0.
3. Sigue pendiente la compra sandbox real (§32.3) y la suite PostgreSQL (§11.2).

---
---

# Iteración 6 — 2026-08-10 · Verificación con evidencia

## 36. Hecho nuevo: esta rama despliega a **producción**

Al buscar los logs del cron se descubrió algo que cambia el marco de todo lo
anterior: **`codex/add-manual-contact` no genera Previews, genera deployments
`target: "production"`**.

| Dato | Valor |
|---|---|
| Proyecto Vercel | `comunityagent` (`prj_QdUq7MfIz0XsbTGncUkrDJNOLafW`) |
| Deployment activo | `dpl_2QWqq1A4umTEgrzFFvT9gwFuugBJ` |
| Commit | `c2c69f8` — *fix(billing): order webhook recovery by received time* |
| Rama | `codex/add-manual-contact` |
| Target | **production** |
| Estado | READY |
| Creado | 2026-08-10T21:08:17Z |

Consecuencia: **todo el trabajo de las iteraciones 1-5 ya está en producción**,
incluido el cron nuevo. Las advertencias previas del tipo «al desplegar, el cron
arrancará» describen algo que **ya ocurrió**. La migración 034 también está
aplicada, así que el requisito de esquema está cubierto.

## 37. Logs del cron `billing-webhook-recovery`

### 37.1 Lo que muestran los logs

Consulta de solo lectura sobre el deployment activo, ventana de 30 minutos:

| Hora (UTC) | Ruta | Código |
|---|---|---|
| 20:51:13 | `/api/cron/billing-webhook-recovery` | **401** |
| 20:52:49 | `/api/cron/billing-outbox` | 200 |
| 20:54:49 | `/api/cron/billing-outbox` | 200 |
| 20:55:13 | `/api/cron/reap-scheduled` | 200 |
| 20:55:20 | `/api/cron/release-contact-overage` | 200 |
| 20:56:49 | `/api/cron/billing-outbox` | 200 |

Agrupado por código en ese deployment: **9 respuestas 200 y 1 respuesta 401**.
La única 401 es la del cron nuevo.

### 37.2 Diagnóstico

`CRON_SECRET` **está bien configurado**: `/api/cron/billing-outbox` usa
exactamente la misma función `isAuthorized` y devuelve 200 tres veces en la
misma ventana. Descartado un problema de secreto.

Lo que ocurrió es distinto:

- El deployment terminó a las **20:50:00**; el 401 es de las **20:51:13**, un
  minuto después, con `cache=MISS` (los crons reales aparecen con
  `cache=BYPASS`).
- La expresión del cron es `*/10 * * * *`, que dispara a `:00, :10, :20…`. Las
  20:51 **no es un tick programado**.

Es decir: fue una petición sin cabecera `Authorization` inmediatamente posterior
al despliegue, y el guard la rechazó. **El 401 es la prueba de que la protección
funciona, no un fallo de configuración.**

### 37.2.1 Primera ejecución programada — **falló con 500**

Se esperó al tick de las 21:00. Disparó a las **21:01:03** y el resultado fue un
error, no un éxito:

```
### 21:01:03 GET /api/cron/billing-webhook-recovery 500 [error/serverless]
[billing] webhook recovery failed
Error: billing webhook recovery scan failed:
       column billing_webhook_events.created_at does not exist
```

**Bug real en producción, encontrado por esta verificación.** La consulta del
worker ordenaba por `created_at`, pero `smarttalk.billing_webhook_events` **no
tiene esa columna**: su columna de llegada es `received_at` (migración 009). La
consulta fallaba entera, así que el worker no procesaba absolutamente nada y el
cron devolvía 500 cada 10 minutos.

**Por qué las 501 pruebas no lo detectaron.** El Supabase en memoria
implementaba `order()` como **no-op**: ignoraba el nombre de la columna. Una
consulta con una columna inexistente pasaba las pruebas y fallaba contra
PostgreSQL. Es exactamente la clase de fallo que §8 advertía que el fake no
puede ver.

**Corrección aplicada (tres partes):**

1. `webhook-recovery.ts` ordena por `received_at`.
2. El fake **ordena de verdad**: `order(column, {ascending})` implementado.
3. Prueba nueva en `security-posture.test.ts` que compara **cada columna** que
   el worker referencia (`select`, `eq`, `lt`, `is`, `order`) contra el esquema
   derivado de las migraciones. Verificado que atrapa el bug: al restaurar
   `created_at`, la prueba falla con
   `columnas inexistentes en billing_webhook_events: created_at`.

**Gravedad:** el fallo es de disponibilidad de la función, no de datos. La
consulta revienta antes de cualquier escritura, así que no se corrompió nada, no
se activó ningún cobro y no se tocó ninguna organización. Pero la recuperación
de webhooks **no ha funcionado ni una sola vez** desde el despliegue.

> **La corrección ya fue publicada por Codex.** El deployment
> `dpl_2QWqq1A4umTEgrzFFvT9gwFuugBJ` quedó `READY` y está asociado a
> `https://www.comunitymanager.io`. La primera ejecución programada posterior
> al despliegue respondió HTTP 200; no volvió a aparecer el error de
> `created_at`.

### 37.3 Lo solicitado, con la respuesta honesta

| Solicitado | Estado real |
|---|---|
| `writeFailures = 0` | **NO CONFIRMADO — sin dato en runtime.** La ejecución posterior al despliegue respondió HTTP 200, pero el log exportado no incluyó esos contadores |
| `auditFailures = 0` | **NO CONFIRMADO — sin dato en runtime.** La ejecución posterior al despliegue respondió HTTP 200, pero el log exportado no incluyó esos contadores |
| No se bloquearon organizaciones | **Confirmado, por dos vías.** (a) El worker no llegó a ejecutar ninguna rama, así que no pudo tocar nada. (b) El código **no contiene ninguna instrucción que desactive una organización**: verificado por la prueba que afirma la ausencia de `is_active: false` en `webhook-recovery.ts`. D-2 se implementó como alerta, nunca como bloqueo |

No se marca ninguno de los dos primeros como aprobado. Sólo podrán confirmarse
tras desplegar la corrección de §37.2.1 y esperar a un tick limpio.

## 38. Suite PostgreSQL/RLS — sigue sin ejecutar

Se intentó ejecutar. Salida literal de los tres intentos:

```
### 1) Sin QA_DATABASE_URL
✖ Falta QA_DATABASE_URL.

### 2) Apuntando a la base real del proyecto
✖ El host 'smartmedia-api.smartgenapp.com' no es local. Para evitar accidentes,
  esta suite sólo acepta: localhost, 127.0.0.1, ::1, 0.0.0.0, host.docker.internal, postgres, db

### 3) Base local desechable
✖ No se pudo conectar a QA_DATABASE_URL: connect ECONNREFUSED 127.0.0.1:54322
```

Entorno verificado de nuevo: `QA_DATABASE_URL` no definida; sin binario servidor
`postgres`; sin `docker`, `podman` ni `supabase`; ningún proceso escuchando en
5432 ni 54322. La única base alcanzable es la **productiva** del proyecto
(`smartmedia-api.smartgenapp.com`), y la guarda del runner la rechaza por no ser
local — que es exactamente su propósito.

> **13 pruebas preparadas, 0 ejecutadas por falta de base QA desechable.**
> PostgreSQL/RLS **NO está aprobado**.

## 39. Resultados reales de esta iteración

| Comando | Resultado |
|---|---|
| `npx vitest run` | **501 passed / 30 files**, 0 fallos |
| `npm test` | vitest 501 + node: **6 passed, 13 skipped** |
| `npm run lint` | **0 errores**, 168 warnings (preexistentes) |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | **Compiled successfully** |
| `git diff --check` | sin salida |
| `node scripts/qa-postgres-suite.mjs` | 3 rechazos correctos (§38) |

La prueba 501 es la nueva de validación de columnas contra el esquema (§37.2.1).

### 39.1 Un test falló y detectó un cambio real

`npm test` falló al primer intento:

```
src/qa-e2e/security-posture.test.ts
  › el worker exige la migración 034 antes de procesar sin lease
  expect(migration).toMatch(/NO APLICADA/)
```

Motivo: la cabecera de la migración 034 pasó a decir *«ESTADO: APLICADA en
Supabase por el propietario»*. La prueba afirmaba el estado antiguo.

Se corrigió la aserción para que compruebe el invariante duradero en vez del
estado puntual: que la cabecera **declare explícitamente** su estado
(`APLICADA` o `NO APLICADA`), que siga siendo aditiva y que conserve el rollback
escrito. Tras el cambio, 500/500 en verde.

Es el trinquete funcionando: el cambio de estado de una migración no pasó
inadvertido.

## 40. Estado consolidado

| Elemento | Estado | Evidencia |
|---|---|---|
| Migración 033 (reactivación) | Aplicada y validada | ePayco 380694488, acceso hasta 10/09/2026 |
| Migración 034 (`locked_by`) | **Aplicada** | Cabecera del archivo, confirmada por el propietario |
| Código iteraciones 1-5 | **En producción** | `dpl_CuWeV8fUNhUasQHf4NubgvpHHD8E` / `c310ee7` |
| Cron webhook-recovery | **Corregido y operativo (HTTP 200 observado)** | `dpl_2QWqq1A4umTEgrzFFvT9gwFuugBJ` / `c2c69f8` |
| `writeFailures` / `auditFailures` | **Sin dato — no confirmados** | §37.3 |
| Suite PostgreSQL/RLS | **13 preparadas, 0 ejecutadas** | §38 |
| Downgrade (D-5) | No implementado | H-12, §29.2 |
| Compra sandbox tras el refactor | **Validada** — Demo Crecimiento, ePayco `380728881`, $149.000 COP, suscripción activa | Evidencia visual del 10/08/2026 |

## 41. Qué hacer a continuación

0. **Desplegar la corrección de `received_at`** (§37.2.1): **COMPLETADO**.
   Deployment `dpl_2QWqq1A4umTEgrzFFvT9gwFuugBJ` en estado `READY` y aliasado a
   producción.
1. **Consultar la respuesta del cron en el siguiente tick**: **COMPLETADO**.
   La ejecución programada posterior al despliegue respondió HTTP 200. Los
   contadores `writeFailures` y `auditFailures` siguen sin estar confirmados
   porque Vercel no incluyó sus valores en el log exportado.
2. **Levantar la base QA desechable** y ejecutar §11.2. Es lo que valida
   RLS, el índice único y el cuerpo del RPC.
3. **Compra sandbox real**: **COMPLETADA para el flujo ePayco/refactor**.
   Referencia `380728881`, Demo Crecimiento por $149.000 COP, estado aprobado,
   suscripción activa e historial actualizado. La compra se hizo en la misma
   organización QA; queda opcional repetirla en otra organización sólo para
   evidenciar aislamiento entre organizaciones.
4. Revisar que el despliegue desde una rama de trabajo a `target: production`
   sea intencional. Es la causa de que cada commit de esta rama llegue a
   clientes reales sin pasar por Preview.

---
---

# Iteración 7 — 2026-08-10 · Cierre del plan

## 42. H-12 / D-5 · Downgrade efectivo al final del período

### 42.1 Qué se implementó

El cambio tiene dos mitades. La primera es SQL y va sin aplicar; la segunda es
código de aplicación y está probada.

**Mitad 1 — migración 035 (NO APLICADA).**
`supabase/migrations/20260810000300_035_scheduled_plan_downgrade.sql`

Modifica `finalize_epayco_approved_payment` para que **sólo** el caso
«downgrade sobre suscripción activa con período vigente» se comporte distinto:

| Aspecto | Antes | Ahora |
|---|---|---|
| `plan_id` | cambiaba al instante | **no se toca**: el cliente conserva su plan |
| `pending_plan_id` / `pending_plan_price_id` | sin usar | guardan el plan destino |
| `change_effective_at` | sin usar | `= current_period_end` |
| `organizations.plan_id` | bajaba al instante | **no baja** hasta que el cron aplique |
| Período | se extendía | se extiende igual: arranca donde terminaba el anterior |
| `reason` del evento | `payment_approved` | `plan_downgrade_scheduled` |

La detección compara `plan_prices.amount_minor` del precio destino contra el del
precio actual de la suscripción. Upgrades, renovaciones, reactivaciones desde
`suspended`/`cancelled` y la reentrada idempotente **se comportan exactamente
igual que antes**. Un upgrade o una renovación posteriores **limpian** un
downgrade pendiente: el último pago manda.

No hay prorrateo ni nota de crédito, en coherencia con «el upgrade no acredita
períodos anteriores».

**Mitad 2 — cron (implementado y probado).**
`/api/cron/billing-lifecycle` materializa los cambios cuando llega
`change_effective_at`: mueve `plan_id`/`plan_price_id`, limpia las tres columnas
pendientes, actualiza `organizations.plan_id` y registra `subscription_events`
con `reason='plan_change_applied'`. La respuesta del cron incorpora
`planChangesApplied`.

**Idempotencia:** guarda optimista `.lte("change_effective_at", now)` sobre el
`UPDATE`. Tras aplicarlo, la columna queda nula, de modo que una segunda corrida
no afecta filas y no duplica el evento. Probado.

### 42.2 Pruebas

**Ejecutadas** — `subscription-transitions.test.ts`, 10 casos nuevos: aplica el
plan pendiente; limpia las tres columnas; la organización sólo sigue al plan
cuando el cambio es efectivo; **no** aplica antes de la fecha; ignora
suscripciones sin cambio pendiente; registra el evento con plan de origen y
destino; es idempotente; convive con el vencimiento del período en la misma
corrida; aplica varios cambios a la vez.

Además `lifecycle-matrix.test.ts` incorpora el estado `plan_downgrade` y afirma
que **conserva acceso completo y no exige pago**, que es el punto de D-5.

**Preparadas, no ejecutadas** — `tests/postgres-integration.test.mjs` casos
**14-17**: el downgrade programa en vez de aplicar; el período se extiende sin
regalar ni quitar días; la organización conserva su plan y el evento se registra
como `plan_downgrade_scheduled`; un upgrade posterior cancela el downgrade.
El fixture SQL gana el caso `plan_downgrade` (arranca en el plan caro).

### 42.3 Un fallo real que encontró la prueba

El primer intento del cron leía `subscription.plan_id` y
`subscription.pending_plan_id` **después** de haber hecho el `UPDATE`, para
componer la bitácora. Con supabase-js real eso funciona por casualidad (el
objeto devuelto es una copia), pero es frágil y con el doble en memoria —donde
la fila es una referencia viva— la bitácora salía con
`from_plan_id = plan-barato` y `to_plan_id = null`.

Corregido tomando un snapshot de los valores antes de escribir. La versión
actual es correcta en ambos mundos.

### 42.4 Lo que sigue sin verificar

> La migración 035 **no se ha ejecutado contra PostgreSQL**. Modifica una
> función `SECURITY DEFINER` que mueve dinero. Sus cuatro pruebas están escritas
> y se saltan. **No debe aplicarse a producción sin ejecutarlas antes.**

Falta también reflejar la política en la UI: el botón de un plan más barato
debería avisar de que el cambio se aplicará al final del período. Hoy no lo
dice.

---

## 42.5 Estado del cron tras la corrección de Codex

Verificado en los logs de producción durante esta iteración. Cronología
completa del cron de recuperación:

| Hora (UTC) | Deployment | Código | Qué fue |
|---|---|---|---|
| 20:51:13 | `dpl_CuWeV8f…` | 401 | Sonda post-deploy sin `Authorization` (`cache=MISS`) |
| 21:01:03 | `dpl_CuWeV8f…` | **500** | El bug `created_at` |
| 21:10:25 | `dpl_2QWqq1A…` | 401 | Sonda post-deploy del despliegue con la corrección |
| 21:10:42 | `dpl_2QWqq1A…` | **200** | Primera ejecución programada correcta |
| 21:20:42 | `dpl_2QWqq1A…` | **200** | Segunda ejecución programada correcta |

**La corrección funciona**: dos ticks consecutivos en 200. Se confirma también
el patrón de los 401 — son siempre la sonda `cache=MISS` inmediatamente
posterior a un despliegue, nunca un tick programado.

**Lo que sigue sin poder confirmarse:** `writeFailures` y `auditFailures`. Un
200 sólo significa que el worker terminó sin lanzar; ambos contadores podrían
ser mayores que cero y la respuesta seguiría siendo 200. Vercel no exporta el
cuerpo de la respuesta. **Esto es exactamente lo que resuelve §43**, que aún no
está desplegado.

---

## 43. Log estructurado del webhook recovery

`/api/cron/billing-webhook-recovery` emite **siempre** una línea JSON con el
resumen, también cuando no hubo trabajo:

```json
{"event":"webhook_recovery_summary","correlation_id":"vercel-webhook-recovery-<uuid>","scanned":3,"claimed":3,
 "recovered":2,"retried":1,"deadLettered":0,"flaggedForReview":0,
 "skippedNotDue":0,"skippedLocked":0,"writeFailures":0,"auditFailures":0,
 "durationMs":412,"processedAt":"2026-08-10T21:10:00.123Z"}
```

Incluye los cinco contadores pedidos (`recovered`, `retried`, `deadLettered`,
`writeFailures`, `auditFailures`) más el contexto para diagnosticar.

> Desde §59 el resumen se emite por `billingLog`, así que el marcador de
> búsqueda es **`webhook_recovery_summary`** y lleva `correlation_id` con el
> `workerId` de la ejecución —el mismo que queda en `locked_by`—.

**Nivel según resultado:** si `writeFailures > 0` o `auditFailures > 0` se emite
por `console.error` en vez de `console.log`, para que salte en el filtro por
nivel de Vercel y no sólo en una búsqueda por texto.

Se eligió JSON en una sola línea porque los logs de Vercel se consultan por
texto: así se puede filtrar por `webhook_recovery_summary` y extraer los
contadores sin abrir cada invocación.

**Esto cierra el hueco anotado en §41.1**: hasta ahora `writeFailures` y
`auditFailures` sólo viajaban en el cuerpo de la respuesta HTTP, que Vercel no
exporta, así que las ejecuciones en 200 no permitían confirmarlos. Con el
resumen en el log, la próxima ejecución tras desplegar sí los mostrará.

**Pruebas ejecutadas** (5): emite los cinco contadores; se emite aunque no haya
nada que procesar; sube a `error` con `auditFailures`; sube a `error` con
`writeFailures`; es una sola línea de JSON parseable.

---

## 44. Runbook reproducible — las 17 pruebas PostgreSQL/RLS

> **Nunca contra producción.** El runner rechaza cualquier host que no sea
> local y aborta si la base contiene organizaciones que no son de QA.

### 44.1 Prerrequisitos

| Requisito | Comprobación |
|---|---|
| Docker en marcha | `docker info` |
| Supabase CLI | `npx supabase --version` |
| Node 22+ | `node --version` |

La ruta soportada es **Supabase CLI local**, no un PostgreSQL pelado: las
migraciones referencian `auth.users` y el esquema `extensions`, que sólo existen
en el stack de Supabase.

### 44.2 Levantar la base desechable

```bash
cd web
npx supabase start          # expone Postgres en 127.0.0.1:54322
npx supabase db reset       # aplica supabase/migrations/ desde cero
```

`db reset` recrea la base y aplica **todas** las migraciones en orden,
incluidas la 033, la 034 y la 035. Es lo que permite validar la 035 sin haberla
aplicado en ningún entorno real.

### 44.3 Comprobar prerrequisitos sin ejecutar nada

```bash
QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/qa-postgres-suite.mjs --check
```

Verifica destino, que la base esté vacía de datos reales, que existan las
funciones de billing y **reporta si la 033/034/035 están aplicadas**. No
escribe nada.

### 44.4 Ejecutar la suite

```bash
QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/qa-postgres-suite.mjs
```

Salida esperada: `# pass 17`, `# fail 0`. Al terminar imprime la limpieza; debe
decir «sin residuos».

### 44.5 Qué cubre cada prueba

| # | Verifica |
|---|---|
| 1-2 | RLS habilitado y con policy en las 14 tablas de billing |
| 3 | Las funciones de billing no son ejecutables por `anon` ni `authenticated` |
| 4 | Índice único de webhooks, por catálogo **y** provocando un `23505` real |
| 5-7 | Reactivación desde `suspended` y `cancelled`; reentrada idempotente del RPC |
| 8-9 | Los fixtures producen cada estado; gracia vigente vs vencida |
| 10-11 | Renovación sin regalar días; cambio de plan sin duplicar |
| 12 | Una activación = un `subscription_event` de proveedor |
| 13 | Un checkout expirado no activa |
| **14-17** | **Downgrade programado (D-5)**: programa en vez de aplicar; período correcto; organización intacta; un upgrade posterior lo cancela |

### 44.6 Interpretación de fallos

| Síntoma | Causa probable |
|---|---|
| `Faltan funciones de migración` | Falta `supabase db reset` |
| Fallan sólo 14-17 | La migración 035 no está aplicada en esa base |
| Falla sólo la 6 | La migración 033 no está aplicada |
| `Faltan los fixtures de QA` | Se ejecutó el archivo de tests directamente en vez del runner |
| Aparecen residuos en la limpieza | Algún test escapó de su transacción: hay que revisarlo |

### 44.7 Estado

> **17 pruebas preparadas, 0 ejecutadas por falta de base QA desechable.**
> El entorno del agente sigue sin servidor PostgreSQL, sin Docker y sin
> Supabase CLI operativo. **PostgreSQL/RLS NO está aprobado.**

---

## 45. Resultados de esta iteración

| Comando | Resultado real |
|---|---|
| `npx vitest run` | **520 passed / 30 files**, 0 fallos |
| `npm test` | vitest 520 + node: **6 passed, 17 skipped** |
| `npm run lint` | **0 errores**, 168 warnings (preexistentes) |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | **Compiled successfully** |
| `git diff --check` | sin salida |
| `node scripts/qa-postgres-suite.mjs --check` | 3 rechazos correctos (sin variable, host remoto, sin servidor) |

Pruebas nuevas en esta iteración: **19** (501 → 520). Casos PostgreSQL: 13 → 17.

## 46. Guía de revisión del diff

Diff real de la iteración: **10 archivos modificados + 1 nuevo, 872 inserciones
y 13 supresiones.**

```
 web/AGENT_NEXT_PHASE_IMPLEMENTATION.md             | 320 +++++++++++++++-
 web/scripts/qa-postgres-suite.mjs                  |  16 ++
 web/src/app/api/cron/billing-lifecycle/route.ts    |  75 +++++
 web/src/app/api/cron/billing-webhook-recovery/...  |  36 ++-
 web/src/qa-e2e/helpers/fixtures.ts                 |  16 ++
 web/src/qa-e2e/lifecycle-matrix.test.ts            |  26 +-
 web/src/qa-e2e/subscription-transitions.test.ts    | 148 ++++++++++
 web/src/qa-e2e/webhook-recovery.test.ts            | 110 +++++++
 web/supabase/qa/001_qa_lifecycle_fixtures.sql      |  27 +-
 web/tests/postgres-integration.test.mjs            | 111 ++++++-
 10 files changed, 872 insertions(+), 13 deletions(-)

?? web/supabase/migrations/20260810000300_035_scheduled_plan_downgrade.sql
```

### 46.1 Código de aplicación — 3 archivos

| Archivo | Qué cambia | Qué revisar |
|---|---|---|
| `api/cron/billing-lifecycle/route.ts` (+75) | Bloque nuevo que materializa los downgrades programados: mueve `plan_id`/`plan_price_id`, limpia las tres columnas pendientes, actualiza `organizations.plan_id`, registra el evento y devuelve `planChangesApplied` | (a) La guarda optimista `.lte("change_effective_at", now)` sobre el `UPDATE` es lo único que da idempotencia. (b) El **snapshot de valores antes de escribir**: leerlos después devuelve datos ya pisados (§42.3) |
| `api/cron/billing-webhook-recovery/route.ts` (+36) | Log estructurado JSON de una línea con los cinco contadores; `console.error` en vez de `console.log` si hay fallos | Que el resumen se emita **siempre**, también con `scanned: 0` |
| `migrations/…035_scheduled_plan_downgrade.sql` (nuevo) | El RPC programa el downgrade en vez de aplicarlo | **El cambio de mayor riesgo del diff.** Ver §46.4 |

### 46.2 Herramientas y fixtures — 2 archivos

| Archivo | Qué cambia |
|---|---|
| `scripts/qa-postgres-suite.mjs` (+16) | Modo `--check`: valida destino, estado de la base y migraciones aplicadas **sin escribir nada** |
| `supabase/qa/001_qa_lifecycle_fixtures.sql` (+27) | Caso `plan_downgrade`, que arranca en el plan caro para que el checkout al barato sea una bajada real |

### 46.3 Pruebas — 5 archivos

| Archivo | Casos | Cubre |
|---|---:|---|
| `subscription-transitions.test.ts` (+148) | 10 | Aplicación del downgrade por el cron, idempotencia, convivencia con el vencimiento |
| `webhook-recovery.test.ts` (+110) | 5 | Log estructurado: contadores, niveles, JSON parseable |
| `postgres-integration.test.mjs` (+111) | 4 | Casos 14-17 del downgrade — **preparados, no ejecutados** |
| `lifecycle-matrix.test.ts` (+26) | 1 | El downgrade programado conserva acceso y no exige pago |
| `helpers/fixtures.ts` (+16) | — | `LIFECYCLE_FIXTURES.plan_downgrade` |

### 46.4 Los tres puntos que exigen más atención

1. **La migración 035 no está probada.** Sus cuatro pruebas existen y se saltan.
   Aplicarla sin ejecutar §44 repetiría el patrón que ya costó un bug en
   producción (el `created_at` de §37.2.1).
2. **El bloque nuevo del cron es seguro de desplegar antes que la migración.**
   Sin la 035, `pending_plan_id` es siempre nulo, así que ese `select` no
   encuentra filas y el bloque no hace nada.
3. **Orden correcto:** desplegar código → ejecutar §44 en base desechable →
   aplicar la 035 **sólo si** los casos 14-17 pasan.

### 46.5 Comprobación rápida del revisor

```bash
cd web
npx vitest run                    # 520 passed / 30 files
npm test                          # node: 6 passed, 17 skipped
npm run lint                      # 0 errores, 168 warnings preexistentes
npx tsc --noEmit | grep '^src/'   # sin salida
npm run build                     # Compiled successfully
git diff --check                  # sin salida
git checkout -- src/lib/skills/data.generated.ts   # el prebuild sólo le cambia la fecha
```

## 46.7 ✅ VALIDACIÓN QA EJECUTADA — 17/17 en verde (2026-08-10)

> **Las 17 pruebas PostgreSQL/RLS se ejecutaron y pasaron.** La suite deja de
> estar «preparada» y pasa a estar **aprobada**. Sustituye a §46.6, que queda
> como registro del intento fallido previo.

### 46.7.1 Cómo se consiguió el entorno

Docker sigue sin estar instalado, así que **no** se usó Supabase CLI. En su
lugar se montó un PostgreSQL desechable:

| Paso | Detalle |
|---|---|
| Homebrew arm64 aislado | `/opt/homebrew` (el de `/usr/local` es x86_64 y con `pkgconf` arm64: bloqueaba ambas arquitecturas). **No se tocó** el Homebrew existente ni sus ~100 paquetes |
| PostgreSQL | `postgresql@16` → **16.14 arm64 nativo** |
| Clúster | `initdb` en el scratchpad, puerto **55432**, socket en `/tmp/pgqa` (la ruta del scratchpad excede los 103 bytes que admite un socket Unix) |
| Base | `qatest`, creada desde cero |
| Shim | Esquemas `auth`/`extensions`, funciones `auth.uid/role/jwt`, `auth.users`, publicación `supabase_realtime` y stubs de las tablas `public.cm_*` |
| Migraciones | **45 de 45 aplicadas sin error**, incluidas 033, 034 y **035** |

**Por qué hace falta el shim.** Las tablas `public.cm_*` viven en el backend
MySQL legacy —lo dice la propia migración 014— pero las migraciones de Postgres
las referencian con FK y ALTER. Sin ellas, 17 migraciones fallaban en cascada.
El shim vive en el scratchpad, **no en el repositorio**.

### 46.7.2 Resultado

```
▸ Suite de integración PostgreSQL/RLS
  host: 127.0.0.1
  organizaciones en la base: 0 (no-QA: 0)
  funciones de billing presentes: 4/4
  migración 033 (reactivación desde cancelled): APLICADA
  migración 035 (downgrade programado): APLICADA

# tests 17
# pass 17
# fail 0

▸ Limpieza
  sin residuos: todos los ROLLBACK funcionaron
```

Ejecutada **dos veces** con resultado idéntico: reproducible y sin residuos.

| # | Prueba | Resultado |
|---:|---|---|
| 1 | RLS habilitado en las 14 tablas de billing | ✅ |
| 2 | Cada tabla con policy, o deny-all a propósito | ✅ |
| 3 | Funciones no ejecutables por `anon`/`authenticated` | ✅ |
| 4 | Índice único de webhooks (catálogo + `23505` real) | ✅ |
| 5 | Reactivar desde `suspended` reutiliza la suscripción | ✅ |
| 6 | Reactivar desde `cancelled` no duplica (migración 033) | ✅ |
| 7 | Doble llamada al RPC no crea dos suscripciones | ✅ |
| 8 | Los fixtures producen los 9 estados | ✅ |
| 9 | Gracia vigente vs vencida | ✅ |
| 10 | Renovación sin regalar días | ✅ |
| 11 | Cambio de plan sin duplicar | ✅ |
| 12 | Una activación = un evento de proveedor | ✅ |
| 13 | Checkout expirado no activa | ✅ |
| **14** | **Downgrade programa en vez de aplicar** | ✅ |
| **15** | **El downgrade extiende el período correctamente** | ✅ |
| **16** | **La organización conserva su plan hasta la fecha** | ✅ |
| **17** | **Un upgrade posterior cancela el downgrade** | ✅ |

### 46.7.3 Cuatro fallos reales encontrados y corregidos

Ejecutar de verdad rompió cosas que ninguna prueba en memoria había visto.

**1. `plans.code` es NOT NULL** — *bug en el fixture*
Los tests 5-17 fallaban con
`null value in column "code" of relation "plans" violates not-null constraint`.
El fixture omitía `code`, que además tiene índice único. Corregido generando un
código único por siembra (`qa-fixture-a-<uuid>`), necesario porque varias
siembras conviven en la misma transacción.

**2. La organización arrancaba en un plan distinto al de la suscripción** —
*bug en el fixture*
El test 16 comparaba `organizations.plan_id` contra un plan que la cuenta nunca
tuvo: el fixture ponía siempre el plan A en la organización aunque la
suscripción arrancara en el B. Corregido usando `v_start_plan` en ambos.

**3. Una EXCEPTION del RPC aborta la transacción entera** — *bug en el test*
El test 13 fallaba con `25P02: current transaction is aborted`. Tras un
`RAISE EXCEPTION`, PostgreSQL invalida la transacción y toda consulta posterior
falla. Corregido con `SAVEPOINT` + `ROLLBACK TO SAVEPOINT`. **Este fallo es
imposible de detectar con el doble en memoria**, que no modela transacciones.

**4. `billing_outbox_jobs` tiene RLS sin policy** — *hallazgo del esquema*
Detectado por el test 2. Viene así desde la migración 010. RLS sin policy
**deniega todo** a los roles no privilegiados, y para una cola interna de
trabajo esa es la postura correcta —sólo `service_role`, con BYPASSRLS, la
alcanza—. En lugar de añadirle una policy permisiva, se hizo **explícito**: la
tabla está en `RLS_DENY_ALL_BY_DESIGN` y el test ahora afirma en ambos sentidos
—que sigue sin policy—, de modo que si alguien le añade una, el test falla y
obliga a revisar si exponerla es intencional.

### 46.7.4 Alcance y límites de esta validación

**Qué queda demostrado contra PostgreSQL real:** RLS y privilegios, el índice
único con su `23505`, el cuerpo completo del RPC —reactivaciones, renovación,
cambio de plan, idempotencia y **los cuatro casos del downgrade**—, y que las 45
migraciones aplican de cero en orden.

**Qué NO:** el `auth` de Supabase es un shim, así que las policies que dependan
de `auth.uid()` real no se ejercitan; y las tablas `cm_*` son stubs, de modo que
nada que dependa de su forma real queda validado. Ninguna de las 17 pruebas
depende de esas dos cosas.

### 46.7.5 Cambios aplicados durante la validación — para revisar

Ejecutar la suite obligó a tocar dos archivos. **Ningún cambio en código de
aplicación ni en migraciones**: los arreglos fueron del fixture y del test.

```
 web/supabase/qa/001_qa_lifecycle_fixtures.sql |  43 ++++++--
 web/tests/postgres-integration.test.mjs       | 147 ++++++++++++++++++++++++--
 2 files changed, 175 insertions(+), 15 deletions(-)
```

**`supabase/qa/001_qa_lifecycle_fixtures.sql`**

| Cambio | Motivo |
|---|---|
| `INSERT INTO plans(...)` ahora incluye `code`, `status` e `is_public` | `plans.code` es `NOT NULL` con índice único. El código se genera por siembra (`qa-fixture-a-<uuid>`) porque varias siembras conviven en la misma transacción |
| `v_start_plan` / `v_start_price` se calculan **antes** de crear la organización | La organización debe arrancar en el mismo plan que la suscripción; si no, las aserciones sobre `organizations.plan_id` comparan contra un plan que la cuenta nunca tuvo |
| Caso `plan_downgrade` añadido | Arranca en el plan caro para que el checkout al barato sea una bajada real |

**`tests/postgres-integration.test.mjs`**

| Cambio | Motivo |
|---|---|
| Casos **14-17** nuevos (downgrade) | Validan la migración 035 |
| `SAVEPOINT` + `ROLLBACK TO SAVEPOINT` en el caso 13 | Un `RAISE EXCEPTION` del RPC aborta la transacción entera (`25P02`): sin savepoint, ninguna consulta posterior funciona |
| `RLS_DENY_ALL_BY_DESIGN` en el caso 2 | `billing_outbox_jobs` tiene RLS sin policy desde la 010. Se documenta como intencional y se afirma **en ambos sentidos**: si alguien le añade una policy, el test falla |
| `subscriptionsOf` devuelve `pending_plan_id`, `pending_plan_price_id` y `change_effective_at` | Los casos del downgrade necesitan comprobarlas |

**Qué revisar con atención:** que el `SAVEPOINT` del caso 13 no oculte otros
errores (sólo envuelve la llamada que debe fallar), y que la excepción de
`RLS_DENY_ALL_BY_DESIGN` sea una decisión que compartes: hoy `billing_outbox_jobs`
es inaccesible salvo para `service_role`.

### 46.7.6 ¿Está la 035 lista para revisión de Codex?

**Sí, y ahora también con aval de ejecución.**

| Criterio | Estado |
|---|---|
| Escrita, comentada y con rollback documentado | ✅ |
| Cambio acotado y verificado contra la 033 | ✅ |
| **Aplicada sobre PostgreSQL real** | ✅ (`db qatest`, sin error) |
| **Casos 14-17 aprobados** | ✅ **4 de 4** |
| Sin regresión en 5-12 (reactivación, renovación, upgrade) | ✅ |
| Aplicada en producción | ❌ **no, y no debe hacerlo el agente** |

Recomendación: **lista para que Codex la aplique** tras revisar el diff. El
riesgo que quedaba —«nunca se ha ejecutado»— está resuelto.

---

## 46.6 Intento previo de validación QA (superado por §46.7)

Se intentó ejecutar las 17 pruebas PostgreSQL/RLS. **No fue posible.**

### Paso 1 — disponibilidad del entorno

| Herramienta | Estado |
|---|---|
| `docker` | **no instalado** (`docker not found`; `docker info` falla) |
| `podman` | no instalado |
| Docker Desktop / OrbStack / Rancher | **ninguna app de contenedores presente** en `/Applications` |
| Supabase CLI | **disponible** vía `npx supabase` (v2.109.0, dependencia del proyecto) |
| Servidor PostgreSQL local | no existe binario `postgres` |
| Puertos 5432 / 54322 | nadie escuchando |

### Paso 2 — intento real de levantar la base

```
$ npx supabase start
failed to inspect service: Cannot connect to the Docker daemon at
unix:///var/run/docker.sock. Is the docker daemon running?
Docker Desktop is a prerequisite for local development.
```

El CLI está, pero **`supabase start` exige Docker**, que no está instalado. Sin
contenedor no hay base desechable, y la única base alcanzable es la productiva
—que el runner rechaza por diseño—.

### Paso 3 — resultado

| Métrica | Valor |
|---|---|
| Pruebas ejecutadas | **0** |
| Pruebas aprobadas | **0** |
| Pruebas fallidas | **0** |
| Pruebas omitidas | **17** (todas) |

Motivo único: **falta Docker**. No es un fallo de las pruebas ni del código.

### Paso 4 — validación estática hecha en su lugar

Como las pruebas no pudieron correr, se verificó lo que sí es comprobable sin
base de datos:

1. **Columnas.** Las 21 columnas que la 035 asigna en `UPDATE ... SET` sobre
   `subscriptions` existen todas en el esquema derivado de las migraciones.
   Cero desconocidas.
2. **Variables.** Las 12 variables `v_*` usadas están declaradas. Ninguna
   huérfana.
3. **Diff contra la 033 aplicada** (101 líneas de diferencia, todas
   intencionadas):
   - 3 variables nuevas (`v_current_amount_minor`, `v_is_downgrade`, `v_reason`);
   - el `UPDATE` único pasa a `IF/ELSE`, y **la rama `ELSE` es idéntica a la de
     la 033** salvo por limpiar `pending_*` — es decir, upgrades, renovaciones y
     reactivaciones conservan su comportamiento;
   - `organizations.plan_id` protegido con `CASE WHEN v_is_downgrade THEN plan_id`;
   - el evento usa `v_reason` y añade dos campos de metadata.

   **Ningún cambio colateral** fuera de esos cuatro puntos.
4. **Degradación segura.** Si `plan_price_id` de la suscripción fuese nulo
   (dato heredado), `v_current_amount_minor` queda nulo, `v_is_downgrade` es
   falso y el RPC se comporta exactamente como la 033.

Esto es revisión de código, **no** sustituye la ejecución: no valida sintaxis
plpgsql real, ni el comportamiento transaccional, ni el `FOR UPDATE`.

### Paso 5 — qué falta para ejecutarlas

Un solo requisito:

```bash
# 1. Instalar Docker Desktop  ->  https://docs.docker.com/desktop
# 2. Con el daemon corriendo:
cd web
npx supabase start
npx supabase db reset
QA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/qa-postgres-suite.mjs
```

`db reset` aplica **todas** las migraciones desde cero, incluida la 035, de modo
que se valida sin tocar ningún entorno real.

### ¿Está la 035 lista para revisión de Codex?

**Sí para revisión de código. No para aplicarse.**

| Criterio | Estado |
|---|---|
| Escrita, comentada y con rollback documentado | ✅ |
| Cambio acotado y verificado contra la 033 | ✅ |
| Columnas y variables validadas estáticamente | ✅ |
| Degrada con seguridad ante datos heredados | ✅ |
| **Ejecutada contra PostgreSQL** | ❌ **nunca** |
| **Casos 14-17 aprobados** | ❌ **0 de 4** |

Recomendación sin cambios respecto a §48: revisar el diff ahora, y **aplicarla
sólo después** de que los casos 14-17 pasen en una base desechable.

---

## 47. Estado del plan

| Pendiente | Estado |
|---|---|
| H-01 · timeout ePayco | **Cerrado** |
| H-02 · rate limiting checkout | **Cerrado** |
| H-03 · idempotencia checkout | **Cerrado** |
| H-10 · recuperación de webhooks | **Cerrado y desplegado**; dos ticks en 200 (§42.5). Contadores aún sin evidencia |
| **H-12 · downgrade programado** | **Implementado y validado**: 4/4 casos en PostgreSQL real (§46.7). Falta aplicar la 035 en producción |
| Log estructurado del recovery | **Cerrado** |
| Runbook PostgreSQL reproducible | **Cerrado** (§44) |
| **Suite PostgreSQL/RLS** | ✅ **17 ejecutadas, 17 aprobadas** contra PostgreSQL 16.14 real (§46.7) |
| H-04 · `getEpaycoConfig()` | Abierto (P2) |
| H-05 · `correlation_id` en logs | Abierto (P2) |
| H-06 · ensayo de restauración | Abierto (P1) |
| H-07 · rollback de 031 y 032 | Abierto (P1) |
| H-09 · rate limiter fail-open | Abierto (P2) |
| H-11 · dedup en la cola de canales | Abierto (P2) |
| Aviso en la UI del downgrade diferido | Abierto (P2) |

## 48. Para Codex — orden de publicación

La corrección de `received_at` **ya la desplegaste** (§42.5): el cron lleva dos
ticks en 200. Lo que queda de esta iteración es lo siguiente.

1. Revisar el diff de `billing-lifecycle/route.ts`. El bloque de cambios de plan
   pendientes es nuevo y corre en cada ejecución del cron diario. Mientras la
   035 no esté aplicada, `pending_plan_id` es siempre nulo y ese bloque es un
   `select` que no encuentra filas: **es seguro desplegarlo antes que la
   migración**.
2. Desplegar el **log estructurado** (§43). Es lo que permitirá por fin
   confirmar `writeFailures: 0` y `auditFailures: 0`, que hoy siguen sin
   evidencia pese a los 200.
3. ~~Ejecutar §44 contra una base desechable~~ → **HECHO** (§46.7):
   **17/17 en verde** contra PostgreSQL 16.14 real, dos ejecuciones,
   sin residuos.
4. **Aplicar la migración 035.** Los casos 14-17 pasan, así que el bloqueo
   («nunca ejecutada») está resuelto. Sin ella, un downgrade sigue recortando
   límites al instante: es el comportamiento actual en producción, no una
   regresión de este trabajo.
5. Tras (2), buscar en los logs `webhook_recovery_summary` y registrar
   los contadores.

Sin commit, push ni deploy por parte del agente.

---

---

# Iteración 8 — 2026-08-10 · Cierre de los hallazgos restantes

Los seis pendientes de §47, cerrados. Cinco con evidencia de ejecución contra
PostgreSQL real; el sexto es una revisión con conclusión documentada.

## 49. Resultados

| Comando | Resultado real |
|---|---|
| `npx vitest run` | **535 passed / 30 files**, 0 fallos |
| `npm test` | vitest 535 + node: 6 passed, **18 skipped** |
| Suite PostgreSQL (`qa-postgres-suite.mjs`) | **18 ejecutadas, 18 aprobadas**, sin residuos |
| `npm run lint` | **0 errores**, 168 warnings (preexistentes) |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | Compiled successfully |
| `git diff --check` | sin salida |

## 50. H-12 / D-5 · Aviso de downgrade diferido en la UI — **CERRADO**

La lógica vive en `subscription-ui.ts`, fuera del componente, para poder
probarla sin montar React.

**`derivePendingPlanChange(subscription, {planName})`** — devuelve el aviso sólo
si el cambio **queda por aplicarse**. Uno cuya fecha ya pasó está a la espera del
cron: anunciarlo como futuro sería mentir.

**`classifyPlanChange({currentAmountMinor, targetAmountMinor})`** — `downgrade`
sólo cuando el destino es más barato. Sin precio comparable devuelve `unknown`
en vez de adivinar.

Dónde se ve:

| Sitio | Qué muestra |
|---|---|
| Tarjeta de estado (`SubscriptionLifecycleCard`) | Aviso azul: «Tu cambio al plan *X* se aplicará el *fecha*. Hasta esa fecha conservas tu plan actual y todos sus límites» |
| Tarjeta de cada plan más barato | «Al ser un plan de menor precio, el cambio se aplicará al terminar tu periodo actual» — **antes de pagar**, no después |

También se añadieron `pending_plan_id`, `pending_plan_price_id` y
`change_effective_at` al tipo `Subscription`, y `cancelled` ya estaba en la
consulta de la página.

**Pruebas (12 nuevas):** anuncia con fecha y nombre del plan; sin nombre no lo
inventa; no anuncia si no hay cambio, si falta la fecha o si ya pasó; un
downgrade programado no altera el resto de la pantalla; y la matriz de
clasificación, incluida la invariante de que **sólo el downgrade se difiere**
—si eso cambiara, el aviso mentiría—.

## 51. H-05 · `correlation_id` en los logs de billing — **CERRADO EN FALSO, REABIERTO Y CERRADO DE VERDAD (§59)**

> ⚠️ **Esta sección declaró H-05 cerrado antes de tiempo.** La migración cubrió
> 7 módulos elegidos a mano y dejó **cinco archivos con `console` suelto**:
> `billing/cancel`, `billing/resume`, `billing/checkout`, `billing/status` y
> `public-plans`. La prueba usaba una **lista fija**, así que no los veía y daba
> el hallazgo por resuelto.
>
> El cierre real, con el escaneo que lo habría impedido, está en **§59**.

Lo que sí quedó bien de esta primera pasada:

Nuevo `src/lib/billing/log.ts`: `billingLog` / `billingError` / `billingWarn`
emiten una línea JSON con `correlation_id` **obligatorio por tipo**, no por
convención.

El identificador **nunca se inventa**: se pasa el que ya existe en el dominio,
con los mismos prefijos que usa `subscription_events`.

| Origen | Correlación |
|---|---|
| Confirmación del proveedor | `epayco:<x_transaction_id>` |
| Checkout | `checkout:<Idempotency-Key>` |
| Recuperación de webhooks | `webhook-recovery:<eventId>` |
| Acciones de suscripción | el `correlationId` ya calculado (`cancel:`, `resume:`, `admin:`) |
| Decisiones y cupos | `decision:`, `usage:`, `quota:`, `reservation:` |

Migrados **16 puntos de log** en 7 módulos de dinero: `epayco-activation`,
`webhook-recovery`, `subscription-actions`, `notifications`, `service`, y las
rutas de confirmación y checkout de ePayco. Ya no queda ningún `console.error`
suelto en ellos.

**Pruebas de esta primera pasada (3):** el logger exige `correlationId`; las
rutas *de la lista* no usan `console` suelto; y toda llamada al logger pasa
`correlationId`. **La segunda de las tres era la defectuosa**: enumeraba en vez
de escanear.

## 52. H-04 · `getEpaycoConfig()` — **CERRADO**

**Eliminada.** Devolvía `privateKey` y `pKey` —el material con el que se firman y
validan las confirmaciones— en un solo objeto. No tenía consumidores, pero
bastaba con que una ruta devolviese su resultado al navegador.

En su lugar queda `isEpaycoTestMode()`, que expone sólo el booleano que hacía
falta. Las claves privadas ya no salen del módulo.

**Pruebas (2):** la función no existe y nadie la invoca; y **ninguna función
exportada del módulo devuelve `EPAYCO_PRIVATE_KEY` ni `EPAYCO_P_KEY`** —se
inspecciona el cuerpo de cada `export function`, así que cubre también las
futuras—.

## 53. H-06 · Runbook de backup y restauración — **CERRADO con ensayo**

`web/docs/BACKUP_RESTORE_RUNBOOK.md`. No es sólo procedimiento: **se ejecutó**.

| Paso | Resultado |
|---|---|
| `pg_dump -Fc` de `qatest` | **383 KB en 1 s**, sin errores |
| `pg_restore` en base nueva `qarestore` | **0 errores**, 1 s |

| Métrica | Origen | Restaurada |
|---|---:|---:|
| Tablas en `smarttalk` | 52 | **52** |
| Funciones | 60 | **60** |
| Tablas con RLS | 51 | **51** |
| Policies | 68 | **68** |
| Plan testigo insertado a propósito | 1 | **1** |
| Migración 035 presente en la función | sí | **sí** |

El runbook incluye los cinco datos que hay que registrar por backup, el restore
parcial por tabla, y el aviso de que **`TOKEN_ENCRYPTION_KEY` no viaja en el
dump**: es la única pieza cuya pérdida es irreversible.

**Lo que el ensayo NO cubre**, y queda escrito: es una base, no el proyecto
Supabase completo; 383 KB no dicen nada del tiempo sobre decenas de GB; y falta
repetirlo **contra un backup real de producción**. Hasta entonces lo demostrado
es que *el procedimiento funciona*, no que *el backup de producción sea
restaurable*.

## 54. H-07 · Rollback de 031, 032 y 035 — **CERRADO y ejecutado**

`web/supabase/migrations/ROLLBACK.md`, con el orden inverso obligatorio
(`035 → 034 → 032 → 031`) y el efecto de cada reversión sobre la aplicación.

**Se ejecutó el rollback completo y la reaplicación** en la base desechable:

| Estado | Funciones de billing | `locked_by` | 035 activa |
|---|---:|---:|---|
| Antes | 6 | 1 | sí |
| Tras el rollback | **0** | **0** | **no** |
| Tras reaplicar | **6** | **1** | **sí** |

### Un fallo real que sólo apareció al ejecutarlo

Dos `DROP FUNCTION` **no borraban nada y no avisaban**, por firmas equivocadas:

| Escrito | Real |
|---|---|
| `reserve_billing_capacity(UUID, TEXT, INT)` | `(uuid, text, **bigint**)` |
| `consume_billing_capacity(UUID, UUID)` | `(uuid, **text**)` |

`DROP FUNCTION` con tipos que no coinciden es un no-op silencioso: el rollback
habría parecido correcto dejando dos funciones vivas. Corregido, y el runbook
incluye ahora la consulta para verificar una firma antes de escribir el `DROP`.

También estaba mal el nombre de la tabla: es `billing_quota_reservations`, no
`billing_capacity_reservations`.

**Orden que hace seguro el rollback de la 031:** poner
`BILLING_ATOMIC_QUOTA_MODE=off` y desplegar **antes** de borrar las funciones.
Al revés, `reserveBillingCapacity` llama a algo inexistente y el alta de
contactos, canales, marcas y flujos responde `503`.

## 55. H-11 · Deduplicación de la cola de canales — **REVISADO**

Conclusión: **el riesgo era menor de lo que decía el hallazgo.**

La cola `webhook_events` **no deduplica en la entrada** —no tiene índice único
de negocio— pero la protección real está aguas abajo: el índice
`uq_messages_conv_wa_message_id ON messages(conversation_id, wa_message_id)
WHERE wa_message_id IS NOT NULL` impide que un mismo mensaje del proveedor se
inserte dos veces.

Es decir: un webhook repetido genera **trabajo redundante**, no **datos
duplicados**. Por eso no se añadió deduplicación en la cola: exigiría una
migración con hash de payload para resolver un problema de eficiencia, no de
corrección, y la corrección ya está garantizada.

**Prueba 18, ejecutada contra PostgreSQL real:** verifica ambas mitades — que la
cola sigue sin índice único de negocio (excluyendo la PK, que también es único)
y que el índice parcial de `messages` existe con sus tres condiciones. Si
alguien añade unicidad a la cola, el test falla y obliga a revisar si es
intencional.

## 56. Archivos de la iteración 8

**Nuevos**

```
web/src/lib/billing/log.ts                        # logger con correlation_id
web/docs/BACKUP_RESTORE_RUNBOOK.md                # runbook + ensayo ejecutado
web/supabase/migrations/ROLLBACK.md               # rollback 031/032/034/035, ejecutado
```

**Modificados — código de aplicación**

```
web/src/lib/billing/subscription-ui.ts            # derivePendingPlanChange + classifyPlanChange
web/src/components/billing/SubscriptionLifecycleCard.tsx  # aviso de downgrade
web/src/app/(dashboard)/settings/billing/page.tsx # aviso por plan + pendingPlanName
web/src/types/database.ts                         # pending_plan_id, change_effective_at
web/src/lib/epayco/client.ts                      # getEpaycoConfig eliminada
web/src/lib/billing/service.ts                    # logs con correlación
web/src/lib/billing/subscription-actions.ts       # idem
web/src/lib/billing/notifications.ts              # idem
web/src/lib/billing/webhook-recovery.ts           # idem
web/src/lib/billing/epayco-activation.ts          # idem
web/src/app/api/epayco/confirmation/route.ts      # idem
web/src/app/api/epayco/checkout/route.ts          # idem
```

**Modificados — pruebas**

```
web/src/lib/billing/subscription-ui.test.ts       # +12 casos (downgrade UI)
web/src/qa-e2e/security-posture.test.ts           # H-04 y H-05 cerrados
web/tests/postgres-integration.test.mjs           # caso 18 (H-11)
```

## 57. Estado del plan tras la iteración 8

| Pendiente | Estado |
|---|---|
| H-01 · timeout ePayco | **Cerrado** |
| H-02 · rate limiting checkout | **Cerrado** |
| H-03 · idempotencia checkout | **Cerrado** |
| H-04 · `getEpaycoConfig()` | **Cerrado** (§52) |
| H-05 · `correlation_id` en logs | **Cerrado de verdad** (§59); §51 lo cerró en falso |
| H-06 · ensayo de restauración | **Cerrado** (§53) — falta repetirlo con un backup real |
| H-07 · rollback de 031/032/035 | **Cerrado y ejecutado** (§54) |
| H-10 · recuperación de webhooks | **Cerrado y desplegado** |
| H-11 · dedup de la cola | **Revisado** (§55): sin acción, protección aguas abajo verificada |
| H-12 · downgrade programado | **Cerrado**: 4/4 en PostgreSQL + aviso en la UI (§50) |
| Suite PostgreSQL/RLS | ✅ **18/18 aprobadas** |
| H-09 · rate limiter fail-open | **Abierto** (P2) — sigue siendo el único hallazgo técnico sin cerrar |

Pendientes operativos, no de código:

- Aplicar la **migración 035** en producción (validada, no aplicada).
- Desplegar el **log estructurado** y confirmar `writeFailures: 0` /
  `auditFailures: 0`.
- Repetir el ensayo de restauración **con un backup real de producción**.
- Consulta de §28 antes de decidir sobre el CHECK de `job_type`.

## 58. Para Codex

1. Revisar el diff de `lib/billing/log.ts` y los 16 puntos migrados: es un
   cambio amplio pero mecánico; lo importante es que ningún `correlationId` sea
   inventado.
2. **`ROLLBACK.md` merece lectura atenta**: dos firmas estaban mal y sólo se vio
   al ejecutarlo. Las de ahí están verificadas.
3. El aviso de downgrade en la UI **anuncia un comportamiento que la migración
   035 todavía no tiene en producción**. Si se despliega la UI sin aplicar la
   035, el aviso miente: hay que desplegarlos juntos o aplicar la 035 primero.
4. `BACKUP_RESTORE_RUNBOOK.md` puede fusionarse con `docs/RUNBOOK.md §5`, que
   cubre el backup automático del servidor.

Sin commit, push ni deploy por parte del agente.

---

# Iteración 10 — 2026-08-10 · Migración 035 aplicada por el propietario

## 60. H-12 / D-5 · Estado posterior a la aplicación

El propietario ejecutó `supabase/migrations/20260810000300_035_scheduled_plan_downgrade.sql`
en el SQL Editor de Supabase. Resultado confirmado:

```text
Success. No rows returned
```

Queda aplicado en la base el comportamiento de downgrade programado: el cliente
conserva el plan vigente hasta `current_period_end`; el plan destino queda en
`pending_plan_id`/`pending_plan_price_id` y el cron lo materializa después.

La migración fue validada previamente contra PostgreSQL 16.14 desechable con
18/18 pruebas aprobadas. El código de `billing-lifecycle`, la UI y el logger
estructurado ya quedó publicado en producción.

## 60.1 Próximos pasos de publicación

1. ~~Revisar el diff local y ejecutar las comprobaciones de Iteración 9~~ →
   **HECHO**: 537 Vitest, 6 Node, lint sin errores y build exitoso.
2. ~~Commit y push de los cambios del agente por Codex~~ → **HECHO**:
   commit `1207e97`, rama `codex/add-manual-contact` y PR #12.
3. ~~Esperar el deployment de Vercel~~ → **HECHO**: deployment
   `dpl_FkHNWm3kYG586Qju8DpZGjDdverP` en estado `READY`, aliasado a
   `https://www.comunitymanager.io`.
4. ~~Ejecutar una prueba controlada de downgrade~~ → **HECHO**: ePayco aprobó
   la compra y el cron aplicó exactamente un cambio (`planChangesApplied: 1`).
5. Confirmar en logs `writeFailures: 0`, `auditFailures: 0` y
   `webhook_recovery_summary`.

Pendientes P2 que no bloquean esta publicación: rate limiter fail-open (H-09),
repetir restauración con un backup real de producción y decidir el CHECK de
`job_type`.

## 60.2 Evidencia de producción

| Verificación | Resultado |
|---|---|
| Deployment Vercel | `READY` / `Production` — commit `1207e97` |
| `/api/health` | HTTP 200 |
| `/settings/billing` sin sesión | HTTP 307 hacia autenticación |
| `/api/cron/billing-lifecycle` sin autorización | HTTP 401 |

## 60.3 Prueba funcional de downgrade programado — **APROBADA**

El propietario ejecutó el flujo sandbox desde **Demo Crecimiento** hacia
**Demo Inicial**. ePayco mostró **Transacción aprobada**, referencia
`380844738`, el 2026-08-11.

La consulta posterior en Supabase confirmó:

| Campo | Resultado |
|---|---|
| `status` | `active` |
| `plan_id` actual | `8debac97-2a60-4569-ab8a-7f3d39409d84` |
| `pending_plan_id` | `9c06e41c-839a-4d47-86b2-88fd3c3ba42e` |
| `status_reason` | `plan_downgrade_scheduled` |
| `change_effective_at` | `2026-10-10 18:53:38 UTC` |
| `current_period_end` | `2026-11-10 18:53:38 UTC` |

Esto demuestra que el pago no cambia el plan ni recorta el acceso de inmediato:
el plan actual queda vigente hasta la fecha efectiva y el plan destino queda
pendiente. No se debe repetir el pago.

### Validación final — **APLICADA**

El propietario ejecutó manualmente `/api/cron/billing-lifecycle` después de
adelantar `change_effective_at` para QA. Resultado:

```json
{"ok":true,"movedToPastDue":0,"cancelled":0,"suspended":0,
 "graceNotifications":0,"suspensionNotifications":0,
 "planChangesApplied":1}
```

El endpoint respondió HTTP 200, por lo que el worker encontró y materializó
exactamente un downgrade pendiente. La consulta final de Supabase debe dejar
`pending_plan_id` y `pending_plan_price_id` en `NULL`, mover
`plan_id`/`plan_price_id` al plan destino, actualizar `organizations.plan_id` y
registrar `reason = 'plan_change_applied'`. La bitácora final confirmó ese
evento con esta evidencia:

| Evento | Resultado |
|---|---|
| `reason` | `plan_change_applied` |
| `from_plan_id` | `8debac97-2a60-4569-ab8a-7f3d39409d84` |
| `to_plan_id` | `9c06e41c-839a-4d47-86b2-88fd3c3ba42e` |
| `effective_at` | `2026-08-11T15:11:29.800948+00:00` |
| `created_at` | `2026-08-11 15:19:10.102822+00` |

Con esto H-12/D-5 queda validado end-to-end. La consulta de la fila de
`subscriptions` y `organizations` queda como comprobación de consistencia
final, no como bloqueo funcional.

---
---

# Iteración 9 — 2026-08-10 · H-05, cerrado de verdad

## 59. Por qué hubo que rehacerlo

En §51 se declaró H-05 cerrado. **Era falso.** La migración cubrió 7 módulos
elegidos a mano y la prueba que debía vigilarlo usaba **la misma lista fija**,
así que cinco archivos con `console` suelto quedaron fuera del radar y el
hallazgo pasó por resuelto.

La lección es de método, no de código: **una prueba que enumera lo que ya sabes
que arreglaste no vigila nada.** Sustituida por un escaneo del árbol.

### 59.1 Los cinco archivos que faltaban

| Archivo | Correlación adoptada | De dónde sale |
|---|---|---|
| `app/api/billing/cancel/route.ts` | `cancel:<subscriptionId>` | Id real de la suscripción, en cuanto carga el contexto |
| `app/api/billing/resume/route.ts` | `resume:<subscriptionId>` | Ídem |
| `app/api/billing/checkout/route.ts` | `checkout:<Idempotency-Key>` | La única cadena que comparten cliente, `checkout_sessions` y log |
| `app/api/billing/status/route.ts` | `status:<organizationId>` | La organización es el ámbito real de esa lectura |
| `lib/billing/public-plans.ts` | `public-plans:catalog` | **No hay entidad**: el catálogo público no pertenece a nadie |

**Ninguna correlación se inventó.** Donde el fallo ocurre antes de conocer la
entidad, el valor lo dice explícitamente —`cancel:sin-contexto`,
`checkout:sin-clave`— en vez de fabricar un identificador que no correspondería
a nada. Es información útil: señala que el fallo fue anterior a la
identificación.

### 59.2 Tres archivos más que encontró el escaneo

Al escanear en vez de enumerar aparecieron otros que la lista tampoco cubría:

| Archivo | Correlación |
|---|---|
| `app/api/cron/billing-webhook-recovery/route.ts` | **`outcome.workerId`** — el mismo que queda en `locked_by` de cada evento reclamado |
| `app/api/cron/billing-outbox/route.ts` | `billing-outbox:batch` |
| `app/api/cron/release-contact-overage/route.ts` | `contact-overage-release:batch` |

Para el resumen de recuperación se **expuso `workerId` en `RecoveryOutcome`**:
ya se generaba internamente, así que ahora el log del resumen y la columna
`locked_by` comparten identificador y se pueden cruzar.

Efecto colateral del cambio: el resumen pasa a emitirse por `billingLog`, de
modo que el marcador de búsqueda es ahora **`webhook_recovery_summary`** (antes
`billing.webhook_recovery.summary`). §43 queda actualizada por esto.

### 59.3 La prueba nueva

`security-posture.test.ts` reemplaza la lista fija por un **escaneo** de
`lib/billing/`, `app/api/billing/`, `app/api/epayco/`, `app/api/cron/billing-*`
y `release-contact-overage`, excluyendo `log.ts` —que es quien llama a `console`
por definición—.

| Prueba | Qué garantiza |
|---|---|
| «ningún módulo de billing usa console.error/warn suelto» | **0 ocurrencias** en todo el árbol. Un archivo nuevo queda cubierto sin tocar la prueba |
| «el escaneo cubre de verdad las rutas que antes se escapaban» | Guarda contra un filtro mal editado: comprueba que los 7 archivos concretos entran en el escaneo y que cubre ≥ 12 módulos. Sin esto, un filtro roto haría pasar la anterior en falso |
| «todo módulo de billing que registre fallos usa el logger» | Si un archivo registra algo, lo hace con `billingError`/`billingWarn`/`billingLog` |
| «cada llamada al logger pasa un correlationId» | Acepta `correlationId:` y la forma abreviada `correlationId,` |

Estado: **29 llamadas al logger** en el árbol de billing, **0 `console` sueltos**.

### 59.4 Verificación

| Comando | Resultado |
|---|---|
| `npx vitest run` | **537 passed / 30 files**, 0 fallos |
| `npm test` | vitest 537 + node: 6 passed, 18 skipped |
| `npm run lint` | **0 errores**, 168 warnings preexistentes |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | Compiled successfully |
| `git diff --check` | sin salida |
| `grep console.error\|warn` en todo el árbol de billing | **ninguno** |

### 59.5 Archivos de la iteración 9

**Modificados — código**

```
web/src/app/api/billing/cancel/route.ts
web/src/app/api/billing/resume/route.ts
web/src/app/api/billing/checkout/route.ts
web/src/app/api/billing/status/route.ts
web/src/lib/billing/public-plans.ts
web/src/app/api/cron/billing-outbox/route.ts
web/src/app/api/cron/billing-webhook-recovery/route.ts
web/src/app/api/cron/release-contact-overage/route.ts
web/src/lib/billing/webhook-recovery.ts          # workerId expuesto en RecoveryOutcome
```

**Modificados — pruebas**

```
web/src/qa-e2e/security-posture.test.ts          # escaneo en vez de lista fija
web/src/qa-e2e/webhook-recovery.test.ts          # marcador del resumen actualizado
```

### 59.6 Guía de revisión del diff

**11 archivos, 355 inserciones / 46 supresiones.**

```
 web/src/app/api/billing/cancel/route.ts            |  15 ++-
 web/src/app/api/billing/checkout/route.ts          |  18 ++-
 web/src/app/api/billing/resume/route.ts            |  15 ++-
 web/src/app/api/billing/status/route.ts            |   7 +-
 web/src/app/api/cron/billing-outbox/route.ts       |   8 +-
 web/src/app/api/cron/billing-webhook-recovery/...  |  48 +++++++-
 web/src/app/api/cron/release-contact-overage/...   |   8 +-
 web/src/lib/billing/public-plans.ts                |   9 +-
 web/src/lib/billing/webhook-recovery.ts            |  31 +++--
 web/src/qa-e2e/security-posture.test.ts            | 132 +++++++++++++++++----
 web/src/qa-e2e/webhook-recovery.test.ts            | 110 +++++++++++++++++
 11 files changed, 355 insertions(+), 46 deletions(-)
```

| Archivo | Qué cambia | Qué revisar |
|---|---|---|
| `billing/cancel` · `billing/resume` (+15 c/u) | Variables `correlationId` / `organizationId` hoistadas, fijadas al cargar el contexto | Que el valor por defecto (`cancel:sin-contexto`) sólo sobreviva si se falla **antes** de conocer la suscripción |
| `billing/checkout` (+18) | `correlationId` desde la `Idempotency-Key`; 2 puntos de log migrados | Que `organizationId` se asigne después de resolver `agent`, no antes |
| `billing/status` (+7) | 1 punto migrado, ámbito = organización | — |
| `public-plans` (+9) | 1 punto migrado | **La única correlación sin entidad**: `public-plans:catalog`. Si te parece que debe llevar otra cosa, es el sitio a discutir |
| `cron/billing-outbox` · `cron/release-contact-overage` (+8 c/u) | 1 punto cada uno, correlación de lote | — |
| `cron/billing-webhook-recovery` (+48) | El resumen pasa a `billingLog` con `workerId` | **Cambia el marcador de búsqueda en los logs** a `webhook_recovery_summary` |
| `lib/billing/webhook-recovery` (+31) | `workerId` expuesto en `RecoveryOutcome` | Es aditivo; `emptyOutcome` ahora lo recibe como parámetro |
| `security-posture.test.ts` (+132) | Escaneo en vez de lista fija, 4 comprobaciones | **El cambio importante del diff.** Ver §59.3 |
| `webhook-recovery.test.ts` (+110) | Marcador del resumen actualizado | Los 5 casos del log estructurado siguen verdes |

**Los dos puntos que más merecen tu criterio:**

1. **`public-plans:catalog`** es la única correlación que no sale de una entidad
   del dominio, porque el catálogo público no pertenece a ninguna organización.
   Es una decisión defendible, no una verdad.
2. **El marcador de log cambió.** Cualquier alerta o filtro guardado que apunte
   a `billing.webhook_recovery.summary` deja de encontrar nada.

**Comprobación rápida:**

```bash
cd web
npx vitest run                    # 537 passed / 30 files
npm test                          # node: 6 passed, 18 skipped
npm run lint                      # 0 errores, 168 warnings
npx tsc --noEmit | grep '^src/'   # sin salida
npm run build                     # Compiled successfully
git diff --check                  # sin salida

# Y la comprobación que da sentido a todo esto:
grep -rn "console\.\(error\|warn\)" src/lib/billing src/app/api/billing \
  src/app/api/epayco src/app/api/cron | grep -v log.ts | grep -v test
# esperado: sin salida
```

### 59.7 Estado de H-05

**CERRADO**, ahora sí con una prueba que lo vigila por escaneo y no por
enumeración. Si alguien añade un `console.error` a cualquier módulo de billing
—existente o nuevo—, la suite falla.

Sin commit, push ni deploy por parte del agente.

---
---

# Iteración 10 — 2026-08-11 · Fase final

## 60. Logs de producción — `writeFailures: 0`, `auditFailures: 0` ✅

Consultados con el conector de Vercel sobre el deployment activo
`dpl_G9TpPh5CFWqffgWjXsheUBdBRDMz` (commit `9a979ac`, target **production**).

**Línea literal capturada:**

```
### 15:20:47 GET /api/cron/billing-webhook-recovery 200 [info/serverless]
[billing] webhook_recovery_summary {"event":"webhook_recovery_summary",
"correlation_id":"vercel-webhook-recovery-5c40435e-4ea7-4e5e-8a1d-9b02f8c07b66",
"scanned":0,"claimed":0,"recovered":0,"retried":0,"deadLettered":0,
"flaggedForReview":0,"skippedNotDue":0,"skippedLocked":0,
"writeFailures":0,"auditFailures":0,"durationMs":417,
"processedAt":"2026-08-11T15:20:47.547Z"}
```

| Contador | Valor exacto |
|---|---:|
| `scanned` | 0 |
| `claimed` | 0 |
| `recovered` | 0 |
| `retried` | 0 |
| `deadLettered` | 0 |
| `flaggedForReview` | 0 |
| `skippedNotDue` | 0 |
| `skippedLocked` | 0 |
| **`writeFailures`** | **0** ✅ |
| **`auditFailures`** | **0** ✅ |
| `durationMs` | 417 |

Además, filtrando por nivel `error`/`fatal` en las últimas 6 h de ese
deployment: **ningún log de error**.

**Lectura honesta de este resultado.** `scanned: 0` significa que **no había
eventos fallidos que recuperar**, que es justo lo que se espera de un sistema
sano. Por tanto lo demostrado es:

- el cron **se ejecuta**, responde 200 y **emite el resumen estructurado**;
- el `correlation_id` es el `workerId` real, tal como se diseñó en §59.2;
- los contadores de fallo están en cero.

Lo que **no** demuestra: que el camino de recuperación funcione con eventos
reales. Para eso haría falta un evento en `failed`, y no lo hay. Provocar uno
sería fabricar un fallo en producción, cosa que no se hizo.

**Limitación de la consulta:** el conector agota su presupuesto de tiempo con
ventanas de 24 h sobre todo el proyecto. Hubo que acotar por `deploymentId`. El
deployment activo tiene pocas horas de vida, así que sólo hay **una ejecución**
del cron en su historial.

## 61. Backup/restore reejecutado ✅

Segunda ejecución del runbook de `docs/BACKUP_RESTORE_RUNBOOK.md`, sobre la base
desechable. **No se tocó producción.**

| Paso | Resultado |
|---|---|
| Testigo insertado (`qa-restore-<timestamp>`) | 1 fila |
| `pg_dump -Fc` | **383 KB, < 1 s**, sin errores |
| `createdb qarestore2` + `pg_restore` | **0 errores**, < 1 s |

| Métrica | Origen | Restaurada |
|---|---:|---:|
| Tablas `smarttalk` | 52 | **52** |
| Funciones | 60 | **60** |
| Tablas con RLS | 51 | **51** |
| Policies | 68 | **68** |
| **Índices** | 145 | **145** |
| Planes (filas) | 5 | **5** |
| Testigo de esta ejecución | — | **1** |
| Migración 035 presente | sí | **sí** |
| Columna `locked_by` (034) | — | **1** |

Reproducible: dos ejecuciones independientes con resultado idéntico.

**Limitaciones, sin cambios respecto a §53:** es el dump de **una base**, no del
proyecto Supabase completo; 383 KB no dicen nada del tiempo sobre decenas de GB;
y **sigue pendiente repetirlo contra un backup real de producción**, que es lo
único que demostraría que *ese* backup es restaurable.

## 62. H-09 · Rate limiter fail-open — auditado y corregido

### 62.1 Implementación

`web/src/lib/rate-limit.ts`. Ventana deslizante persistida en
`smarttalk.rate_limit_hits`; ante cualquier error de base cae a un contador en
memoria. Consumidores: `/api/epayco/checkout` y `/api/billing/checkout`
(10/min por usuario), `/api/epayco/confirmation` (120/min por IP) y los cuatro
webhooks de canal (200/min por IP).

### 62.2 El riesgo, en tres partes encadenadas

**1. El fallback es por worker.** En serverless cada instancia tiene su propia
memoria, así que un límite de 200/min se convierte en 200×N. Y ocurre
precisamente cuando la base está degradada, es decir **cuando más falta hace
contener el tráfico**.

**2. El limitador amplifica la carga que debería contener.** Cada comprobación
hace `INSERT` + `COUNT` (y un tercer `SELECT` al bloquear) contra la misma base
que protege. Bajo ráfaga, el propio limitador aporta 2-3 consultas por petición.

**3. `rate_limit_hits` no la purgaba nadie.** Verificado: ninguna ruta, script
ni cron la limpia. La migración 013 creó el índice `idx_rate_limit_hit_at` con
el comentario «para la limpieza periódica»… que nunca se implementó.

Y aquí está lo importante: **los tres se realimentan**. La tabla crece → el
`COUNT` tarda más → sube la probabilidad de error → se activa el fail-open →
el límite efectivo se multiplica → entra más tráfico → la tabla crece más.

### 62.3 Corrección aplicada

**No se cambió a fail-closed, y es deliberado.** Cerrar el paso ante un fallo de
base tiraría confirmaciones de pago de ePayco y checkouts legítimos durante un
incidente: se perderían cobros. Es una decisión de negocio, no técnica, y no le
corresponde al agente tomarla.

Lo que sí se hizo, sin migración y sin cambiar la política:

| Cambio | Efecto |
|---|---|
| **Límite degradado** (`degradedLimit`) | Mientras el contador está en memoria, el límite se divide por `RATE_LIMIT_DEGRADED_DIVISOR` (por defecto **4**), nunca por debajo de 1. Con 4 instancias, N×(límite/4) se aproxima al límite pretendido |
| **Bandera `degraded`** en `RateLimitResult` | El llamador puede distinguir un resultado fiable de uno degradado |
| **Log estructurado** `rate_limit.degraded` | Antes era un `console.warn` con texto libre, inalertable. Ahora lleva `key`, `limit`, `degradedLimit` y `reason` |
| **`purgeRateLimitHits()`** | Borra hits fuera de retención (**1 h** por defecto; la ventana más larga en uso es de 60 s) |
| **`/api/cron/rate-limit-purge`** | Ruta protegida con `CRON_SECRET` que invoca la purga |

**La purga NO se invoca desde `rateLimit`**: añadir un `DELETE` al camino
caliente agravaría justo el problema 2. Hay una prueba que lo verifica.

> ⚠️ **La entrada en `vercel.json` NO se añadió a propósito.** Registrar el cron
> hace que empiece a ejecutarse en el primer despliegue, y esa es una decisión
> operativa de Codex. Sugerencia: `{"path": "/api/cron/rate-limit-purge",
> "schedule": "0 * * * *"}`. Mientras tanto la ruta existe y puede invocarse a
> mano con el `CRON_SECRET` durante un incidente.

### 62.4 Lo que esta corrección NO resuelve

Sigue sin haber **estado compartido** entre instancias durante la degradación:
con N workers el límite efectivo sigue siendo N×(límite/4). Acotarlo no es
eliminarlo. La solución de fondo sería un contador externo (Redis/Upstash) o un
`INSERT ... RETURNING count` en una sola ida y vuelta, y ambas cosas exceden lo
que se puede hacer sin infraestructura nueva o migración.

### 62.5 Pruebas (13 nuevas)

`resilience.test.ts` (+11): divisor por defecto y configurable; el límite nunca
baja de 1; divisor inválido no rompe; **con la base caída se aplica el límite
reducido y no el original**; la bandera `degraded`; la línea estructurada con
sus cuatro campos; con la base sana no se degrada ni se reduce; la purga borra
sólo fuera de retención; un fallo de borrado se reporta; la retención supera la
ventana en uso; y **la purga no se invoca desde el camino caliente**.

`rate-limit.test.ts` (+2, 1 actualizada): una prueba preexistente afirmaba el
contrato antiguo —con límite 2 el fallback permitía 2 peticiones— y **falló al
ejecutar**. Es el cambio de comportamiento buscado, así que se actualizó
dejándolo explícito, y se añadió una que compara ambos contratos.

## 63. `job_type` · consulta real, solo lectura

El conector de Supabase **no tiene proyectos vinculados** (`list_projects`
devuelve vacío): la instancia del proyecto es self-hosted
(`smartmedia-api.smartgenapp.com`), no un proyecto gestionado de `supabase.co`.

Se consultó con el cliente del propio proyecto desde un script efímero en el
scratchpad —**sólo `SELECT`**, sin insertar, actualizar ni borrar, y fuera del
repositorio para no dejar una herramienta que apunte a producción—.

**Resultado sobre `smarttalk.billing_outbox_jobs`:**

| Dato | Valor |
|---|---|
| Filas totales | **1** |
| Desglose | `send_notification | completed` : 1 |
| Filas con `job_type` distinto de `send_notification` | **0** |

### Decisión recomendada

**Estrechar el CHECK es seguro desde el punto de vista de los datos**: no existe
ni una sola fila de los cinco tipos sin handler, así que un
`CHECK (job_type IN ('send_notification'))` no rompería nada existente.

**No se creó la migración**, conforme a D-3 («no crear una migración
irreversible del CHECK hasta consultar si existen filas reales»). La consulta ya
está hecha; **la decisión sigue siendo tuya**. Dos caminos:

| Opción | A favor | En contra |
|---|---|---|
| **Estrechar el CHECK** | La base deja de admitir tipos que nadie procesa; el enum TS y el CHECK vuelven a coincidir | Irreversible para filas históricas; si el roadmap contempla renovación automática o conciliación, habrá que ensancharlo otra vez |
| **Mantenerlo** | Cero riesgo; el enum TS ya impide encolarlos desde la aplicación (§28) y un job inesperado va a `dead_letter` de forma controlada | La base sigue admitiendo valores que ningún código sabe procesar |

**Recomendación:** mantenerlo por ahora. La protección efectiva ya existe en el
tipo TypeScript y está cubierta por tres pruebas; estrechar el CHECK aporta poco
y cierra una puerta que el roadmap podría necesitar. Revisarlo cuando se decida
si esos cuatro flujos se implementan o se descartan definitivamente.

## 64. Resultados de esta iteración

| Comando | Resultado real |
|---|---|
| `npx vitest run` | **549 passed / 30 files**, 0 fallos |
| `npm test` | vitest 549 + node: 6 passed, 18 skipped |
| Suite PostgreSQL | **18 ejecutadas, 18 aprobadas** |
| `npm run lint` | **0 errores**, 168 warnings preexistentes |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | Compiled successfully; `/api/cron/rate-limit-purge` en el manifiesto |
| `git diff --check` | sin salida |

## 65. Archivos de la iteración 10

**Nuevos**

```
web/src/app/api/cron/rate-limit-purge/route.ts   # NO registrado en vercel.json (a propósito)
```

**Modificados**

```
web/src/lib/rate-limit.ts          (+104)  # límite degradado, bandera, log, purga
web/src/lib/rate-limit.test.ts     (+24)   # contrato actualizado + comparación
web/src/qa-e2e/resilience.test.ts  (+175)  # 11 casos de H-09
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md
```

**No se tocó:** ninguna migración, ningún secreto, `vercel.json` sin cambios.

## 66. Estado final de los hallazgos

| Hallazgo | Estado |
|---|---|
| H-01 · timeout ePayco | **Cerrado** |
| H-02 · rate limiting checkout | **Cerrado** |
| H-03 · idempotencia checkout | **Cerrado** |
| H-04 · `getEpaycoConfig()` | **Cerrado** |
| H-05 · `correlation_id` en logs | **Cerrado** (§59, tras cierre en falso en §51) |
| H-06 · ensayo de restauración | **Cerrado** ×2 (§53, §61) — falta con backup real |
| H-07 · rollback 031/032/035 | **Cerrado y ejecutado** |
| H-08 · PCI | Sin hallazgos |
| **H-09 · rate limiter fail-open** | **Cerrado con mitigación** (§62). El límite por instancia persiste: requiere estado compartido |
| H-10 · recuperación de webhooks | **Cerrado, desplegado y verificado en producción** (§60) |
| H-11 · dedup de la cola | **Revisado**: protección aguas abajo verificada |
| H-12 · downgrade programado | **Cerrado**: 18/18 en PostgreSQL, migración aplicada, UI avisando |

**Ningún hallazgo técnico queda abierto.**

## 67. Pendientes operativos (no de código)

| # | Pendiente | Quién decide |
|---|---|---|
| 1 | Registrar `/api/cron/rate-limit-purge` en `vercel.json` | Codex — aplicado y desplegado en producción |
| 2 | Repetir el ensayo de restauración con un **backup real de producción** | Operación |
| 3 | Decidir sobre el CHECK de `job_type` (§63) — recomendación: mantener | Negocio |
| 4 | Observar `webhook_recovery_summary` con un evento fallido real de producción, no sólo QA | Operación |
| 5 | Estado compartido para el rate limiter (Redis/Upstash) si se quiere cerrar H-09 del todo | Infraestructura |

## 68. Recomendaciones finales

1. **Desplegar el trabajo pendiente junto**: el aviso de downgrade en la UI y la
   purga horaria de rate limit. La 035 ya está aplicada, así que el aviso no miente.
2. **Vigilar dos líneas de log** tras el despliegue:
   `webhook_recovery_summary` (que `writeFailures` y `auditFailures` sigan en 0)
   y `rate_limit.degraded` (cuya aparición indica que la base falló).
3. **No cerrar H-06 en el checklist** hasta repetir el ensayo con un backup real:
   lo demostrado es que el procedimiento funciona, no que ese backup concreto sea
   restaurable.
4. **Revisar que la rama de trabajo despliegue a `target: production`** sin pasar
   por Preview. Sigue siendo la causa de que cada commit llegue a clientes
   reales, y es el mayor riesgo estructural que queda.

El commit, push y deploy de esta iteración quedan a cargo de Codex.

## 69. Estado consolidado de acciones y porcentaje — 2026-08-11

Porcentaje estimado por peso funcional y evidencia disponible; no equivale a
porcentaje de archivos escritos.

| Acción | Estado actual | Avance |
|---|---|---:|
| Migraciones de billing, cuotas, outbox, RLS y rollback | Aplicadas y probadas | **100%** |
| Compras sandbox ePayco: plan inicial, crecimiento y evidencia de rechazo/aprobación | Evidencias capturadas en QA | **100%** |
| Reactivación, renovación, upgrade y downgrade programado | Compra aprobada y cambio programado/aplicado por cron | **100%** |
| UI de facturación, uso, estado cancelado/activo y aviso de cambio futuro | Verificada visualmente en producción | **100%** |
| Concurrencia y límites de cuota | Suite PostgreSQL 18/18 y pruebas de resiliencia | **100%** |
| Outbox, idempotencia y recuperación de webhooks | Código desplegado; **worker real validado en QA 4/4** y logs sin fallos (§78) | **98%** — falta observar un evento fallido real de producción |
| Backup/restore | QA desechable restaurado sin errores **3 veces** (§72) | **90%** — falta un backup real de producción; **el agente no puede obtenerlo** (§72.2) |
| H-09: rate limiter degradado y retención | Mitigación + purga horaria desplegada, protegida y **ejecutada en producción** (§79) | **90%** — falta observar un `DELETE` real; Redis/Upstash queda para estado compartido |
| CHECK de `job_type` | Revisado contra datos reales; **recomendación formal: conservarlo amplio** (§74) | **90%** — falta decisión de negocio |
| **Avance general ponderado** | Sistema funcional y evidencia principal cerrada | **98%** |

> Matriz revisada en la iteración 11 (§§72-76). Los porcentajes que **no**
> subieron es porque dependen de accesos o decisiones fuera del alcance del
> agente, no de trabajo pendiente de código.

### Cierre de esta iteración

- Se añadió `/api/cron/rate-limit-purge` a `vercel.json` con frecuencia horaria.
- El endpoint exige `Authorization: Bearer $CRON_SECRET`, por lo que no queda
  expuesto públicamente sin autenticación.
- Deployment confirmado: `dpl_GECsNT6GWsJLoZ1JexzVCTP7AHD4`, estado `READY`,
  target `production`, alias `https://www.comunitymanager.io`.
- Validaciones HTTP realizadas: `/api/health` devuelve `200` y el nuevo cron sin
  `Authorization` devuelve `401` (`{"error":"Unauthorized"}`).
- Primera ejecución observada: HTTP `200`, `purged: 0`, retención de una hora.
- Queda como observación adicional verificar un `purged > 0` con un hit real
  fuera de retención; el cron está funcionando, pero aún no hubo una fila que
  eliminar.

## 70. Acciones que quedan fuera de código

1. Restaurar un backup real de producción en un entorno aislado.
2. Observar una recuperación de webhook con al menos un evento fallido real.
3. Decidir si el CHECK de `job_type` se mantiene amplio; la recomendación técnica
   actual es mantenerlo porque la tabla real ya contiene `send_notification`.
4. Si se exige cerrar H-09 al 100%, contratar/configurar Redis o Upstash y mover
   el contador a estado compartido entre instancias.

---
---

## 71. Evidencia de publicación — 2026-08-11

| Evidencia | Resultado |
|---|---|
| Commit publicado | `3f66be3 feat(rate-limit): schedule automatic hit purge` |
| Rama publicada | `codex/add-manual-contact` |
| Deployment | `dpl_GECsNT6GWsJLoZ1JexzVCTP7AHD4` |
| Target | `production` |
| Health | `200` |
| Cron sin credenciales | `401 Unauthorized` |
| Cron programado | `/api/cron/rate-limit-purge` cada hora |

Con esta publicación, la acción de código y despliegue queda en **100%**; las
acciones restantes son observaciones/decisiones operativas descritas en §70.

# Iteración 11 — 2026-08-11 · Cierre de §70 con acciones seguras

Las cuatro acciones de §70, ejecutadas hasta donde el acceso lo permite. **Una
de ellas no se pudo hacer y se explica por qué en vez de simularla.**

## 72. Backup real de producción — **NO EJECUTADO**

### 72.1 Lo que sí se hizo

Tercer ensayo del runbook sobre la base QA desechable, esta vez con el evento de
recuperación de §73 ya presente:

| Paso | Resultado |
|---|---|
| `pg_dump -Fc` | **383 KB, < 1 s**, sin errores |
| `pg_restore` en `qarestore3` | **0 errores** |

| Métrica | Origen | Restaurada |
|---|---:|---:|
| Tablas `smarttalk` | 52 | **52** |
| Funciones | 60 | **60** |
| Tablas con RLS | 51 | **51** |
| Policies | 68 | **68** |
| Índices | 145 | **145** |
| Migración 035 presente | sí | **sí** |

Tres ensayos independientes (§53, §61, §72) con resultado idéntico: el
procedimiento es reproducible.

### 72.2 Por qué NO se usó un backup real de producción

**No hay forma de obtenerlo desde este entorno.** Comprobado, no supuesto:

| Vía | Estado |
|---|---|
| Cadena de conexión Postgres en `.env.local` | **No existe.** Sólo hay `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que dan acceso a la API PostgREST, **no** a `pg_dump` |
| `.env.production` / `.env` | No existen en el repositorio |
| `/var/backups/stacks/` (RUNBOOK §5) | No existe en esta máquina: vive en el servidor donde corre el cron `backup-all-stacks.sh` |
| Conector MCP de Supabase | `list_projects` devuelve vacío: la instancia es self-hosted (`smartmedia-api.smartgenapp.com`), no un proyecto gestionado |

`pg_dump` necesita una conexión Postgres directa (host, puerto, usuario,
contraseña). La clave de servicio de Supabase **no sirve** para eso.

**Se descartó explícitamente** reconstruir un "backup" leyendo tablas por
PostgREST: eso no es un backup, y presentarlo como tal sería inventar evidencia.

### 72.3 Qué hace falta y quién puede hacerlo

Quien tenga acceso SSH al servidor:

```bash
# 1. En el servidor, tomar o localizar el dump
ls -la /var/backups/stacks/
# 2. Copiarlo a una máquina con Postgres 16
scp servidor:/var/backups/stacks/smartmedia_<fecha>.sql ./
# 3. Restaurar en una base DESECHABLE, nunca sobre producción
createdb restore_prueba
psql -d restore_prueba < smartmedia_<fecha>.sql
# 4. Ejecutar la verificación de docs/BACKUP_RESTORE_RUNBOOK.md §4
```

Hasta que eso ocurra, lo demostrado es que **el procedimiento funciona**, no que
**ese backup concreto sea restaurable**. H-06 se mantiene al 90%.

## 73. Recuperación con evento controlado — validación **a nivel SQL** ✅

Esta sección documenta la primera validación manual del contrato SQL. La
validación del worker real llegó después y está documentada en §78.

Nueva prueba **19** de la suite PostgreSQL, contra PostgreSQL 16.14 desechable y
dentro de `BEGIN … ROLLBACK`. **No se insertó nada en producción.**

> **Precisión importante.** Esta prueba reproduce las consultas del worker
> —selección, claim, liquidación— **escritas a mano en SQL**; no ejecuta el
> código del worker. Es una validación del *comportamiento esperado contra la
> base*, no del módulo. La ejecución del **worker real** llegó después: §78.

Escenario: la confirmación llegó y el evento se registró, pero la activación
falló con `atomic_activation_failed` — el caso que el worker debe recuperar.

| Fase verificada | Resultado |
|---|---|
| (a) La consulta del worker **selecciona** el evento (los cuatro filtros de §33.1) | ✅ 1 fila |
| (b) El **claim con lease** lo reclama | ✅ |
| (b') Un **segundo worker NO puede reclamarlo** con el lease vivo | ✅ 0 filas |
| (c) La liquidación reejecuta el RPC | ✅ suscripción **activa**, `suspended_at` limpio |
| (c') **Sin duplicar** la suscripción | ✅ 1 sola fila |
| (d) Cierre del evento y **liberación del lease** | ✅ `processed`, `locked_by` nulo |
| (e) La **auditoría de D-1** se escribe | ✅ `result = success` |

Esto cubre los componentes SQL/RPC del flujo que §60 dejaba pendientes: allí el
cron corría con `scanned: 0` porque no había eventos fallidos. La prueba no
invoca directamente `recoverFailedWebhookEvents`; por eso demuestra el contrato
de selección, lease, liquidación y auditoría contra PostgreSQL, pero no se
presenta como una prueba E2E del worker.

**Lo que sigue sin demostrarse:** el mismo camino con un evento fallido **real de
producción**. Provocar uno exigiría fabricar un fallo en un cobro real, y eso no
se hizo. En ese momento la evidencia justificaba 95%; §78 actualiza la matriz
a 98% porque ahora el worker real también fue ejecutado en QA.

## 74. `job_type` · recomendación formal: **conservar el CHECK amplio**

Consulta read-only ya realizada (§63) sobre `smarttalk.billing_outbox_jobs`:
**1 fila total**, `send_notification | completed`; **cero** filas de los cinco
tipos sin handler.

**Recomendación: mantener el CHECK como está.** Razones, en orden de peso:

1. **La protección efectiva ya existe y está en el sitio correcto.** El tipo
   `BillingOutboxJobType` sólo admite `send_notification`, así que ningún código
   de la aplicación puede encolar los otros cinco. Tres pruebas lo vigilan
   (§28), incluida una que afirma que **el único `job_type` que la aplicación
   encola es `send_notification`**.
2. **Estrechar un CHECK es irreversible para el histórico** y no aporta
   seguridad nueva: un job inesperado que llegase por SQL ya termina en
   `dead_letter` de forma controlada y probada.
3. **Cierra una puerta que el roadmap podría necesitar.** `renew_subscription`,
   `reconcile_payment`, `expire_subscription` y `apply_plan_change` describen
   flujos plausibles; si se implementan, habría que ensanchar el CHECK otra vez.
4. El beneficio —que enum y CHECK coincidan— es de coherencia, no de riesgo.

**Cuándo reconsiderarlo:** cuando se decida formalmente que esos cuatro flujos
**no** se van a implementar. Ahí sí conviene estrechar el CHECK y retirar la
constante `UNIMPLEMENTED_OUTBOX_JOB_TYPES`.

**No se creó ninguna migración**, conforme a D-3.

## 75. `/api/cron/rate-limit-purge` · desplegado y protegido — **VERIFICADO** ✅

Comprobado de forma independiente contra producción, sólo con peticiones de
lectura:

| Comprobación | Resultado |
|---|---|
| `GET` **sin** `Authorization` | **`401`** · `{"error":"Unauthorized"}` |
| `GET` con `Authorization: Bearer valor-incorrecto` | **`401`** · `{"error":"Unauthorized"}` |
| `GET /api/health` | `200` |
| Entrada en `vercel.json` | `{"path": "/api/cron/rate-limit-purge", "schedule": "0 * * * *"}` |

El endpoint **no queda expuesto**: exige el `CRON_SECRET` exacto, y un Bearer
incorrecto se rechaza igual que la ausencia de credenciales.

**Observado:** `rate_limit_purge_summary` con HTTP `200`, `purged: 0` y
`retentionMs: 3600000`. Sigue pendiente observar una ejecución con una fila
realmente expirada (`purged > 0`).

## 76. Resultados de la iteración 11

| Comando | Resultado real |
|---|---|
| `npx vitest run` | **549 passed / 30 files**, 0 fallos |
| `npm test` | vitest 549 + node: 6 passed, **19 skipped** |
| **Suite PostgreSQL** | **19 ejecutadas, 19 aprobadas**, sin residuos |
| `npm run lint` | **0 errores**, 168 warnings preexistentes |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | Compiled successfully |
| `git diff --check` | sin salida |

**Archivos modificados**

```
web/tests/postgres-integration.test.mjs   # caso 19: recuperación controlada
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md    # §69 actualizada + §§72-76
```

Ninguna migración, ningún secreto, ningún dato de producción tocado.

## 77. Qué queda pendiente, y de quién depende

| # | Pendiente | Bloqueado por | ¿Puede el agente? |
|---|---|---|---|
| 1 | Restaurar un **backup real de producción** en base desechable | Acceso SSH al servidor / credenciales Postgres | **No** — §72.2 |
| 2 | Ver una recuperación con un **evento fallido real** | Que ocurra un fallo real; no debe provocarse | **No** — sólo observar |
| 3 | Decidir sobre el **CHECK de `job_type`** | Roadmap de producto | **No** — recomendación en §74 |
| 4 | **Estado compartido** para el rate limiter (Redis/Upstash) | Contratar infraestructura | **No** |
| 5 | Observar una purga con `purged > 0` | Debe existir un hit QA con más de una hora | **No** — sólo observar |

**Ninguno de los cinco es trabajo de código pendiente.** Los cinco dependen de
accesos, infraestructura, decisiones de producto o del paso del tiempo. Esa es
la razón de que la matriz de §69 se quede en 98% y no llegue a 100%: subirla
exigiría inventar evidencia.

Sin commit, push ni deploy por parte del agente.

---
---

# Iteración 12 — 2026-08-11 · Worker real contra PostgreSQL

## 78. El worker real, ejecutado contra PostgreSQL ✅

§73 dejó una imprecisión que conviene no arrastrar: la prueba 19 reproduce las
consultas del worker **escritas a mano en SQL**, pero **no ejecuta el módulo**.
Validaba el comportamiento esperado, no el código.

Ahora sí se ejecuta el código de producción sin modificarlo.

### 78.1 Cómo

`src/qa-e2e/webhook-recovery-pg.test.ts` importa
`recoverFailedWebhookEvents` **tal cual** y lo corre contra la base desechable.
Lo único sustituido es el cliente Supabase: la base local no tiene PostgREST, así
que se inyecta `helpers/pg-supabase-adapter.ts`, un adaptador respaldado por
`pg` que implementa **exactamente** los métodos que el worker y sus dependencias
usan (`select/insert/update/delete`, `eq/neq/lt/lte/gt/gte/is/in/or`,
`order/limit`, `maybeSingle/single`, y `rpc`).

El adaptador **no** es un cliente Supabase completo, y eso es deliberado: si el
worker empieza a usar un método nuevo, falla ruidosamente en vez de devolver un
resultado silenciosamente incorrecto.

Se salta sin `QA_DATABASE_URL`, igual que la suite de `tests/`.

### 78.2 Resultado: 4/4

| Caso | Verifica |
|---|---|
| Recupera un evento fallido controlado | `scanned≥1`, `claimed≥1`, `recovered≥1`, `writeFailures=0`, `auditFailures=0`, `workerId` con su prefijo; evento `processed` con `last_error` nulo y **lease liberado**; **una sola** suscripción, `active`, `suspended_at` limpio; auditoría D-1 escrita con `result=success`; **sin pagos duplicados** |
| Segunda pasada | No reprocesa lo ya procesado |
| D-2 · conflicto de datos | Va a `dead_letter` con `review_required` y **la organización sigue activa** |
| D-1 · firma inválida | El evento **no se toca**: sigue `failed`, sin lease y con su `attempt_count` intacto |

### 78.3 Dos fallos reales que sólo aparecieron al ejecutar

**1. `payment_insert_failed` — montaje irreal de la prueba.** El primer intento
usaba una clave de evento distinta del `provider_transaction_id` del pago ya
registrado. El worker no encontraba el pago existente, intentaba insertar uno
nuevo y el índice único `(merchant_reference, attempt_number)` lo rechazaba.

El fallo era **del escenario, no del worker**: en una recuperación real el pago
ya existe con esa misma clave, porque lo creó el webhook original antes de que
fallara la activación. Corregido usando la clave real del pago.

Deja una observación útil: si llegase a recuperarse un evento **sin** su pago
previo y con otro pago ocupando la misma referencia, el worker reintenta y acaba
en `dead_letter`. Falla de forma segura, pero conviene saberlo.

**2. `qa_cleanup_fixtures` no podía borrar las organizaciones.**
`subscription_events.organization_id` es `ON DELETE RESTRICT`, así que borrar la
organización antes que sus dependientes falla con violación de FK.

**No se había visto nunca** porque la suite de `tests/` corre entera dentro de
`BEGIN … ROLLBACK` y nada se confirma. El worker real sí commitea, y ahí saltó.
Corregido: la limpieza ahora borra en orden —auditoría, outbox, eventos de
suscripción, pagos, suscripciones— y **sólo** de las organizaciones del fixture.

El guardián de `security-posture.test.ts` detectó a su vez que los `DELETE`
nuevos no llevaban el prefijo literal. Se ajustó para aceptar el acotamiento por
`= ANY(v_orgs)` **y** verificar que `v_orgs` sólo se puebla desde
`name LIKE '[QA-FIXTURE]%'`: sin esa segunda comprobación, la guarda se habría
debilitado.

## 79. `rate_limit_purge_summary` · primera ejecución observada ✅

Deployment `dpl_GECsNT6GWsJLoZ1JexzVCTP7AHD4` (commit `3f66be3`, production).

```
### 20:01:09 GET /api/cron/rate-limit-purge 200 [info/serverless]
[billing] rate_limit_purge_summary {"event":"rate_limit_purge_summary",
"correlation_id":"rate-limit-purge:batch","purged":0,"retentionMs":3600000,
"durationMs":193,"processedAt":"2026-08-11T20:01:09.985Z"}
```

| Campo | Valor |
|---|---|
| HTTP | **200** |
| `purged` | **0** |
| `retentionMs` | 3 600 000 (1 h) |
| `durationMs` | 193 |

**Lectura honesta:** `purged: 0` significa que **no había hits con más de una
hora** en ese momento, no que la purga borre correctamente. Lo demostrado es que
el cron se ejecuta, está autorizado y emite su resumen. Que el `DELETE` elimine
filas reales está cubierto por prueba unitaria, no por esta observación.

## 80. Checklist · restaurar un backup **real** de producción

Requiere acceso que el agente no tiene (§72.2). Para quien lo tenga:

- [ ] **1. Localizar el dump.** `ssh <servidor>` → `ls -la /var/backups/stacks/`
      (cron diario `backup-all-stacks.sh`, rotación 7 días, `RUNBOOK.md §5`).
- [ ] **2. Anotar los cinco datos** del runbook §2: fecha/hora UTC, base y host
      de origen, tamaño, duración, responsable.
- [ ] **3. Copiar a una máquina con PostgreSQL 16.** El `pg_dump` debe ser de la
      **misma versión mayor** que el servidor de origen.
- [ ] **4. Crear una base DESECHABLE.** `createdb restore_prueba`. **Nunca**
      restaurar sobre producción ni sobre la QA compartida.
- [ ] **5. Restaurar.** `psql -d restore_prueba < <dump>.sql` (o `pg_restore`
      si es formato custom). Anotar duración y errores.
- [ ] **6. Comparar las seis métricas** de `BACKUP_RESTORE_RUNBOOK.md §4`:
      tablas, funciones, tablas con RLS, policies, índices y filas de
      `subscriptions`/`payments`.
- [ ] **7. Verificación funcional.** Que `finalize_epayco_approved_payment`
      contenga `plan_downgrade_scheduled` (migración 035 presente).
- [ ] **8. Comprobar `TOKEN_ENCRYPTION_KEY`.** **No viaja en el dump.** Sin ella
      los tokens cifrados son irrecuperables aunque la base se restaure entera.
      Confirmar que está respaldada **fuera** de la base.
- [ ] **9. Registrar el resultado** en `BACKUP_RESTORE_RUNBOOK.md §5` junto a
      los tres ensayos ya documentados.
- [ ] **10. Destruir la base de prueba** y el dump copiado.

**Criterio de cierre de H-06:** los pasos 6 y 7 en verde sobre un dump de
producción. Hasta entonces lo demostrado es que *el procedimiento* funciona
—tres veces—, no que *ese backup* sea restaurable.

## 81. Checklist · estado compartido para el rate limiter (cerrar H-09)

La mitigación actual acota el problema pero no lo elimina: con N instancias
degradadas el límite efectivo sigue siendo N×(límite/4). Cerrarlo requiere un
contador fuera del proceso.

- [ ] **1. Elegir proveedor.** Upstash Redis encaja mejor con Vercel: es
      serverless, se factura por petición y no exige gestionar conexiones.
      Alternativa: cualquier Redis con REST.
- [ ] **2. Dimensionar.** Una petición por comprobación de rate limit. Estimar
      con el volumen actual de `/api/webhook/*` (200/min por IP como techo) y
      de checkout.
- [ ] **3. Variables nuevas** (no existen hoy): `UPSTASH_REDIS_REST_URL` y
      `UPSTASH_REDIS_REST_TOKEN`. Cargarlas en Vercel; **no** con prefijo
      `NEXT_PUBLIC_`.
- [ ] **4. Implementar el backend** detrás de la interfaz actual: `rateLimit`
      ya devuelve `RateLimitResult`, así que basta con añadir un backend
      `"redis"` junto a `"db"` y `"memory-fallback"`. **No cambiar la firma.**
- [ ] **5. Usar la primitiva atómica correcta:** `INCR` + `EXPIRE` en una
      transacción, o el algoritmo de ventana deslizante con `ZADD`/`ZREMRANGEBYSCORE`.
      Una lectura seguida de escritura no atómica reintroduce la carrera.
- [ ] **6. Orden de fallback:** Redis → base de datos → memoria. Así una caída
      de Redis no es peor que la situación actual.
- [ ] **7. Pruebas:** las mismas 13 de H-09, más una de dos "instancias"
      compartiendo contador —que hoy es justo lo que no se puede probar—.
- [ ] **8. Retirar o conservar la purga.** Con Redis y TTL, `rate_limit_hits`
      deja de ser el camino caliente; el cron de purga puede espaciarse o
      retirarse.
- [ ] **9. Medir antes y después:** latencia p95 de `/api/webhook/*` y consultas
      por segundo contra la base.

**Criterio de cierre de H-09:** dos instancias concurrentes respetando un único
límite compartido, demostrado con prueba.

## 82. Resultados de la iteración 12

| Comando | Resultado real |
|---|---|
| `npx vitest run` (sin `QA_DATABASE_URL`) | **549 passed, 4 skipped / 31 files**, 0 fallos |
| `npx vitest run src/qa-e2e/webhook-recovery-pg.test.ts` **con** `QA_DATABASE_URL` | **4 passed** — worker real contra PostgreSQL |
| Suite PostgreSQL (`qa-postgres-suite.mjs`) | **19 ejecutadas, 19 aprobadas**, sin residuos |
| `npm test` | vitest + node: 6 passed, 19 skipped |
| `npm run lint` | **0 errores**, 168 warnings preexistentes |
| `npx tsc --noEmit \| grep '^src/'` | sin salida |
| `npm run build` | Compiled successfully |
| `git diff --check` | sin salida |

### Revisión de crons y secretos

| Cron | `CRON_SECRET` | En `vercel.json` |
|---|:--:|:--:|
| `billing-lifecycle` · `billing-outbox` · `billing-webhook-recovery` | ✅ | ✅ |
| `rate-limit-purge` · `reap-scheduled` · `refresh-tokens` · `release-contact-overage` | ✅ | ✅ |

**7 de 7** protegidos y registrados. Sin valores de secreto embebidos en el
código —los únicos literales son sintéticos, en archivos de prueba— y ningún
secreto expuesto bajo `NEXT_PUBLIC_`.

## 83. Archivos de la iteración 12

**Nuevos**

```
web/src/qa-e2e/webhook-recovery-pg.test.ts        # worker real contra PostgreSQL
web/src/qa-e2e/helpers/pg-supabase-adapter.ts     # adaptador pg con la superficie de supabase-js
```

**Modificados**

```
web/supabase/qa/001_qa_lifecycle_fixtures.sql     # limpieza en orden de FK
web/src/qa-e2e/security-posture.test.ts           # guarda ajustada sin debilitarla
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md            # §§69-73 ordenadas y corregidas
```

Ninguna migración, ningún secreto, ningún dato de producción tocado.

## 84. Qué queda pendiente

| # | Pendiente | Bloqueado por | Checklist |
|---|---|---|---|
| 1 | Restaurar un **backup real de producción** | Acceso SSH al servidor | §80 |
| 2 | Observar recuperación con un **evento fallido real** | Que ocurra; no debe provocarse | — |
| 3 | Decidir sobre el **CHECK de `job_type`** | Roadmap de producto | §74 |
| 4 | **Estado compartido** para el rate limiter | Contratar infraestructura | §81 |
| 5 | Ver la purga borrando **filas reales** | Que haya hits de más de 1 h | — |

Los cinco dependen de accesos, infraestructura, decisiones de producto o del
paso del tiempo. **Ninguno es trabajo de código pendiente.**

Sin commit, push ni deploy por parte del agente.

---

# Iteración 13 · Aislamiento visual por marca en el Inbox

## 85. Qué se pedía y qué principio lo gobierna

El Inbox mostraba el canal de cada conversación, pero no la **marca**. Con
varias marcas conectadas al mismo tipo de canal, dos tarjetas «WhatsApp Ventas»
son indistinguibles: el asesor no sabe en nombre de quién está respondiendo.

El requisito tiene dos mitades que conviene no confundir, porque se validan de
forma distinta:

| | Qué es | Dónde vive | Cómo se prueba |
|---|---|---|---|
| **Presentación** | Ver el nombre de la marca y poder acotar la vista | Componentes React | Lógica pura + estructura |
| **Autorización** | Qué marcas *puede* ver ese usuario | Rutas de API | Ejecutando las rutas reales |

**El filtro nuevo no autoriza nada.** Es una comodidad visual. Quien decide el
alcance sigue siendo `getAgentBrandIds()` en el backend, y ante un `brandId`
ajeno la ruta responde 403 aunque la interfaz nunca haya ofrecido esa opción.
Esa separación está escrita en la cabecera de `brand-display.ts` para que no se
pierda en la próxima refactorización.

Segundo principio, también fijado por prueba: **la marca se identifica por
`brand_id`, jamás por el nombre del canal.** Deducirla del nombre daría una
etiqueta plausible y equivocada, que es la peor clase de error en una interfaz
multimarca.

## 86. Alcance por rol, tal como quedó verificado

| Rol / situación | `getAgentBrandIds()` | Marcas visibles | Conversaciones |
|---|---|---|---|
| `agency_user` | `null` (sin restricción) | Todas las de **su** organización | Todas las de su organización |
| Super admin | `null` | Todas las de su organización | Todas |
| `brand_admin` | `[su marca]` | Sólo la suya | Sólo la suya |
| `brand_advisor` | `[…asignaciones]` | Sólo `brand_advisor_assignments` | Sólo esas |
| Con alcance por marca y **sin asignaciones** | `[]` | Ninguna | **Cero** (`{conversations: [], nextCursor: null}`) |
| Cualquiera, pidiendo `brandId` ajeno | — | — | **403 «No autorizado para esta marca»** |

Un matiz que la prueba fija explícitamente: las asignaciones se leen filtrando
también por `organization_id`, así que una asignación de **otra** organización
no amplía el alcance. El asesor huérfano del fixture tiene una asignación en
`org-ajena` y aun así ve cero marcas y cero conversaciones.

## 87. Un defecto real que apareció al ejecutar

Escribiendo las pruebas contra la ruta real —no contra una copia de su lógica—
la primera ejecución devolvió **una sola conversación** donde debía devolver
tres. La causa no era el alcance por marca:

```ts
// antes
const rawLimit = Number(searchParams.get("limit"));
const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;
```

`searchParams.get("limit")` devuelve `null` cuando el parámetro no viene, y
`Number(null)` es **`0`**, no `NaN`. `Number.isFinite(0)` es `true`, así que la
rama del `30` por defecto era **inalcanzable** y el clamp dejaba `limit = 1`:
la ruta paginaba de una en una y devolvía un `nextCursor` en cada respuesta.

No se veía en producción por casualidad: el único consumidor
(`useConversations`) manda siempre `limit=50`. Cualquier otro llamador —una
integración, una prueba manual con `curl`— habría recibido una sola fila.

Corregido en `src/app/api/inbox/conversations/route.ts` distinguiendo «no vino»
de «vino un cero», con dos pruebas de regresión: sin `limit` la página es la del
contrato, y `limit` inválido (`0`, `-5`, `abc`) cae al valor por defecto en vez
de a 1.

## 88. Archivos

**Nuevos**

```
web/src/lib/inbox/brand-display.ts             # etiqueta, fallback y opciones del filtro (lógica pura)
web/src/app/api/inbox/brands/route.ts          # GET marcas permitidas — sólo id y name
web/src/hooks/useInboxBrands.ts                # React Query sobre /api/inbox/brands
web/src/components/inbox/BrandTag.tsx          # etiqueta reutilizable, con data-brand-id
web/src/qa-e2e/inbox-brand-visibility.test.ts  # 31 pruebas del requisito
```

**Modificados**

```
web/src/app/api/inbox/conversations/route.ts   # corrección del limit por defecto (§87)
web/src/stores/inbox.ts                        # estado brandFilter + setBrandFilter
web/src/hooks/useConversations.ts              # brandFilter → ?brandId= y queryKey
web/src/components/inbox/ConversationFilters.tsx # selector «Marca» (siempre visible)
web/src/components/inbox/InboxChannelsBar.tsx  # marca en cada tarjeta de canal
web/src/components/inbox/ConversationItem.tsx  # marca junto al canal en la lista
web/src/components/inbox/ChatWindow.tsx        # marca en el encabezado del chat abierto
web/AGENT_NEXT_PHASE_IMPLEMENTATION.md         # esta sección
```

Sin migraciones nuevas, sin tocar RLS, sin tocar secretos.

### Por qué el filtro acabó en `ConversationFilters` y no en `InboxChannelsBar`

Primero se colocó en la barra de canales, junto a los chips de canal. Al
revisar `InboxClient` resultó que esa barra se renderiza tras
`{showTopPanel && …}`: un filtro obligatorio habría quedado oculto por defecto.
Se movió a `ConversationFilters`, que se renderiza siempre encima de la lista.
**El filtro de canal se conserva** tal como estaba, en la barra superior.

## 89. Pruebas ejecutadas

`src/qa-e2e/inbox-brand-visibility.test.ts` — **31 pruebas, 31 en verde.**

Las de alcance corren contra las **rutas reales** (`/api/inbox/brands`,
`/api/inbox/conversations`, `/api/inbox/channels`) con el Supabase en memoria de
QA; no reimplementan la lógica de la ruta.

| Prueba obligatoria | Cómo se validó | Resultado |
|---|---|---|
| `agency_user` ve todas sus marcas | GET `/api/inbox/brands` → las 3 de su org, ninguna ajena | ✅ |
| `brand_admin` sólo ve la suya | GET `/api/inbox/brands` → `[Marca A]` | ✅ |
| `brand_advisor` sólo ve sus asignaciones | GET `/api/inbox/brands` → sus 2 marcas | ✅ |
| Sin asignación, cero conversaciones | GET `/api/inbox/conversations` → `{conversations: [], nextCursor: null}` | ✅ |
| `brandId` no autorizado → 403 | Asesor pide `brandId` de Marca A | ✅ 403 «No autorizado para esta marca» |
| Nombre en canal, conversación y chat | `brand-display` + estructura de los 3 componentes | ✅ |

Cobertura añadida más allá del mínimo pedido:

- Filtrar por una marca **propia** acota de verdad el resultado a esa marca.
- Un `brandId` de **otra organización** no devuelve filas ni siquiera a un
  `agency_user` sin restricción: la consulta sigue anclada a `organization_id`.
- La **búsqueda** no amplía el alcance (requisito 12).
- Los canales llegan con su `brand_id` y el asesor sólo recibe los suyos.
- La whitelist `CHANNEL_PUBLIC_COLUMNS` incluye `brand_id` y **no** contiene
  `access_token`, `page_access_token`, `webhook_verify_token` ni `app_secret`.
- Fallback: nombre nulo, nombre en blanco y marca no devuelta por la API dan
  `Marca no disponible · <8 primeros caracteres del id>`; sin `brand_id`, `Sin marca`.
- El selector sólo ofrece lo que devolvió la API, ordenado con `localeCompare("es")`.
- Cambiar de marca suelta la conversación abierta (podría ser de la marca
  anterior y quedaría visible fuera de su filtro).
- Ningún componente deduce la marca de `channel.name` ni de `channel.type`.

### Suite completa

```
npm test    → Test Files 31 passed | 1 skipped (32)
              Tests 580 passed | 4 skipped (584)
              node --test: 25 tests, 0 fail (19 skipped: requieren PG)
npm run lint → ✖ 168 problems (0 errors, 168 warnings)   ← warnings preexistentes; 0 en los archivos nuevos
npm run build → compilado sin errores, todas las rutas generadas
```

## 90. Evidencia de que el filtro es sólo visual

Tres hechos comprobables, no una afirmación:

1. **La ruta rechaza lo que la interfaz nunca ofreció.** La prueba del 403 pide
   `brandId` de Marca A con la sesión de un asesor que sólo tiene B y C. El
   selector jamás mostró Marca A; el 403 lo emite igualmente
   `/api/inbox/conversations`, no el cliente.
2. **Sin filtro, el alcance ya está acotado.** Las pruebas de `brand_admin` y
   `brand_advisor` llaman a la ruta **sin** `brandId`. Aun así reciben sólo sus
   marcas, porque el `.in("brand_id", assignedBrandIds)` lo aplica el servidor.
3. **El catálogo del selector lo decide el servidor.** `/api/inbox/brands`
   aplica `getAgentBrandIds()` antes de consultar `cm_clients` y corta en seco
   con `{brands: []}` cuando el usuario tiene alcance por marca sin
   asignaciones. `brandFilterOptions()` no inventa opciones: mapea lo recibido.

Dicho al revés: si alguien manipulara el `<select>` en el navegador para enviar
un `brandId` ajeno, recibiría 403. Y si desactivara el filtro por completo,
seguiría viendo sólo sus marcas.

## 91. Qué **no** se validó, y por qué

- **No hay pruebas de DOM.** El proyecto no tiene `jsdom` ni
  `@testing-library/react`, y no se instalaron dependencias nuevas. La
  presencia de la marca en los tres puntos se verifica sobre la lógica pura
  (`brandLabel`) y sobre el código de los componentes: que rendericen
  `<BrandTag brandId={…brand_id}>` y consuman `useInboxBrands`. Es verificación
  **estructural**, no un render real. La misma limitación ya declarada en §5.
- **No se ejecutó contra PostgreSQL real.** El Supabase en memoria no proyecta
  columnas, así que «la ruta no devuelve `access_token`» se comprueba sobre la
  whitelist del código fuente, no sobre una respuesta real.
- **No se pudo completar la prueba visual autenticada desde Codex.** El segundo
  despliegue de producción quedó realizado por Codex
  (`dpl_AM6LN2oKQAcce9vCQtYDpQzYeRNi`), el healthcheck respondió `200` y
  `/api/inbox/brands` respondió `401` sin sesión. La captura aportada por el
  usuario sí permitió identificar el fallo visual y corregirlo (§94); queda
  refrescar el Inbox autenticado para confirmar el resultado final en pantalla.
- `/api/inbox/conversations/bulk-close` y `/api/inbox/contacts/search` **no**
  aplican alcance por marca. No es un hallazgo: son endpoints operativos
  protegidos por `CRON_SECRET`, sin sesión de usuario, fuera del recorrido del
  Inbox. Se deja anotado por si algún día se exponen a la interfaz.

## 92. Matriz de avance actualizada

Reemplaza a la de §69 en la fila nueva; el resto se mantiene.

| Frente | Estado | Avance |
|---|---|---|
| Migraciones de billing, cuotas, outbox, RLS y rollback | Aplicadas y probadas | **100%** |
| Compras sandbox ePayco | Evidencias capturadas en QA | **100%** |
| Reactivación, renovación, upgrade y downgrade programado | Cerrado por cron | **100%** |
| UI de facturación y estados | Verificada en producción | **100%** |
| Concurrencia y límites de cuota | Suite PostgreSQL 18/18 | **100%** |
| **Aislamiento visual por marca en el Inbox** | **31/31 pruebas; alcance validado contra las rutas reales; corrección desplegada** | **95%** — falta confirmación final tras refrescar el navegador autenticado |
| Outbox, idempotencia y recuperación de webhooks | Worker real validado en QA 4/4 (§78) | **98%** |
| Backup/restore | QA desechable restaurado 3 veces (§72) | **90%** |
| H-09: rate limiter y retención | Purga desplegada y ejecutada (§79) | **90%** |
| CHECK de `job_type` | Recomendación formal: conservarlo (§74) | **90%** |
| **Avance general ponderado** | | **98%** |

La fila nueva no llega al 100% por una sola razón, y conviene que quede
explícita: **falta confirmar la etiqueta en pantalla con una sesión autenticada.**
La lógica, el alcance y el despliegue ya están verificados; queda comprobar
visualmente que la marca se lea bien en la tarjeta, en la conversación y en el
encabezado, y que el selector se vea correctamente en la columna de filtros.

### 93. Publicación realizada por Codex

- Commit: `5f94bd4 feat(inbox): add brand filtering and visibility scope`.
- Rama publicada: `codex/add-manual-contact`.
- Deploy de producción inicial: `dpl_dxyH5yw96bxq2hhSBYnPRQttRSQz`.
- Deploy de corrección: `dpl_AM6LN2oKQAcce9vCQtYDpQzYeRNi`.
- Alias activo: `https://www.comunitymanager.io`.
- `GET /api/health`: `200`.
- `GET /api/inbox/brands` sin sesión: `401 No autenticado` (comportamiento
  esperado; no expone el catálogo de marcas públicamente).

### 94. Diagnóstico de la captura y corrección aplicada

La captura mostró dos síntomas relacionados:

1. El Inbox sí tenía `brand_id` en las conversaciones (`b44e96b1…` y
   `1ebd1ea3…`), pero el selector decía «Sin marcas asignadas» y las etiquetas
   mostraban «Marca no disponible». El login local no siempre hidrata una
   sesión Supabase en el navegador; `useInboxBrands` y `useConversations`
   dependían de `useCurrentAgent` del cliente y por eso no ejecutaban las rutas
   API autenticadas por servidor. Ahora ambos hooks consultan la API usando la
   sesión real de la ruta, sin ese bloqueo cliente.
2. Los logs mostraron `column conversations.channel_type does not exist` al
   abrir mensajes o actualizar conversaciones. `channel_type` no es una
   columna de `conversations`: el tipo real está en `channels.type`. Ahora
   `getAccessibleConversation` obtiene la relación `channels(type)` y expone
   `channel_type` normalizado para los consumidores existentes.

En los datos QA, los IDs de la captura corresponden a `[QA] Marca Limite 02`
y `[QA] Marca Limite 03`; después de un refresco deben aparecer esos nombres
en el selector y en las etiquetas. No requiere migración ni cambio de datos.
