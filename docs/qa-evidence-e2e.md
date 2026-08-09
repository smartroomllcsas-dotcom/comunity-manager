# Informe de evidencias — Pruebas E2E de QA (Billing / Suscripciones)

- **Proyecto:** CommunityManager (`web/`)
- **Rama:** `codex/qa-e2e-tests` (base `ee77782`)
- **Fecha de ejecución:** 2026-08-06 10:27 -05
- **Runner:** vitest 4.1.10 · Node 22 · entorno `node`
- **Resultado global:** ✅ **39 / 39 pruebas aprobadas** (5 archivos)

## Alcance

Suite de pruebas E2E de QA a nivel de servicio/integración que **importa y
ejecuta los módulos reales** del sistema (no reimplementa la lógica) usando un
**Supabase en memoria** (`src/qa-e2e/helpers/fake-supabase.ts`). Cubre:

1. Los tres planes demo (Inicial / Crecimiento / Escala).
2. ePayco: aprobado, rechazado y pendiente.
3. Límites de marcas, canales, asesores y contactos.
4. Aislamiento entre Marca A y Marca B.
5. Ciclo de vida de suscripciones.
6. Este informe de evidencias.

### Restricciones respetadas

No se modificó **ningún** código de producción: webhooks, pagos, migraciones,
`BillingService` (`lib/billing/service.ts`), worker de excedentes ni variables
de entorno. Todo el trabajo son **archivos de prueba nuevos** bajo
`web/src/qa-e2e/` más este informe. Rama separada, **sin deploy**.

Los módulos reales bajo prueba se **importan sin alterarse**:
`lib/billing/service.ts`, `lib/billing/public-plans.ts`,
`lib/epayco/client.ts`, `lib/smarttalk/brand-scope.ts` y el cron
`app/api/cron/billing-lifecycle/route.ts`. Las variables de entorno que la
lógica lee (`BILLING_ENFORCEMENT_MODE`, `CRON_SECRET`, `BILLING_GRACE_DAYS`)
se fijan **sólo dentro del proceso de test**; no se toca ninguna configuración
de entorno del proyecto.

## Cómo ejecutar

Desde `web/`:

```bash
npx vitest run src/qa-e2e            # sólo la suite E2E de QA
# o dentro del pipeline completo:
npm run test
```

## Matriz de cobertura (requisito → prueba → resultado)

| # | Requisito | Archivo | Pruebas | Resultado |
|---|---|---|---:|:--:|
| 1 | Tres planes | `plans.test.ts` | 7 | ✅ |
| 2 | ePayco aprobado/rechazado/pendiente | `epayco.test.ts` | 6 | ✅ |
| 3 | Límites marcas/canales/asesores/contactos | `limits.test.ts` | 13 | ✅ |
| 4 | Aislamiento Marca A vs Marca B | `brand-isolation.test.ts` | 4 | ✅ |
| 5 | Ciclo de vida de suscripciones | `subscription-lifecycle.test.ts` | 9 | ✅ |
| 6 | Informe de evidencias | este documento | — | ✅ |
| | **Total** | | **39** | ✅ |

## 1. Planes demo

Matriz validada (de `DATOS_PRUEBA_BILLING.md`); la prueba verifica el mapeo de
entitlements a límites públicos, el prefijo "Demo" removido, `-1` ⇒ ilimitado y
la exclusión cuando ePayco no está habilitado.

| Código | Precio COP | Usuarios agencia | Asesores | Marcas | Canales | Contactos |
|---|---:|---:|---:|---:|---:|---:|
| `demo-inicial-2026` | 59.000 | 2 | 5 | 5 | 3 | 1.000 |
| `demo-crecimiento-2026` | 149.000 | 5 | 20 | 15 | 10 | (fixture) |
| `demo-escala-2026` | 299.000 | 15 | 75 | 50 | 30 | (fixture) |

> Nota: el único valor de contactos documentado como número exacto es Inicial
> (1.000, en `docs/qa-plan-limit-seed.md`). Para Crecimiento/Escala los
> contactos se usan como *fixture* para validar el mapeo; se asertan de forma
> estricta los demás límites de los tres planes.

