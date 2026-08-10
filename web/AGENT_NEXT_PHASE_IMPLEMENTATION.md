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
