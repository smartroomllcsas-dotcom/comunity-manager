# Auditoría de la siguiente fase — pendientes P0 / P1 / P2

Fecha: 2026-08-09
Rama analizada: `codex/add-manual-contact`
Alcance: **solo lectura y documentación**. No se ejecutó ningún cambio en
código, migraciones, variables, Production ni la organización QA. No se crearon
ni borraron datos. No hay commit, push, PR ni deploy asociado a este archivo.

Este documento **no reemplaza** `CHECKLIST_PRUEBAS_PENDIENTES.md` ni
`PLAN_TRABAJO_CODEX_AGENTE.md` (ninguno fue modificado). Es el detalle técnico
de los pendientes que allí figuran abiertos en P0, P1 y P2.

## Cómo leer las fichas

Cada hallazgo usa el mismo bloque:

- **Estado actual** — qué existe hoy en el repositorio, verificado por lectura.
- **Archivo o ruta** — evidencia con `archivo:línea` cuando aplica.
- **Riesgo** — qué puede fallar en producción si se deja como está.
- **Prueba sugerida** — el experimento reproducible que cierra el punto.
- **Resultado esperado** — criterio de aceptación observable.
- **Prioridad** — P0 bloquea salida comercial, P1 es gate previo a cobros
  reales, P2 es endurecimiento posterior.

---

## Resumen ejecutivo

| # | Bloque | Hallazgos abiertos | Prioridad máxima |
|---|---|---:|---|
| 1 | Ciclo de vida de suscripciones | 8 | P0 |
| 2 | Contract tests ePayco / Wompi / PayU | 7 | P0 |
| 3 | E2E multicanal (FB / IG / WA) | 5 | P1 |
| 4 | Seguridad y resiliencia | 8 | P1 |
| 5 | Aislamiento QA | 5 | P0 |

Tres hallazgos elevan el riesgo por encima de lo que reflejaba el checklist:

1. **PayU publica una `confirmationUrl` hacia una ruta inexistente**
   (`/api/webhooks/payments/payu`). No hay ningún handler de confirmación
   para PayU ni para Wompi; solo ePayco tiene webhook implementado.
   Mitigado hoy porque `isActivationReady()` devuelve `false` en ambas
   pasarelas y el checkout responde `409`, pero el gate es una sola línea de
   código, no una barrera de configuración. Ver 2.2 y 2.3.
2. **El outbox solo implementa `send_notification`.** Los tipos
   `apply_plan_change`, `expire_subscription`, `renew_subscription` y
   `reconcile_payment` están declarados pero cualquier job encolado con ellos
   lanza excepción y termina en `dead_letter` tras 5 intentos. Ver 1.7.
3. **No existe reactivación ni cancelación de cara al cliente.** La única
   transición manual disponible es `PATCH /api/admin/subscriptions` con
   super admin, que escribe `status` sin validar la transición ni registrar
   `subscription_events`. Ver 1.2 y 1.6.

---

# 1. Ciclo de vida de suscripciones

## Mapa de estados implementado

Estados válidos en `smarttalk.subscriptions.status`:
`trial | active | past_due | cancelled | suspended`.

```
                    pago aprobado (RPC finalize_epayco_approved_payment)
  (sin registro) ─────────────────────────────────────────────► active
                                                                  │
   period_end vencido + cancel_at_period_end=false (cron)          │
  active ──────────────────────────────────────────────────► past_due
                                                                  │
   grace_ends_at vencido (cron)                                    │
  past_due ─────────────────────────────────────────────────► suspended
                                                                  │
   period_end vencido + cancel_at_period_end=true (cron)           │
  active ──────────────────────────────────────────────────► cancelled

  suspended / cancelled ──► active   SOLO vía nuevo pago aprobado (RPC)
                                     o PATCH admin sin validación
```

Superficies que participan:

| Pieza | Ruta / archivo | Rol |
|---|---|---|
| Cron de ciclo de vida | `web/src/app/api/cron/billing-lifecycle/route.ts` | `active→past_due`, `active→cancelled`, `past_due→suspended` |
| Programación del cron | `web/vercel.json:22-25` | `15 4 * * *` (diario) |
| Activación por pago | `web/supabase/migrations/20260729000200_010_multi_gateway_manual_renewal.sql:180` | RPC `finalize_epayco_approved_payment` |
| Efecto sobre acceso | `web/src/lib/billing/service.ts:140-174` | `isSubscriptionUsable()` |
| Lectura de estado (UI) | `web/src/app/api/billing/status/route.ts` | Banner y estado en `/settings/billing` |
| Cambio de plan (UI) | `web/src/app/(dashboard)/settings/billing/page.tsx:387` | Bloque "Cambiar plan" → nuevo checkout |
| Transición manual | `web/src/app/api/admin/subscriptions/route.ts:23-34` | `PATCH` de super admin |
| Bitácora | `smarttalk.subscription_events` | Solo escrita por el cron y el RPC |

Pruebas existentes: `web/src/qa-e2e/subscription-lifecycle.test.ts` — 3 bloques
(`it.each` de 7 casos de acceso + 2 casos del cron). Cubre acceso por estado y
las tres transiciones automáticas contra un Supabase en memoria.

---

### 1.1 Cambio de plan — no hay prorrateo ni validación de downgrade

- **Estado actual.** El cambio de plan es un checkout nuevo. `POST /api/billing/checkout`
  marca `purpose = organization.plan_id === plan.id ? "renewal" : "initial"`
  y, al aprobarse, el RPC hace `UPDATE ... SET plan_id = v_checkout.plan_id`
  sobre la suscripción existente. El nuevo período arranca en
  `current_period_end` si la suscripción está `active` y vigente; en caso
  contrario arranca en `NOW()`. No existe cálculo de crédito, prorrateo ni
  registro del plan anterior fuera de `subscription_events.metadata`.
  Tampoco se valida que el uso actual quepa en el plan destino.
- **Archivo o ruta.** `web/src/app/api/billing/checkout/route.ts:227-244`;
  `web/supabase/migrations/20260729000200_010_multi_gateway_manual_renewal.sql:262-300`;
  UI en `web/src/app/(dashboard)/settings/billing/page.tsx:387-480`.
- **Riesgo.** Un downgrade deja la organización por encima del límite del plan
  nuevo de forma silenciosa. Con `BILLING_ENFORCEMENT_MODE=hard` las altas
  siguientes se rechazan con `402`, pero los recursos ya creados permanecen
  visibles y facturados por debajo de lo contratado. Un upgrade a mitad de
  período no acredita lo pagado, lo que es una disputa de cobro real.
- **Prueba sugerida.** En una cuenta no productiva con plan Inicial al 100 % de
  contactos, comprar el plan Crecimiento en sandbox y verificar
  `subscriptions.plan_id`, `current_period_start/end`, `plan_entitlements`
  aplicados y el conteo mostrado en `/settings/billing`. Repetir en sentido
  inverso (Crecimiento → Inicial) con el uso por encima del límite destino.
- **Resultado esperado.** Upgrade: límites nuevos activos de inmediato,
  período extendido desde `current_period_end`, un solo `subscription_event`
  con `reason=payment_approved`. Downgrade: decisión documentada — o se bloquea
  el checkout con un código explícito, o se acepta y se registra el excedente
  igual que `contact_overage_events`. Hoy no ocurre ninguna de las dos.
- **Prioridad.** **P0** (figura como pendiente explícito en el checklist).

---

### 1.2 Cancelación — no existe superficie de cliente

- **Estado actual.** `cancel_at_period_end` se lee en el cron y se resetea a
  `FALSE` en el RPC de pago, pero **ninguna ruta lo escribe**. Un `grep` de
  `cancel_at_period_end` en `web/src/` devuelve exactamente dos archivos: el
  cron que lo consume y el test que lo siembra. No hay botón, endpoint ni
  flujo de cancelación en `/settings/billing`.
- **Archivo o ruta.** `web/src/app/api/cron/billing-lifecycle/route.ts:38-40`
  (único consumidor); no existe productor en `web/src/app/api/**`.