## 2. ePayco (mapeo de estado)

Prueba de `mapEpaycoStatus` (usado por `/api/epayco/confirmation`) e invariante
de negocio: sólo **aprobado** activa/renueva.

| `x_cod_response` | Estado | ¿Activa suscripción? |
|:--:|---|:--:|
| 1 | approved (aprobado) | ✅ sí |
| 2 | rejected (rechazado) | ❌ no |
| 3 | pending (pendiente) | ❌ no |
| 4 | failed (fallido) | ❌ no |
| otro/vacío | pending (fail-safe) | ❌ no |

## 3. Límites (frontera −1 / exacto / +1)

Con `BILLING_ENFORCEMENT_MODE=hard` y política `block`, `checkBillingFeature`
se ejercita en la frontera de cada límite. Superadmin sin límites.

| Límite | Feature | −1 | exacto | +1 |
|---|---|:--:|:--:|:--:|
| Marcas | `brands.total` | permite | 402 | 402 |
| Canales | `channels.active` | permite | 402 | 402 |
| Asesores | `brand.advisors_total` | permite | 402 | 402 |
| Contactos | `contacts.total` | permite | 402 | 402 |

## 4. Aislamiento Marca A vs Marca B

Sobre `lib/smarttalk/brand-scope.ts`: un asesor asignado sólo a Marca A
obtiene `getAgentBrandIds = ["brand-a"]`, **puede** acceder a Marca A y **no** a
Marca B (`agentCanAccessBrand`), ve la conversación de A y **no** la de B
(`getAccessibleConversation` ⇒ `null`). El superadmin mantiene alcance global.

> El refuerzo RLS a nivel de base de datos (migración 028) es complementario y
> se valida en la BD; esta suite cubre el **scoping a nivel de aplicación**.

## 5. Ciclo de vida de suscripciones

**Acceso según estado** (vía `checkBillingFeature`):

| Estado | Acceso |
|---|:--:|
| trial vigente | ✅ permite |
| trial vencido | ❌ 402 (subscription_inactive) |
| active | ✅ permite |
| past_due dentro de gracia | ✅ permite |
| past_due gracia vencida | ❌ 402 |
| suspended | ❌ 402 |
| cancelled | ❌ 402 |

**Transiciones del cron** `/api/cron/billing-lifecycle`:

- `active` con periodo vencido → `past_due` (con `grace_ends_at`).
- `active` con `cancel_at_period_end` → `cancelled`.
- `past_due` con gracia vencida → `suspended`.
- `active` vigente → intacta.
- Sin `CRON_SECRET` válido → 401.

## Resultado de ejecución (evidencia)

```
 Test Files  5 passed (5)
      Tests  39 passed (39)
```

| Archivo | Aprobadas | Fallidas |
|---|---:|---:|
| `plans.test.ts` | 7 | 0 |
| `epayco.test.ts` | 6 | 0 |
| `limits.test.ts` | 13 | 0 |
| `brand-isolation.test.ts` | 4 | 0 |
| `subscription-lifecycle.test.ts` | 9 | 0 |
| **Total** | **39** | **0** |

El log completo de ejecución se conserva en `docs/qa-evidence-e2e-run.txt`.

## Qué cubre y qué no

- **Cubre:** la lógica real de billing (límites, estados de suscripción,
  transiciones del cron), el mapeo de ePayco y el scoping por marca a nivel de
  aplicación, con datos sintéticos en memoria (cero acceso a la BD real).
- **No cubre (fuera de alcance):** políticas RLS a nivel de PostgreSQL
  (se validan en la BD), pruebas de navegador (no hay Playwright en el repo) ni
  cobros reales con la pasarela (ePayco se valida por el mapeo de estado).

## Reproducir la evidencia

```bash
cd web
npx vitest run src/qa-e2e --reporter=verbose | tee ../docs/qa-evidence-e2e-run.txt
```
