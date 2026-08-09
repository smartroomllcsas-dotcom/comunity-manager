# Informe de evidencias — Pruebas de integración de QA (Billing / Suscripciones)

- **Proyecto:** CommunityManager (`web/`)
- **Rama:** `codex/qa-e2e-tests` (base `ee77782`)
- **Fecha de ejecución:** 2026-08-06 11:26 -05
- **Runner:** vitest 4.1.10 · Node 22 · entorno `node`
- **Resultado global:** ✅ **42 / 42 pruebas aprobadas** (5 archivos)

## Alcance

Suite de **pruebas de integración** de QA que **importa y ejecuta los módulos y
rutas reales** del sistema (no reimplementa la lógica) usando un **Supabase en
memoria** (`src/qa-e2e/helpers/fake-supabase.ts`). Cubre:

1. Los tres planes demo (Inicial / Crecimiento / Escala).
2. ePayco: aprobado, rechazado y pendiente — **ejecutando la ruta real**
   `POST /api/epayco/confirmation`.
3. Límites de marcas, canales, asesores y contactos.
4. Aislamiento entre Marca A y Marca B.
5. Ciclo de vida de suscripciones.
6. Este informe de evidencias.

### Restricciones respetadas

No se modificó **ningún** código de producción: webhooks, pagos, migraciones,
`BillingService` (`lib/billing/service.ts`), worker de excedentes ni variables
de entorno. Todo son **archivos de prueba nuevos** bajo `web/src/qa-e2e/` más
este informe. Rama separada, **sin deploy**.

Módulos/rutas reales bajo prueba (importados sin alterarse):
`app/api/epayco/confirmation/route.ts`, `lib/epayco/client.ts`,
`lib/billing/service.ts`, `lib/billing/public-plans.ts`,
`lib/smarttalk/brand-scope.ts` y `app/api/cron/billing-lifecycle/route.ts`.
Las variables de entorno que la lógica lee (`EPAYCO_CUSTOMER_ID`, `EPAYCO_P_KEY`,
`BILLING_ENFORCEMENT_MODE`, `CRON_SECRET`, `BILLING_GRACE_DAYS`) se fijan **sólo
dentro del proceso de test**; no se toca ninguna configuración de entorno.

## Cómo ejecutar

Desde `web/`:

```bash
npx vitest run src/qa-e2e            # sólo esta suite
npm run test                        # pipeline completo
```

## Matriz de cobertura (requisito → prueba → resultado)

| # | Requisito | Archivo | Pruebas | Resultado |
|---|---|---|---:|:--:|
| 1 | Tres planes | `plans.test.ts` | 7 | ✅ |
| 2 | ePayco aprobado/rechazado/pendiente (ruta real) | `epayco.test.ts` | 9 | ✅ |
| 3 | Límites marcas/canales/asesores/contactos | `limits.test.ts` | 13 | ✅ |
| 4 | Aislamiento Marca A vs Marca B | `brand-isolation.test.ts` | 4 | ✅ |
| 5 | Ciclo de vida de suscripciones | `subscription-lifecycle.test.ts` | 9 | ✅ |
| 6 | Informe de evidencias | este documento | — | ✅ |
| | **Total** | | **42** | ✅ |

## 1. Planes demo

Matriz validada (de `DATOS_PRUEBA_BILLING.md`): mapeo de entitlements a límites
públicos, prefijo "Demo" removido, `-1` ⇒ ilimitado y exclusión si ePayco no
está habilitado.

| Código | Precio COP | Usuarios agencia | Asesores | Marcas | Canales | Contactos |
|---|---:|---:|---:|---:|---:|---:|
| `demo-inicial-2026` | 59.000 | 2 | 5 | 5 | 3 | 1.000 |
| `demo-crecimiento-2026` | 149.000 | 5 | 20 | 15 | 10 | (fixture) |
| `demo-escala-2026` | 299.000 | 15 | 75 | 50 | 30 | (fixture) |

## 2. ePayco — ruta real `POST /api/epayco/confirmation`