- **Riesgo.** La única forma de cancelar es que un super admin haga `PATCH`
  directo, o que el período venza sin pago (lo que produce `past_due` y luego
  `suspended`, no `cancelled`). Operativamente esto significa que una baja
  solicitada por el cliente se resuelve a mano en base de datos, sin traza de
  quién la pidió ni cuándo. Es un riesgo de cumplimiento y de soporte.
- **Prueba sugerida.** Definir el contrato (`POST /api/billing/cancel` u
  otro), y probar en cuenta no productiva: solicitar la baja, verificar
  `cancel_at_period_end=true` con acceso intacto hasta `current_period_end`,
  y forzar el cron para confirmar el paso a `cancelled`.
- **Resultado esperado.** Acceso completo hasta el fin del período pagado;
  `cancelled` en el primer ciclo del cron posterior; un `subscription_event`
  con `actor_type='user'` y el `agent_id` que solicitó la baja.
- **Prioridad.** **P0**.

---

### 1.3 Vencimiento — el cron corre una vez al día y sin idempotencia por corrida

- **Estado actual.** El cron selecciona `status='active' AND current_period_end <= NOW()`
  y actualiza con guarda optimista `.eq("status","active")`, lo que evita
  doble transición concurrente. El `correlation_id` del evento usa granularidad
  horaria: `lifecycle:${id}:${ISO.slice(0,13)}`. Si dos invocaciones del cron
  caen en la misma hora, la guarda de estado ya impide la segunda escritura, así
  que no hay duplicado real; pero si el cron corre en horas distintas sobre la
  misma suscripción (por reintento manual tras un fallo parcial) el
  `correlation_id` cambia y `subscription_events` admitiría un segundo registro.
- **Archivo o ruta.** `web/src/app/api/cron/billing-lifecycle/route.ts:26-70`;
  cadencia en `web/vercel.json:22-25`.
- **Riesgo.** Ventana de hasta 24 h en la que una suscripción vencida sigue
  contando como `active` y consumiendo recursos del plan. Además, el endpoint
  no pagina: `select` sin `limit` sobre todas las vencidas, y el bucle es
  secuencial con dos escrituras por fila. Con volumen alto puede superar el
  límite de ejecución de la función y dejar el lote a medias — sin registro de
  dónde se cortó.
- **Prueba sugerida.** Sembrar en QA N suscripciones vencidas (N ≥ 200) y
  ejecutar el cron con `CRON_SECRET`; medir duración y comparar
  `movedToPastDue + cancelled + suspended` contra el conteo sembrado. Repetir
  la ejecución inmediatamente para verificar que la segunda pasada devuelve
  ceros.
- **Resultado esperado.** Primera pasada procesa el 100 % dentro del timeout;
  segunda pasada devuelve `{movedToPastDue:0, cancelled:0, suspended:0}` sin
  nuevos `subscription_events`.
- **Prioridad.** **P1**.

---

### 1.4 Gracia — el valor es global y no queda registrado en el evento

- **Estado actual.** `BILLING_GRACE_DAYS` (default `3`) se lee por proceso y se
  aplica igual a toda organización. `grace_ends_at` se calcula en el momento de
  la transición a `past_due`. Durante la gracia, `isSubscriptionUsable()`
  devuelve `true`, así que el acceso es idéntico al de `active`.
- **Archivo o ruta.** `web/src/app/api/cron/billing-lifecycle/route.ts:18-24`
  y `:45`; consumo en `web/src/lib/billing/service.ts:166-172`;
  variable en `web/.env.example` (`BILLING_GRACE_DAYS=3`).
- **Riesgo.** Cambiar la variable en Vercel altera la gracia de suscripciones
  **ya en curso** en la siguiente corrida solo para las nuevas transiciones;
  las que ya tienen `grace_ends_at` conservan el valor viejo. La mezcla de
  políticas no queda documentada en ningún lado: el `subscription_event` guarda
  `reason` pero no los días de gracia aplicados. Reconstruir por qué una cuenta
  tuvo 3 y otra 7 días requiere leer el historial de deploys.
- **Prueba sugerida.** En QA, con `BILLING_GRACE_DAYS=1`, llevar una
  suscripción a `past_due` y verificar acceso durante la ventana; luego
  adelantar `grace_ends_at` y confirmar la suspensión. Registrar el valor de la
  variable vigente junto con el ID de deployment.
- **Resultado esperado.** Acceso normal mientras `grace_ends_at > NOW()`,
  `402` con `code=BILLING_SUBSCRIPTION_REQUIRED` una vez vencida, y evidencia
  que permita reconstruir qué política se aplicó a cada suscripción.
- **Prioridad.** **P1**.

---

### 1.5 Suspensión — no notifica y no libera nada

- **Estado actual.** La transición a `suspended` escribe `suspended_at` y
  `status_reason='grace_period_ended'`, inserta el `subscription_event` y
  termina. No encola ningún job de outbox, no crea `notification_logs`, no
  desconecta canales ni pausa broadcasts programados.
- **Archivo o ruta.** `web/src/app/api/cron/billing-lifecycle/route.ts:81-104`.
- **Riesgo.** El cliente descubre la suspensión al recibir un `402` en la UI,
  sin aviso previo. Además, los canales siguen `connected` y los webhooks
  entrantes se siguen procesando, así que una cuenta suspendida continúa
  generando contactos y consumo — solo se le bloquean las altas por API.
- **Prueba sugerida.** Suspender una organización QA y (a) verificar si llega
  algún correo o registro en `notification_logs`; (b) enviar un webhook de
  canal firmado y observar si se crea contacto/conversación.
- **Resultado esperado.** Definido el comportamiento deseado: aviso previo al
  vencer la gracia, aviso al suspender, y una política explícita para el
  tráfico entrante de cuentas suspendidas (rechazar, restringir como el
  excedente de contactos, o aceptar y facturar). Hoy no hay ninguno de los tres.
- **Prioridad.** **P1**.

---

### 1.6 Reactivación — solo por pago nuevo o `PATCH` sin validación

- **Estado actual.** Dos caminos. (a) Pago aprobado: el RPC selecciona la
  suscripción `IN ('trial','active','past_due','suspended')` `FOR UPDATE`, la
  pone `active`, limpia `grace_ends_at`, `suspended_at`, `cancelled_at` e
  incrementa `version`. Una suscripción `cancelled` **no** entra en ese
  `SELECT`, así que un cliente cancelado que vuelve a pagar obtiene una
  suscripción **nueva** y queda con dos filas históricas. (b) `PATCH
  /api/admin/subscriptions`: valida solo que el string esté en la lista de
  estados; acepta `cancelled → active` o `suspended → trial` sin comprobar
  pago, sin tocar `current_period_end`, sin limpiar `suspended_at` y **sin
  insertar `subscription_events`**.
- **Archivo o ruta.** `web/src/app/api/admin/subscriptions/route.ts:23-34`;
  `web/supabase/migrations/20260729000200_010_multi_gateway_manual_renewal.sql:255-262`.
- **Riesgo.** El `PATCH` es una puerta de reactivación sin traza: deja la
  suscripción `active` con `current_period_end` en el pasado, lo que provoca
  que el cron la devuelva a `past_due` en la siguiente corrida — un ciclo de
  reactivación aparente que se revierte solo. Y como no escribe evento, la
  bitácora no explica el salto de estado.
- **Prueba sugerida.** En QA: (1) reactivar una `suspended` con pago sandbox
  aprobado y verificar fila única, período nuevo y `status_reason='payment_approved'`;
  (2) reactivar una `cancelled` con pago y contar filas en `subscriptions`;
  (3) ejecutar el `PATCH` admin sobre una `suspended`, correr el cron y observar
  si vuelve a `past_due`.
- **Resultado esperado.** (1) una sola suscripción `active` con período futuro;
  (2) política definida sobre si reactivar una cancelada debe reutilizar la fila
  o crear una nueva; (3) el `PATCH` debe exigir transición válida, ajustar el
  período y registrar `subscription_events` con `actor_type='admin'`.
- **Prioridad.** **P0**.

---

### 1.7 Outbox — cuatro tipos de job declarados sin handler

- **Estado actual.** `BillingOutboxJobType` declara seis tipos. `processJob()`
  solo resuelve `send_notification`; el `default` lanza
  `No handler registered for billing job type '<x>'`. Cualquier job
  `apply_plan_change`, `expire_subscription`, `renew_subscription` o
  `reconcile_payment` consume sus 5 intentos con backoff exponencial
  (`30·2^n`, tope 3600 s) y termina en `dead_letter`.
