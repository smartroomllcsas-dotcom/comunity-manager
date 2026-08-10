# Implementación de la siguiente fase — P0/P1 de ciclo de vida, outbox, contract tests y multicanal

Fecha: 2026-08-10
Rama: `codex/add-manual-contact`
Documento hermano: `web/AGENT_NEXT_PHASE_AUDIT.md` (auditoría que originó este trabajo)

## Qué NO se hizo

- No se tocó Production, ni secretos, ni DNS, ni variables de Vercel/Supabase.
- No se ejecutó ninguna migración contra ninguna base. La migración nueva se
  entrega **sin aplicar** (§4).
- No hay commit, push, PR ni deploy. Los cambios están solo en el árbol de
  trabajo de esta rama.
- No se usó ninguna credencial real de proveedor: todas las claves de las
  pruebas son sintéticas y se fijan dentro del proceso de test.
- No se creó ni borró dato alguno.
- `CHECKLIST_PRUEBAS_PENDIENTES.md` y `PLAN_TRABAJO_CODEX_AGENTE.md` quedaron
  intactos.

---

## 1. Resultados de ejecución

| Comando | Resultado |
|---|---|
| `npx vitest run` | **334 passed / 26 files**, 0 fallos |
| `node --test --experimental-strip-types tests/*.test.mjs` | 13 tests: **6 passed, 7 skipped** (los 7 son el arnés PostgreSQL, que se salta sin `QA_DATABASE_URL`) |
| `npm run lint` | **0 errores**, 168 warnings — todos preexistentes; no se añadió ninguno |
| `npx tsc --noEmit` | **0 errores en `src/`**. Los 11 errores reportados están en `.next/dev/types/validator.ts`, un artefacto generado y obsoleto; se verificó que son idénticos con los cambios revertidos (`git stash`) |
| `npm run build` | **Compiled successfully**; `/api/billing/cancel` y `/api/billing/resume` aparecen en el manifiesto de rutas |

Pruebas nuevas aportadas: **147** (de 187 previas a 334).

| Archivo de prueba | Casos |
|---|---:|
| `src/qa-e2e/channel-webhooks.test.ts` | 41 |
| `src/qa-e2e/payment-contracts.test.ts` | 40 |
| `src/qa-e2e/subscription-cancel.test.ts` | 18 |
| `src/lib/billing/subscription-ui.test.ts` | 15 |
| `src/qa-e2e/subscription-transitions.test.ts` | 13 |
| `src/lib/billing/outbox-contract.test.ts` | 12 |
| `src/qa-e2e/resilience.test.ts` | 8 |
| `tests/postgres-integration.test.mjs` | 7 (skipped sin base desechable) |

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
- **Períodos vencidos:** el RPC ya arranca en `NOW()` salvo que la suscripción
  esté `active` con período futuro, así que una reactivación nunca hereda un
  período vencido. Esto **no está verificado en ejecución** — ver §4 y §7.

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

## 4. Migración 033 — entregada sin aplicar

`supabase/migrations/20260810000100_033_subscription_reactivation.sql`

**Problema.** El RPC selecciona la suscripción a reactivar con
`status IN ('trial','active','past_due','suspended')`. Falta `'cancelled'`, así
que un cliente que canceló y vuelve a pagar entra por la rama `ELSE` e **inserta
una suscripción nueva**: la organización queda con dos filas.

**Cambio.** Una sola línea: añadir `'cancelled'` al `SELECT ... FOR UPDATE`. El
resto del cuerpo ya es correcto para reactivar (período desde `NOW()`, limpieza
de `grace_ends_at`/`suspended_at`/`cancelled_at`, evento registrado).

**Advertencias que Codex debe resolver antes de aplicarla:**

1. **La aplicación SQL fue confirmada por el propietario** con `Success. No
   rows returned`. El arnés funcional PostgreSQL
   (`tests/postgres-integration.test.mjs`) todavía se salta sin
   `QA_DATABASE_URL`, por lo que falta comprobar el comportamiento con una
   transacción real de pago sandbox.
2. **Es una decisión de negocio no documentada.** Reutilizar la fila cancelada
   frente a conservarla como histórico y crear una nueva son dos políticas
   válidas. Se implementó la reutilización porque evita el estado ambiguo de dos
   suscripciones simultáneas, pero el repositorio no contiene la regla. Si el
   negocio prefiere el histórico, esta migración debe descartarse.
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