Se firma el payload con la firma real de ePayco
(`SHA256(customer_id^p_key^ref^transaction^amount^currency)`) y se ejecuta la
ruta completa contra el Supabase en memoria. Se verifica el **estado del pago**,
el **efecto sobre el checkout** y la **llamada al RPC**
`finalize_epayco_approved_payment` (que ocurre **sólo** en aprobado). También se
mantiene la prueba del mapeo puro `mapEpaycoStatus`.

| Caso (`x_cod_response`) | Pago | Checkout | RPC `finalize_epayco_approved_payment` | HTTP |
|---|---|---|:--:|:--:|
| 1 · aprobado | `approved` (con `approved_at`) | sin cambio (lo activa el RPC) | ✅ invocado | 200 |
| 2 · rechazado | `rejected` | `rejected` (con `completed_at`) | ❌ no | 200 |
| 3 · pendiente | `pending` | `pending` (sin `completed_at`) | ❌ no | 200 |
| firma inválida | — (no registra) | — | ❌ no | 400 |

> Se **eliminó** la constante autoafirmativa `ACTIVATES` de la versión anterior:
> la activación ahora se demuestra observando la invocación real del RPC, no una
> constante definida en la propia prueba.

## 3. Límites (frontera −1 / exacto / +1)

Con `BILLING_ENFORCEMENT_MODE=hard` y política `block`, `checkBillingFeature`
en la frontera de cada límite. Superadmin sin límites.

| Límite | Feature | −1 | exacto | +1 |
|---|---|:--:|:--:|:--:|
| Marcas | `brands.total` | permite | 402 | 402 |
| Canales | `channels.active` | permite | 402 | 402 |
| Asesores | `brand.advisors_total` | permite | 402 | 402 |
| Contactos | `contacts.total` | permite | 402 | 402 |

## 4. Aislamiento Marca A vs Marca B

Sobre `lib/smarttalk/brand-scope.ts`: un asesor asignado sólo a Marca A obtiene
`getAgentBrandIds = ["brand-a"]`, **puede** acceder a Marca A y **no** a Marca B,
ve la conversación de A y **no** la de B. El superadmin mantiene alcance global.

> El refuerzo RLS a nivel de base de datos (migración 028) es complementario y
> se valida en la BD; esta suite cubre el **scoping a nivel de aplicación**.

## 5. Ciclo de vida de suscripciones

**Acceso según estado** (vía `checkBillingFeature`): trial vigente ✅ · trial
vencido ❌ · active ✅ · past_due en gracia ✅ · past_due gracia vencida ❌ ·
suspended ❌ · cancelled ❌.

**Transiciones del cron** `/api/cron/billing-lifecycle`: `active` vencida →
`past_due`; `active` con `cancel_at_period_end` → `cancelled`; `past_due` con
gracia vencida → `suspended`; `active` vigente intacta; sin `CRON_SECRET` → 401.

## Resultado de ejecución (evidencia)

```
 Test Files  5 passed (5)
      Tests  42 passed (42)
```

| Archivo | Aprobadas | Fallidas |
|---|---:|---:|
| `plans.test.ts` | 7 | 0 |
| `epayco.test.ts` | 9 | 0 |
| `limits.test.ts` | 13 | 0 |
| `brand-isolation.test.ts` | 4 | 0 |
| `subscription-lifecycle.test.ts` | 9 | 0 |
| **Total** | **42** | **0** |

El log completo de ejecución se conserva en `docs/qa-evidence-integration-run.txt`.

## Qué cubre y qué no

- **Cubre:** la ruta real de confirmación de ePayco (firma, estado del pago,
  checkout, RPC de activación), la lógica real de billing (límites, estados de
  suscripción, transiciones del cron), el mapeo de ePayco y el scoping por marca,
  con datos sintéticos en memoria (cero acceso a la BD real).
- **No cubre (fuera de alcance):** políticas RLS a nivel de PostgreSQL (se
  validan en la BD), pruebas de navegador (no hay Playwright en el repo) ni
  cobros reales con la pasarela.

## Reproducir la evidencia

```bash
cd web
npx vitest run src/qa-e2e --reporter=verbose | tee ../docs/qa-evidence-integration-run.txt
```