- **Archivo o ruta.** `web/src/lib/billing/outbox.ts:5-11` (tipos),
  `:98-104` (dispatch), `:135-147` (retry / dead letter);
  RPCs en `web/supabase/migrations/20260809000200_032_billing_outbox_worker.sql`.
- **Riesgo.** El mecanismo de reintentos funciona, pero el ciclo de vida
  automatizado que esos tipos representan (renovación, expiración, aplicación
  de cambio de plan, conciliación de pagos) **no existe**. Si alguna pieza
  futura encola esos jobs asumiendo que se procesan, fallarán en silencio hasta
  el dead letter, y no hay alerta configurada sobre esa cola.
- **Prueba sugerida.** Consultar en QA `billing_outbox_jobs` agrupado por
  `job_type` y `status`; encolar un job sintético de tipo no soportado y
  verificar la secuencia intento → backoff → `dead_letter` en 5 pasadas del cron.
- **Resultado esperado.** O bien se implementan los handlers, o se retiran los
  tipos del enum y se documenta que el ciclo de vida es exclusivamente
  cron + RPC. En cualquier caso, una alerta sobre `status='dead_letter'`.
- **Prioridad.** **P1**.

---

### 1.8 Migraciones y pruebas faltantes del bloque 1

- **Estado actual.** Migraciones aplicadas relevantes: `009` (fundación
  billing), `010` (multi-gateway, RPC de activación, outbox, auditoría), `031`
  (reservas atómicas), `032` (worker de outbox). **Ninguna migración define
  `down` ni script de rollback**: `grep` de `DROP FUNCTION` / `rollback` en
  `031` y `032` no devuelve nada.
- **Archivo o ruta.** `web/supabase/migrations/20260809000100_031_atomic_billing_quota.sql`,
  `web/supabase/migrations/20260809000200_032_billing_outbox_worker.sql`.
- **Riesgo.** Un despliegue fallido de billing no tiene camino de vuelta
  documentado. `BILLING_ATOMIC_QUOTA_MODE=off` desactiva el uso de las RPC de
  031 desde la app, pero los objetos SQL quedan y no hay procedimiento escrito
  para revertir 032.
- **Prueba sugerida (pruebas nuevas a escribir, no ejecutar aún):**
  1. `subscription-lifecycle.test.ts` — añadir: `cancelled → pago aprobado`
     (¿fila nueva o reutilizada?), `PATCH` admin con transición inválida,
     y cron sobre lote de 200 filas.
  2. Test del RPC `finalize_epayco_approved_payment` contra PostgreSQL real
     (pgTAP o script `node --test` con `pg`) para upgrade, downgrade,
     reactivación desde `suspended` y doble llamada con el mismo `event_key`.
  3. Test de que `subscription_events` se escribe en **toda** transición,
     incluida la manual.
- **Resultado esperado.** Suite que cubra las seis transiciones del enunciado
  end-to-end, y un `ROLLBACK.md` o bloque comentado por migración con el SQL
  inverso verificado en una base desechable.
- **Prioridad.** **P0** para el rollback documentado, **P1** para las pruebas.

---

# 2. Contract tests de ePayco, Wompi y PayU

## Estado por pasarela

| Capacidad | ePayco | Wompi | PayU |
|---|---|---|---|
| Checkout hospedado | ✅ implementado | ✅ implementado | ✅ implementado |
| Firma de checkout | n/a (redirect + `p_key`) | ✅ `createWompiIntegritySignature` | ✅ `createPayUCheckoutSignature` |
| Ruta de confirmación | ✅ `/api/epayco/confirmation` | ❌ **no existe** | ❌ **no existe** |
| Verificación de firma entrante | ✅ `validateEpaycoSignature` | ⚠️ helper sin consumidor | ⚠️ helper sin consumidor |
| Idempotencia de webhook | ✅ índice único + reintento | ❌ | ❌ |
| Mapeo de estados | ✅ `mapEpaycoStatus` | ❌ | ❌ |
| `isActivationReady()` | `true` | **`false`** | **`false`** |
| Contract test | parcial (`qa-e2e/epayco.test.ts`) | solo firma unitaria | solo firma unitaria |

Archivos: `web/src/lib/payments/signatures.ts`,
`web/src/lib/payments/gateways/{epayco,wompi,payu}.ts`,
`web/src/lib/epayco/client.ts`,
`web/src/app/api/epayco/confirmation/route.ts`,
`web/tests/security.test.mjs`, `web/src/qa-e2e/epayco.test.ts`.

---

### 2.1 Firmas — helpers correctos, cobertura desigual

- **Estado actual.** `signatures.ts` implementa las cuatro firmas
  (Wompi integridad, Wompi eventos, PayU checkout, PayU confirmación) con
  SHA-256, más `safeSignatureEqual` con `timingSafeEqual`.
  `formatPayUConfirmationValue` reproduce la regla de PayU de recortar el
  decimal terminado en cero (`79000.00 → 79000.0`).
  `web/tests/security.test.mjs` las ejercita como unidades. ePayco valida con
  `validateEpaycoSignature` sobre `cust_id^p_key^ref^txn^amount^currency`.
- **Archivo o ruta.** `web/src/lib/payments/signatures.ts:19-86`;
  `web/tests/security.test.mjs:20-25,48+`;
  `web/src/lib/epayco/client.ts`.
- **Riesgo.** `createWompiEventSignature` y `createPayUConfirmationSignature`
  **no tienen ningún consumidor en `web/src/`** — están probados en aislamiento
  contra una expectativa escrita por nosotros mismos, no contra un payload real
  del proveedor. Un error de orden de campos o de formato de monto no lo
  detecta ninguna prueba actual.
- **Prueba sugerida.** Contract test con **payloads capturados del sandbox real**
  de cada proveedor (guardados como fixtures sin secretos, con claves de prueba
  sustituidas): verificar que la firma calculada coincide con la del payload y
  que una mutación de un solo carácter en monto, referencia o estado la invalida.
- **Resultado esperado.** Para los tres proveedores: firma válida acepta,
  firma alterada rechaza con `400`/`401`, y el test falla si cambia el orden de
  concatenación.
- **Prioridad.** **P1**.

---

### 2.2 Webhooks — PayU apunta a una ruta que no existe

- **Estado actual.** `PayUGateway.createHostedCheckout()` envía
  `confirmationUrl: ${NEXT_PUBLIC_APP_URL}/api/webhooks/payments/payu`.
  Ese path **no existe** en el árbol de rutas: los únicos webhooks son
  `src/app/api/webhook/{facebook,instagram,messenger,respond-io,whatsapp}` y
  los legacy `src/app/webhooks/*`. Wompi ni siquiera declara URL de eventos;
  su `redirect-url` apunta a `/settings/billing?payment=processing`, que es
  una página, no un webhook.
- **Archivo o ruta.** `web/src/lib/payments/gateways/payu.ts:75`;
  `web/src/lib/payments/gateways/wompi.ts:60`; ausencia verificada en
  `web/src/app/api/**`.
- **Riesgo.** Si alguien activa PayU (cambiando `isActivationReady()` o
  saltándose el gate), el cliente paga y PayU envía la confirmación a un `404`.
  El pago existe en el proveedor y **no existe** en la plataforma: sin
  `payments`, sin suscripción, sin acceso. Es el peor escenario de cobro: dinero
  capturado sin servicio entregado y sin registro para conciliar.
- **Prueba sugerida.** Antes de cualquier certificación: implementar los
  handlers y probar en sandbox el ciclo completo (checkout → pago → webhook →
  suscripción activa). Como verificación inmediata y no intrusiva, un test que
  afirme que toda `confirmationUrl` emitida por una pasarela corresponde a una
  ruta existente del App Router.
- **Resultado esperado.** El test de rutas falla hoy para PayU. Debe pasar
  antes de habilitar `checkout_enabled` para esa pasarela.
- **Prioridad.** **P0** (bloquea habilitar PayU o Wompi en cualquier ambiente).

---

### 2.3 El gate de activación es una constante en código

