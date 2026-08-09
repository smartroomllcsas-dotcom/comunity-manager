# Pruebas de integración de QA (Billing / Suscripciones)

Suite de **pruebas de integración** de QA que **importa y ejecuta los módulos y
rutas reales** del sistema y los ejecuta contra un **Supabase en memoria** (sin red, sin BD
real). No modifica código de producción.

## Ejecutar

```bash
cd web
npx vitest run src/qa-e2e            # sólo esta suite
npm run test                        # pipeline completo
```

## Archivos

- `helpers/fake-supabase.ts` — query-builder de supabase-js en memoria
  (select/insert/update/delete, filtros encadenados, count/head, maybeSingle).
- `helpers/fixtures.ts` — matriz de los 3 planes demo y constructores de
  organización / suscripción / entitlement.
- `plans.test.ts` — Req 1: los tres planes.
- `epayco.test.ts` — Req 2: ePayco aprobado/rechazado/pendiente ejecutando la
  ruta real `POST /api/epayco/confirmation` (estado del pago, checkout y RPC
  `finalize_epayco_approved_payment`).
- `limits.test.ts` — Req 3: límites marcas/canales/asesores/contactos.
- `brand-isolation.test.ts` — Req 4: aislamiento Marca A vs Marca B.
- `subscription-lifecycle.test.ts` — Req 5: ciclo de vida (acceso + cron).

El informe de evidencias está en `docs/qa-evidence-integration.md`.

## Diseño

Cada spec mockea `@/lib/supabase/admin` y `@/lib/supabase/server` con el fake en
memoria y siembra sólo las tablas que el módulo bajo prueba consulta. Las
variables de entorno que la lógica lee (`BILLING_ENFORCEMENT_MODE`,
`CRON_SECRET`, `BILLING_GRACE_DAYS`) se fijan sólo dentro del proceso de test.