- **Estado actual.** `WompiGateway.isActivationReady()` y
  `PayUGateway.isActivationReady()` devuelven `false` literal. El checkout lo
  verifica y responde `409` con `code=PAYMENT_GATEWAY_ACTIVATION_NOT_READY`.
  Adicionalmente `payment_gateway_settings` tiene `is_enabled` y
  `checkout_enabled` en base de datos, y se exige que
  `gatewaySetting.environment === getGatewayEnvironment(gateway)`.
- **Archivo o ruta.** `web/src/lib/payments/gateways/wompi.ts:34-36`,
  `web/src/lib/payments/gateways/payu.ts:35-37`,
  `web/src/app/api/billing/checkout/route.ts:125-134`.
- **Riesgo.** La protección real contra 2.2 es un `return false`. Un cambio de
  una línea, hecho de buena fe para "probar en sandbox", habilita cobros cuyo
  webhook cae en `404`. No hay nada en base de datos ni en variables que
  impida ese cambio.
- **Prueba sugerida.** Test que verifique que `isActivationReady()` solo puede
  ser `true` cuando existe la ruta de confirmación correspondiente y hay al
  menos un contract test verde para esa pasarela.
- **Resultado esperado.** Imposible habilitar una pasarela sin webhook
  implementado y certificado.
- **Prioridad.** **P0**.

---

### 2.4 Idempotencia — sólida en ePayco, inexistente en el resto

- **Estado actual (ePayco).** Tres capas. (1) Índice único
  `idx_billing_webhook_events_dedupe (provider, environment, event_key)`;
  ante `23505` la ruta consulta el evento existente y devuelve
  `{status:"ok", duplicate:true}` salvo que estuviera `failed`, en cuyo caso
  incrementa `attempt_count` y reprocesa. (2) Búsqueda de `payments` por
  `(provider, environment, provider_transaction_id)` con verificación de que
  organización, checkout, monto y moneda coinciden; si no, `409`. (3) El RPC
  toma `FOR UPDATE` sobre el checkout y, si ya está `approved`, devuelve el
  `subscription_id` existente en lugar de crear otro.
  En checkout, `Idempotency-Key` es obligatorio y un reuso con otro precio da
  `409 IDEMPOTENCY_CONFLICT`.
- **Archivo o ruta.** `web/src/app/api/epayco/confirmation/route.ts:111-162`,
  `:220-240`; migración `010`:`216-227` (rama `status='approved'`) y
  `:433-441` (índice único); checkout en
  `web/src/app/api/billing/checkout/route.ts:79-84,176-208`.
- **Riesgo.** Wompi y PayU no tienen ninguna de las tres capas porque no tienen
  webhook. Cuando se implementen, la deduplicación debe replicar exactamente
  este patrón; el índice único ya es genérico por `provider`, así que la parte
  de esquema está lista y lo que falta es el código de ruta.
- **Prueba sugerida.** Reenviar tres veces la misma confirmación sandbox
  (mismo `x_transaction_id`) y verificar una sola fila en `payments`, una sola
  en `billing_webhook_events` y un solo `subscription_event`. Repetir con dos
  envíos concurrentes.
- **Resultado esperado.** Segunda y tercera respuesta `{duplicate:true}`,
  conteos en 1, `subscriptions.version` incrementada una sola vez.
- **Prioridad.** **P1** para reconfirmar ePayco en sandbox real,
  **P0** para no habilitar Wompi/PayU sin esto.

---

### 2.5 Estados de pago — mapeo probado solo para ePayco

- **Estado actual.** `mapEpaycoStatus(x_cod_response)` traduce el código a
  `approved | rejected | pending | failed`. Solo `approved` dispara el RPC de
  activación; el resto actualiza `checkout_sessions.status` y cierra el evento
  como `processed`. `web/src/qa-e2e/epayco.test.ts` ejercita la ruta real con
  aprobado, rechazado y pendiente (6 casos) contra Supabase en memoria.
- **Archivo o ruta.** `web/src/lib/epayco/client.ts`;
  `web/src/app/api/epayco/confirmation/route.ts:218,282-293`;
  `web/src/qa-e2e/epayco.test.ts`.
- **Riesgo.** No hay mapeo definido para PayU (`state_pol` 4/6/5/104) ni para
  Wompi (`APPROVED/DECLINED/VOIDED/ERROR`), ni tratamiento de reversos o
  `VOIDED` en ninguna pasarela. `payments.status` tampoco contempla
  `refunded`/`reversed` en el flujo de la aplicación.
- **Prueba sugerida.** Tabla de equivalencias por proveedor como fixture, y un
  test parametrizado que la recorra entera verificando el efecto sobre
  `payments.status`, `checkout_sessions.status` y si se activa o no la
  suscripción.
- **Resultado esperado.** Cobertura del 100 % de los códigos documentados por
  cada proveedor, incluidos los de reverso, con activación exclusivamente en
  aprobado.
- **Prioridad.** **P1**.

---

### 2.6 Rollback de pagos — no hay flujo de reverso ni de conciliación

- **Estado actual.** Las capacidades declaradas en cada gateway incluyen
  `refunds: true` y `partialRefunds: true`, pero **ninguna implementación**
  expone métodos de reverso: la interfaz solo tiene `createHostedCheckout`,
  `isConfigured` e `isActivationReady`. No hay endpoint de reembolso, ni job de
  conciliación (`reconcile_payment` está sin handler, ver 1.7), ni proceso que
  compare el extracto del proveedor contra `payments`.
- **Archivo o ruta.** `web/src/lib/payments/types.ts`;
  `web/src/lib/payments/gateways/*.ts` (bloques `capabilities`);
  `web/src/lib/billing/outbox.ts:98-104`.
- **Riesgo.** Las `capabilities` afirman algo que el código no hace; cualquier
  lógica futura que las consulte tomará una decisión equivocada. Y ante un
  cobro erróneo, el reverso se hace en el panel del proveedor sin que la
  plataforma se entere: `payments` queda `approved` y la suscripción activa.
- **Prueba sugerida.** En sandbox: aprobar un pago, revertirlo desde el panel
  del proveedor y observar qué recibe la plataforma. Documentar el resultado
  aunque sea "no llega nada".
- **Resultado esperado.** Un procedimiento escrito de reverso (manual es
  aceptable si está documentado) y `capabilities` alineadas con lo implementado.
- **Prioridad.** **P2**.

---

### 2.7 Integración PostgreSQL real — la suite QA nunca toca la base

- **Estado actual.** `web/src/qa-e2e/` (5 archivos, 26 casos) corre contra
  `helpers/fake-supabase.ts`, un query-builder en memoria. El propio README lo
  declara. Por tanto **ningún test ejercita** las RPC reales:
  `finalize_epayco_approved_payment`, `reserve/consume/release_billing_capacity`,
  `record_billing_usage`, `claim/complete/retry_billing_outbox_job`. Las únicas
  validaciones contra base real son los scripts manuales
  `scripts/qa-billing-concurrency.mjs` y `scripts/qa-billing-outbox.mjs`.
- **Archivo o ruta.** `web/src/qa-e2e/README.md`;
  `web/src/qa-e2e/helpers/fake-supabase.ts`;
  `web/scripts/qa-billing-{concurrency,outbox}.mjs`.
- **Riesgo.** El fake no reproduce constraints, índices únicos, `FOR UPDATE`,
  triggers ni `SECURITY DEFINER`. Un test verde en la suite no prueba que la
  migración correspondiente funcione. Concretamente, la deduplicación por
  índice único (2.4) y las guardas de concurrencia (031) están fuera del
  alcance de la suite.
- **Prueba sugerida.** Job de integración contra una base efímera (Supabase
  local o contenedor Postgres) que aplique `supabase/migrations/*` en orden y
  corra las RPC directamente. Es la pieza que convierte los scripts manuales en
  regresión automática.
- **Resultado esperado.** Migraciones aplicables de cero en orden, y RPC
  verificadas con sus casos límite (doble llamada, checkout expirado, monto
  distinto, reserva concurrente en el límite).
- **Prioridad.** **P1** (es el gate "integración PostgreSQL/RLS" del checklist).

---

# 3. E2E multicanal (Facebook, Instagram, WhatsApp)

## Superficies

| Canal | Ruta canónica | Ruta legacy | Verificación |
|---|---|---|---|
| Facebook | `web/src/app/api/webhook/facebook/route.ts` | `web/src/app/webhooks/facebook/route.ts` | `verifyMetaWebhook` + HMAC en `receiveMetaWebhook` |
| Instagram | `web/src/app/api/webhook/instagram/route.ts` | `web/src/app/webhooks/instagram/route.ts` | ídem, secreto `META_IG_APP_SECRET` con fallback a `META_APP_SECRET` |
| Messenger | `web/src/app/api/webhook/messenger/route.ts` | `web/src/app/webhooks/messenger/route.ts` | ídem |
| WhatsApp | `web/src/app/api/webhook/whatsapp/route.ts` | `web/src/app/webhooks/whatsapp/route.ts` | HMAC propio con `WHATSAPP_APP_SECRET` |

Lógica compartida: `web/src/lib/smarttalk/meta-webhook.ts`
(`verifyMetaSignature:98`, `receiveMetaWebhook:672`, `processWebhookEventRow:762`),
parser en `meta-parser.ts`, cola en `smarttalk.webhook_events`
(migración `20260712_011_webhook_events_queue.sql`), drenaje por
`/api/inbox/process-webhook-events` cada 2 minutos (`vercel.json:10-13`).

Pruebas existentes: `meta-parser.test.ts` (225 líneas),
`meta-fixtures.test.ts` (127), `contact-overage.test.ts`,
`contact-overage-release.test.ts`. Todas sobre fixtures, sin red.

---

### 3.1 Precondiciones para el E2E real

- **Estado actual.** Para ejecutar un E2E de verdad se requiere, por canal:

  | Requisito | FB / Messenger | Instagram | WhatsApp |
  |---|---|---|---|
  | App de Meta en modo desarrollo | sí | sí | sí |
  | Secreto configurado | `META_APP_SECRET` | `META_IG_APP_SECRET` o fallback | `WHATSAPP_APP_SECRET` o `META_APP_SECRET` |
  | Verify token | `META_WEBHOOK_VERIFY_TOKEN` | ídem | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` o fallback |
  | URL pública HTTPS | sí (Preview o túnel) | sí | sí |
  | Activo vinculado | Página con rol de prueba | Cuenta profesional vinculada a la Página | Número de prueba de WhatsApp Cloud API |
  | Canal creado en la app | vía UI, no por SQL | ídem | ídem |
  | Suscripción activa | sí (si `hard`) | sí | sí |

- **Archivo o ruta.** Variables en `web/.env.example`;
  creación de canales por `POST /api/channels` (con reserva atómica en
  `web/src/app/api/channels/route.ts:108`); guía operativa parcial en
  `web/docs/BILLING_QA_RUNBOOK.md:114-119`.
- **Riesgo.** Sin URL pública estable el webhook de Meta no se puede
  suscribir, y hoy Preview y Production comparten proyecto Vercel y Supabase
  (ver bloque 5): apuntar la app de Meta a un Preview implica riesgo de que
  eventos de prueba caigan en datos reales.
- **Prueba sugerida.** No ejecutar hasta cerrar el bloque 5. Preparar la matriz
  de precondiciones y confirmar qué activos de prueba existen ya en la cuenta
  de Meta.
- **Resultado esperado.** Checklist de precondiciones firmado antes de tocar
  cualquier app de Meta.
- **Prioridad.** **P1**.

---

### 3.2 Qué se puede probar en sandbox y qué no

- **Estado actual.**

  | Escenario | ¿Sandbox? | Cómo |
  |---|---|---|
  | Verificación `GET hub.challenge` | ✅ | Meta lo dispara al suscribir; también reproducible con `curl` |
  | Firma HMAC válida / inválida | ✅ | Payload firmado localmente con el secreto de prueba |
  | Mensaje entrante de texto | ✅ | Meta Test Users (FB/IG) y número de prueba (WA) |
  | Deduplicación de evento repetido | ✅ | Reenviar el mismo `message_id` |
  | Contacto en excedente (`restricted`) | ✅ | Ya validado el 2026-08-05 según checklist |
  | Respuesta saliente (ventana 24 h) | ⚠️ parcial | WA con número de prueba sí; FB/IG requieren interacción real del test user |
  | Plantillas de WhatsApp | ⚠️ | Requieren plantilla aprobada por Meta |
  | Adjuntos multimedia | ⚠️ | Requiere Storage configurado y URL pública |
  | Volumen / rate limiting real de Meta | ❌ | No reproducible sin cuenta productiva |
  | Instagram sin cuenta profesional | ❌ | Meta lo impide |

- **Archivo o ruta.** `web/src/lib/smarttalk/meta-webhook.ts:672-760`;
  `web/src/app/api/webhook/whatsapp/route.ts:50-106`;
  `web/src/lib/smarttalk/__fixtures__/meta-payloads.ts`.
- **Riesgo.** Declarar "E2E multicanal completo" con lo que solo es
  verificable en sandbox deja fuera precisamente lo que falla en producción:
  ventana de 24 h, plantillas y límites de Meta.
- **Prueba sugerida.** Ejecutar la columna "✅" completa en un ambiente QA
  aislado y documentar explícitamente los "⚠️/❌" como fuera de alcance.
- **Resultado esperado.** Evidencia por canal con `message_id`, fila en
  `webhook_events`, contacto y conversación creados, y la lista de limitaciones
  aceptadas.
- **Prioridad.** **P1**.

---

### 3.3 Rutas duplicadas — dos webhooks por canal

- **Estado actual.** Cada canal de Meta tiene dos rutas activas: la canónica
  bajo `/api/webhook/*` y la legacy bajo `/webhooks/*`. La canónica aplica
  rate limiting de 200 req/min por IP; la legacy hay que verificar caso por
  caso qué hace.
- **Archivo o ruta.** `web/src/app/api/webhook/*/route.ts` vs
  `web/src/app/webhooks/*/route.ts`.
- **Riesgo.** Si un canal quedó suscrito a la URL legacy, el comportamiento
  (rate limit, verificación, persistencia) puede diferir del esperado, y las
  pruebas del E2E medirían la ruta equivocada.
- **Prueba sugerida.** Inventariar en QA qué URL tiene suscrita cada canal
  (`channels` + configuración en Meta) y ejercitar ambas rutas con el mismo
  payload firmado, comparando el resultado.
- **Resultado esperado.** Una sola ruta suscrita por canal, documentada; o
  paridad verificada entre ambas.
- **Prioridad.** **P2**.

---

### 3.4 Fallo de procesamiento devuelve 500 a Meta

- **Estado actual.** `/api/webhook/whatsapp` persiste el payload y luego
  procesa en línea; si el procesamiento lanza, responde
  `500 {error:"smarttalk_processing_failed"}`.
- **Archivo o ruta.** `web/src/app/api/webhook/whatsapp/route.ts:100-104`.
- **Riesgo.** Meta reintenta ante `5xx`. Como `persistWhatsAppWebhook` ya
  guardó el evento antes del `try`, cada reintento vuelve a persistir. La
  deduplicación depende de la clave que use esa función — hay que verificar que
  sea por `message_id` y no por PK autogenerada. Si no dedupe, un fallo
  transitorio genera N copias del mensaje.
- **Prueba sugerida.** Forzar un fallo controlado en QA (por ejemplo con una
  organización sin canal asociado) y reenviar el mismo payload 3 veces;
  contar filas en `webhook_events`, `messages` y `contacts`.
- **Resultado esperado.** Una fila por `message_id` sin importar los reintentos.
- **Prioridad.** **P1**.

---

### 3.5 Pruebas faltantes del bloque 3

- **Estado actual.** Hay tests de parser y de fixtures, ninguno de ruta
  completa: firma → rate limit → persistencia → cola → drenaje.
- **Archivo o ruta.** `web/src/lib/smarttalk/meta-*.test.ts`.
- **Riesgo.** Los cambios en el orden de verificación (por ejemplo mover el
  rate limit antes de la firma, o al revés) no rompen ninguna prueba.
- **Prueba sugerida.** Test por canal que invoque el `POST` real con: firma
  ausente (`401`), firma inválida (`401`), firma válida (`200` + fila en cola),
  y reenvío (`200` sin fila nueva).
- **Resultado esperado.** 4 casos × 4 canales verdes.
- **Prioridad.** **P2**.

---

# 4. Seguridad y resiliencia

### 4.1 Rate limiting — fail-open por diseño

- **Estado actual.** Ventana deslizante persistida en
  `smarttalk.rate_limit_hits`. Si la base falla, cae a un contador en memoria
  **por worker** y lo registra como `backend:"memory-fallback"`. Límites:
  checkout 10/min por usuario, confirmación ePayco 120/min por IP, webhooks de
  canal 200/min por IP. Hay whitelist por `RATE_LIMIT_WHITELIST`.
- **Archivo o ruta.** `web/src/lib/rate-limit.ts:16-64` (fail-open en `:57-63`),
  `:96-127` (whitelist); política en `web/src/lib/billing/rate-limit.ts`;
  tabla en `web/supabase/migrations/20260713_013_rate_limit_hits.sql`.
- **Riesgo.** Tres problemas compuestos. (a) En serverless, el fallback en
  memoria multiplica el límite efectivo por el número de instancias. (b) El
  límite se basa en `x-forwarded-for`, falsificable si algo distinto de Vercel
  llega al origen. (c) Cada verificación hace `INSERT` + `COUNT` en la misma
  base que atiende el tráfico: bajo ataque, el rate limiter **amplifica** la
  carga en lugar de contenerla, y al caer la base pasa a fail-open justo cuando
  más se necesita.
- **Prueba sugerida.** Carga controlada en QA contra
  `/api/epayco/confirmation` con firma inválida: 300 req/min desde una IP,
  midiendo cuántas devuelven `429`, el `backend` reportado y la latencia p95 de
  la base durante la prueba.
- **Resultado esperado.** ≥ 120 rechazos con `backend:"db"`, sin degradación de
  la base. Si aparece `memory-fallback`, el resultado es un hallazgo, no un pase.
- **Prioridad.** **P1**.

---

### 4.2 RLS — cobertura completa en tablas de billing

- **Estado actual.** RLS habilitado y verificado por migración en:
  `subscriptions`, `payments`, `usage_records` (006, con policy
  `organization_id = get_agent_org_id()`); `feature_catalog`,
  `plan_entitlements`, `plan_prices`, `checkout_sessions`,
  `billing_webhook_events`, `subscription_events`, `usage_events`,
  `usage_counters`, `billing_decision_events` (009); `payment_gateway_settings`,
  `subscription_entitlement_snapshots`, `notification_logs`,
  `billing_audit_events`, `billing_outbox_jobs` (010); tablas `cm_*` con patrón
  `service_only` (014). Las funciones sensibles son `SECURITY DEFINER` con
  `search_path` fijo y `REVOKE ... FROM PUBLIC, anon, authenticated` +
  `GRANT ... TO service_role`.
- **Archivo o ruta.** `web/supabase/migrations/20260514120006_006_admin_billing.sql:60-67`;
  `..._009_agency_billing_foundation.sql:384-392`;
  `..._010_multi_gateway_manual_renewal.sql:566-570,432-437`;
  `20260801190000_014_rls_audit.sql`.
- **Riesgo.** El diseño es correcto; el riesgo es que **nadie lo verifica en
  ejecución**. Toda la app usa `createAdminClient()` (service role, que hace
  bypass de RLS), así que un fallo de policy no se manifestaría en el uso
  normal — solo ante un acceso directo con la clave anónima. El bloque 2.7 ya
  señala que la suite no corre contra Postgres real.
- **Prueba sugerida.** Con la clave `anon` y un JWT de usuario de la
  organización A, intentar `SELECT` sobre las 18 tablas listadas y sobre datos
  de la organización B. Complementar con `supabase get_advisors` en el proyecto
  QA (solo lectura).
- **Resultado esperado.** Cero filas de otra organización; cero tablas de
  billing legibles sin `organization_id` propio; `advisors` sin hallazgos de
  RLS deshabilitado.
- **Prioridad.** **P1** (es parte del gate "integración PostgreSQL/RLS").

---

### 4.3 Auditoría — dos tablas de bitácora, una sin uso

- **Estado actual.** `smarttalk.billing_audit_events` existe desde la migración
  010 con RLS, y **ninguna línea de `web/src/` escribe en ella**.
  `subscription_events` sí se escribe, pero solo desde el cron y el RPC de
  ePayco: el `PATCH` admin de suscripciones y los cambios de plan de admin no
  registran nada. `billing_decision_events` sí recibe cada decisión de
  enforcement cuando el modo no es `off`.
- **Archivo o ruta.** `web/supabase/migrations/20260729000200_010_multi_gateway_manual_renewal.sql:503`
  (tabla sin productor); `web/src/app/api/admin/subscriptions/route.ts:31`
  (update sin evento); `web/src/lib/billing/service.ts:176-201` (sí registra).
- **Riesgo.** No se puede reconstruir quién cambió un plan, quién reactivó una
  suscripción ni quién habilitó una pasarela. Ante una disputa de cobro, la
  plataforma no tiene bitácora de las acciones administrativas.
- **Prueba sugerida.** Ejecutar en QA las acciones administrativas disponibles
  (`PATCH` de suscripción, edición de plan, toggle de pasarela) y consultar
  `billing_audit_events` y `subscription_events` después de cada una.
- **Resultado esperado.** Una fila por acción con actor, recurso, valores
  anterior y nuevo. Hoy el resultado será cero filas en `billing_audit_events`.
- **Prioridad.** **P1**.

---

### 4.4 Timeout de proveedores — cobertura parcial

- **Estado actual.** Los módulos de publicación social (`gbp`, `tiktok`,
  `linkedin`, `youtube`, `threads`, `listening/fetchers`) usan
  `AbortSignal.timeout(30_000)` de forma consistente. Los de notificación
  (`email-resend`, `slack`, `whatsapp-templates`) usan `AbortController`.
  **`web/src/lib/epayco/client.ts` no hace ninguna llamada HTTP saliente ni
  define timeout**: la integración con ePayco es por redirect y webhook, sin
  consulta de transacción. En total hay 39 archivos con `await fetch(` y solo
  parte declara timeout.
- **Archivo o ruta.** `web/src/lib/social/*.ts`, `web/src/lib/notify/*.ts`
  (con timeout); auditar el resto de los 39 archivos con `fetch`.
- **Riesgo.** Un `fetch` sin timeout en una ruta serverless cuelga hasta el
  límite de la función y consume el presupuesto de ejecución. En rutas de
  webhook eso se traduce en `5xx` y reintentos del proveedor.
- **Prueba sugerida.** Inventario de los 39 archivos, marcando cuáles carecen
  de `signal`. Luego, prueba con un endpoint que demore deliberadamente,
  verificando que la ruta corta y responde con error controlado.
- **Resultado esperado.** 100 % de los `fetch` salientes con timeout explícito;
  ninguna ruta excede su presupuesto por una dependencia lenta.
- **Prioridad.** **P2**.

---

### 4.5 Reintentos — tres mecanismos independientes

- **Estado actual.**

  | Cola | Reclamo | Backoff | Máx. intentos | Destino final |
  |---|---|---|---|---|
  | `billing_outbox_jobs` | `claim_billing_outbox_jobs` con lease 120 s | `30·2^n`, tope 3600 s | 5 | `dead_letter` |
  | `billing_webhook_events` | reproceso al recibir duplicado `failed` | ninguno | sin tope | permanece `failed` |
  | `webhook_events` (canales) | `/api/inbox/process-webhook-events` cada 2 min | según implementación | — | `retry-all-dead` manual |

- **Archivo o ruta.** `web/src/lib/billing/outbox.ts:26-28,107-148`;
  `web/src/app/api/epayco/confirmation/route.ts:134-156`;
  `web/src/app/api/inbox/webhook-events/retry-all-dead/route.ts`.
- **Riesgo.** El reproceso de webhooks de ePayco depende de que el proveedor
  reenvíe: no hay worker que recorra `billing_webhook_events` en estado
  `failed`. El índice `idx_billing_webhooks_pending` sobre
  `(status, next_attempt_at)` sugiere que ese worker estaba previsto y no
  existe. Si ePayco no reintenta, un fallo transitorio de base deja el pago sin
  procesar de forma permanente y silenciosa.
- **Prueba sugerida.** Provocar un fallo transitorio durante una confirmación
  sandbox (por ejemplo con el checkout ya expirado), verificar el estado del
  evento, y comprobar si algo lo recupera sin intervención humana.
- **Resultado esperado.** O existe el worker de recuperación, o queda
  documentado que la recuperación es manual con un procedimiento y una alerta
  sobre `billing_webhook_events.status='failed'`.
- **Prioridad.** **P1**.

---

### 4.6 Carga — sin ninguna prueba

- **Estado actual.** No hay pruebas de carga en el repositorio. Los puntos de
  presión identificables son: el cron de ciclo de vida (sin paginación, ver
  1.3), el rate limiter (dos consultas por request, ver 4.1), el drenaje de
  `webhook_events` cada 2 minutos, y `getCurrentUsage()`, que ejecuta hasta dos
  `COUNT` por verificación de límite sin caché.
- **Archivo o ruta.** `web/src/lib/billing/service.ts:226-364`;
  `web/src/app/api/cron/billing-lifecycle/route.ts`; `web/vercel.json`.
- **Riesgo.** `checkBillingFeature` se invoca en cada alta de contacto, canal,
  marca y flujo. Con `hard` activo y una organización de 10.000 contactos,
  cada alta hace un `COUNT` completo sobre `contacts` filtrado por
  organización. Bajo ráfaga de webhooks entrantes esto se multiplica.
- **Prueba sugerida.** En QA aislado: 500 webhooks entrantes en 60 s contra
  una organización con 10.000 contactos, midiendo latencia p95 de
  `/api/webhook/*`, tiempo de `getCurrentUsage` y carga de la base.
- **Resultado esperado.** p95 por debajo del presupuesto de la función sin
  saturar conexiones. Si no, hace falta caché de conteo o contador
  materializado.
- **Prioridad.** **P2**.

---

### 4.7 Fail-open de billing ante esquema no listo

- **Estado actual.** Si la consulta de organización o de entitlements falla,
  `checkBillingFeature` degrada a `reason:"schema_not_ready"` con
  `wouldBlock:false`, y si el modo global era `hard` lo baja a `observe`.
  Es decir: **ante un fallo de base, todo se permite**.
- **Archivo o ruta.** `web/src/lib/billing/service.ts:408-422,495-504`.
- **Riesgo.** Es una decisión razonable para no romper la aplicación durante
  una migración, pero significa que una caída parcial de la base desactiva el
  enforcement por completo. Sin alerta sobre `reason='schema_not_ready'` en
  `billing_decision_events`, nadie se entera.
- **Prueba sugerida.** Consultar en QA la frecuencia histórica de
  `billing_decision_events.reason='schema_not_ready'` y definir un umbral de
  alerta.
- **Resultado esperado.** Cero ocurrencias en operación normal; alerta
  configurada para cualquier aparición.
- **Prioridad.** **P2**.

---

### 4.8 Super admin sale del enforcement antes de cualquier verificación

- **Estado actual.** `checkBillingFeature` llama a `currentUserIsSuperAdmin()`
  como primera operación y devuelve `unlimited` sin registrar la decisión
  (`logDecision` retorna temprano cuando el modo es `off`). La función atrapa
  toda excepción y devuelve `false`, así que falla cerrado — correcto.
- **Archivo o ruta.** `web/src/lib/billing/service.ts:120-138,381-388`.
- **Riesgo.** Bajo, pero las acciones del super admin sobre datos de un
  cliente no dejan rastro en `billing_decision_events`, lo que complica
  explicar por qué una organización superó su límite.
- **Prueba sugerida.** Crear un recurso por encima del límite con una sesión de
  super admin y verificar el conteo resultante y la ausencia de registro.
- **Resultado esperado.** Comportamiento documentado; idealmente un registro
  con `reason='unlimited', source='super_admin'`.
- **Prioridad.** **P2**.

---

# 5. Aislamiento QA

### 5.1 Estado actual — QA y Production comparten infraestructura

- **Estado actual.** Un solo proyecto Vercel (`cg-moda/comunityagent`) y un
  solo proyecto Supabase. La separación entre QA y Production es **por
  convención de datos**: organizaciones prefijadas `[QA]`, contactos con
  `qa_seed`, planes temporales creados y restaurados por script. El aislamiento
  de enforcement se hace con `organizations.billing_enforcement_mode` por
  organización sobre un `BILLING_ENFORCEMENT_MODE=hard` global.
- **Archivo o ruta.** `web/docs/BILLING_QA_RUNBOOK.md:12,28,83-84,114-115`;
  `web/vercel.json`; `web/scripts/qa-billing-concurrency.mjs` (exige
  `QA_ORGANIZATION_ID` y restaura `plan_id` en `finally`).
- **Riesgo.** Es el hallazgo estructural del bloque. Toda prueba de QA se
  ejecuta contra la base de Production. Los mitigantes actuales son buenos
  (scripts con `finally`, negativa a correr sin `QA_ORGANIZATION_ID`, prefijos)
  pero son disciplina, no barrera: un `UPDATE` sin `WHERE` correcto, un cron
  que procese una fila QA, o un webhook de prueba mal dirigido tocan datos
  reales. Además los crons de `vercel.json` corren sobre **todas** las
  organizaciones, incluidas las de QA.
- **Prueba sugerida.** No aplica — es una decisión de infraestructura, no una
  prueba.
- **Resultado esperado.** Proyecto Supabase y Preview de Vercel dedicados
  antes de ejecutar los E2E multicanal y las pruebas de carga.
- **Prioridad.** **P0** (pendiente explícito en el checklist).

---

### 5.2 Variables necesarias para un ambiente QA propio

- **Estado actual.** Inventario derivado de `web/.env.example` (sin valores).

  **Bloque 1 — obligatorias, deben ser distintas de Production:**

  | Variable | Nota |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | proyecto QA |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | proyecto QA |
  | `SUPABASE_SERVICE_ROLE_KEY` | proyecto QA |
  | `NEXT_PUBLIC_APP_URL` / `INTERNAL_APP_URL` | dominio del Preview |
  | `TOKEN_ENCRYPTION_KEY` | clave propia; **no** reutilizar la de Production |
  | `CRON_SECRET` | propio |
  | `APPROVAL_HMAC_SECRET`, `ONBOARDING_HMAC_SECRET` | propios (caen a `CRON_SECRET` si vacíos) |

  **Bloque 2 — pasarelas, todas en sandbox:**
  `EPAYCO_TEST=true`, `EPAYCO_CUSTOMER_ID`, `EPAYCO_P_KEY`,
  `EPAYCO_PRIVATE_KEY`, `NEXT_PUBLIC_EPAYCO_PUBLIC_KEY`,
  `PAYMENT_ENVIRONMENT=sandbox`, `PAYMENT_GATEWAY_DEFAULT=epayco`,
  `PAYMENT_RENEWAL_MODE=manual`, `PAYMENT_AUTO_RENEWAL_APPROVED=false`,
  `WOMPI_*` y `PAYU_*` solo si se certifican (bloqueadas hoy por 2.3).

  **Bloque 3 — enforcement:**
  `BILLING_ENFORCEMENT_MODE`, `BILLING_GRACE_DAYS`,
  `BILLING_ATOMIC_QUOTA_MODE`, `RATE_LIMIT_WHITELIST`.

  **Bloque 4 — canales (app de Meta de prueba, no la de Production):**
  `META_APP_ID`, `META_APP_SECRET`, `META_IG_APP_SECRET`,
  `META_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_SYSTEM_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `NEXT_PUBLIC_FACEBOOK_APP_ID`,
  `NEXT_PUBLIC_META_CONFIG_ID`.

  **Bloque 5 — proveedores externos con efecto real (dominio de prueba o vacías):**
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SLACK_WEBHOOK_URL`,
  `SLACK_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `FAL_KEY`,
  `SUPABASE_STORAGE_BUCKET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

- **Archivo o ruta.** `web/.env.example`, `web/.env.production.example`.
- **Riesgo.** Compartir `TOKEN_ENCRYPTION_KEY` entre ambientes permitiría a QA
  descifrar tokens de Production. Compartir `CRON_SECRET` permite disparar
  crons de Production desde QA. Compartir `RESEND_API_KEY` envía correos reales
  desde pruebas.
- **Prueba sugerida.** Checklist de paridad: cada variable del inventario debe
  tener valor propio en QA o estar deliberadamente vacía, con la razón anotada.
- **Resultado esperado.** Cero variables compartidas entre QA y Production en
  los bloques 1, 2 y 4.
- **Prioridad.** **P0**.

---

### 5.3 Pasos para separar Supabase

- **Estado actual.** El repositorio tiene 43 migraciones en
  `web/supabase/migrations/` y semillas en `web/supabase/seed/`. No hay
  evidencia de que la secuencia completa se haya aplicado de cero
  recientemente: `20260514_public_grants.sql` y `20260509_meta_flow.sql`
  rompen el orden cronológico del resto.
- **Archivo o ruta.** `web/supabase/migrations/`, `web/supabase/seed/`,
  `web/scripts/apply-sprint22-migrations.mjs`.
- **Riesgo.** Si las migraciones no aplican limpiamente desde cero, el proyecto
  QA no será equivalente a Production y las pruebas perderán validez. También
  es el momento de descubrir si hay cambios aplicados a mano en Production que
  no están en el repositorio.
- **Prueba sugerida (secuencia propuesta, no ejecutada):**
  1. Crear proyecto Supabase nuevo en una organización que **no** sea la de
     Production ni la organización QA existente.
  2. Aplicar `supabase/migrations/*` en orden y registrar cualquier fallo.
  3. Comparar el esquema resultante contra Production con `list_tables`
     (solo lectura sobre Production).
  4. Sembrar planes demo con `scripts/seed-qa-plan-limits.mjs`.
  5. Crear organizaciones de prueba **por la UI**, no por SQL, para que las
     rutas reales registren `billing_decision_events`.
  6. Ejecutar `get_advisors` sobre el proyecto nuevo y resolver hallazgos de
     RLS antes de cargar datos.
- **Resultado esperado.** Esquema idéntico, cero diferencias no explicadas, y
  la lista de objetos presentes en Production que no están en migraciones.
- **Prioridad.** **P0**.

---

### 5.4 Pasos para separar Vercel

- **Estado actual.** Un proyecto (`comunityagent`) con Root Directory `web`.
  `vercel.json` define 8 crons que se ejecutan en el deployment de Production.
  Los Preview deployments heredan las variables de entorno del proyecto salvo
  que se declaren específicas por ambiente.
- **Archivo o ruta.** `web/vercel.json`, `web/.vercel/`,
  `web/docs/BILLING_QA_RUNBOOK.md:28`.
- **Riesgo.** El punto crítico: **un Preview con las variables heredadas apunta
  a la base de Production**. Cualquier prueba en Preview escribe en datos
  reales. Además, los crons de `vercel.json` solo corren en Production, así que
  un QA basado en Preview no tendrá ciclo de vida ni outbox automáticos y habrá
  que dispararlos a mano con `CRON_SECRET`.
- **Prueba sugerida (secuencia propuesta, no ejecutada):**
  1. Decidir entre proyecto Vercel separado (aislamiento total, dominio propio,
     crons propios) o entorno Preview con variables por ambiente (más barato,
     sin crons). **Recomendación: proyecto separado**, porque los E2E de canal
     necesitan URL estable para suscribir webhooks de Meta y las pruebas de
     ciclo de vida necesitan los crons.
  2. Sobrescribir en el proyecto QA las variables del bloque 5.2 antes del
     primer deployment.
  3. Verificar con `/api/health` que apunta al Supabase QA **antes** de
     ejecutar cualquier prueba.
  4. Registrar la URL del deployment QA en la evidencia de cada prueba.
- **Resultado esperado.** Un `deployment_id` QA identificable, con
  `NEXT_PUBLIC_SUPABASE_URL` distinto al de Production, verificable sin
  exponer claves.
- **Prioridad.** **P0**.

---

### 5.5 Riesgos y dependencias de la separación

- **Estado actual.** Dependencias identificadas para completar el aislamiento:

  | Dependencia | Bloquea | Nota |
  |---|---|---|
  | Costo del proyecto Supabase adicional | 5.3 | decisión del responsable |
  | App de Meta de prueba (o modo desarrollo) | 3.1, 3.2 | los webhooks de canal no se pueden compartir con Production |
  | Credenciales sandbox de ePayco | 2.4, 2.5 | ya existen según evidencia previa |
  | Dominio o URL estable para QA | 3.1 | Meta requiere HTTPS público para suscribir |
  | Migraciones aplicables de cero | 5.3 | ver 2.7 |
  | `TOKEN_ENCRYPTION_KEY` propia | 5.2 | los tokens sembrados en QA no serán legibles desde Production, que es lo deseado |

- **Riesgo.** Riesgos de la transición: (a) datos QA existentes en Production
  (organizaciones `[QA]`, contactos `qa_seed`, `1.003/1.000` contactos) no
  migran automáticamente y la evidencia previa queda referida a la base vieja;
  (b) al mover los canales de prueba a la app de Meta nueva hay que
  re-suscribir webhooks, y los canales viejos quedarán apuntando a Production;
  (c) mientras existan ambos ambientes, cada evidencia debe indicar
  explícitamente en cuál se produjo, o el registro QA se vuelve ambiguo.
- **Prueba sugerida.** Antes de migrar, inventariar en Production todos los
  registros con marca QA (organizaciones `[QA]`, contactos `qa_seed`, planes
  `demo-*`, canales `[QA]`) y decidir por cada uno: replicar, archivar o
  conservar. Solo lectura en esta fase.
- **Resultado esperado.** Inventario cerrado y una regla escrita: toda
  evidencia posterior a la separación cita el `deployment_id` y el proyecto
  Supabase donde se produjo.
- **Prioridad.** **P1**.

---

# Orden de ejecución sugerido

Este orden minimiza el trabajo desperdiciado: cada paso desbloquea el
siguiente.

1. **5.3 + 5.4** — Separar Supabase y Vercel. Sin esto, ninguna prueba de los
   bloques 1, 3 y 4 puede ejecutarse sin tocar Production. **P0.**
2. **2.2 + 2.3** — Cerrar el riesgo de PayU/Wompi: o se implementan los
   webhooks, o se blinda el gate de activación fuera del código. **P0.**
3. **1.2 + 1.6** — Definir e implementar cancelación y reactivación con
   validación de transición y bitácora. **P0.**
4. **1.1** — Decidir la política de cambio de plan (prorrateo y downgrade) y
   probarla en QA aislado. **P0.**
5. **1.8 + 2.7** — Rollback documentado por migración e integración contra
   PostgreSQL real. **P0 / P1.**
6. **4.2 + 4.3 + 4.5** — RLS verificada en ejecución, auditoría escribiendo, y
   recuperación de webhooks fallidos. **P1.**
7. **3.1 → 3.5** — E2E multicanal en el ambiente ya aislado. **P1.**
8. **4.1 + 4.6** — Rate limiting bajo carga y presión sobre `getCurrentUsage`.
   **P1 / P2.**
9. **1.7 + 2.6 + 4.4 + 4.7 + 4.8 + 3.3** — Endurecimiento restante. **P2.**

# Notas de método

- Todo lo afirmado sobre el estado actual proviene de leer el código en la rama
  `codex/add-manual-contact`. No se consultó Production, la organización QA ni
  ningún proveedor.
- Los conteos de pruebas se obtuvieron contando bloques `it(` / `it.each` en
  `web/src/qa-e2e/*.test.ts`; los conteos de líneas con `wc -l`.
- Las ausencias afirmadas (ruta de PayU, productor de `billing_audit_events`,
  escritor de `cancel_at_period_end`, handlers de outbox, rollback en 031/032)
  se verificaron con búsquedas sobre `web/src/` y `web/supabase/migrations/`.
  Son ausencias en el repositorio; si existe algo equivalente fuera de él,
  el hallazgo correspondiente debe ajustarse.
- Este documento no contiene secretos, claves, tokens ni identificadores de
  transacción nuevos.
