# Onboarding publico de planes

Proyecto: CommunityManager
Fecha: 2026-07-30
Estado: desplegado en Vercel Production

## Objetivo

Permitir que una persona sin sesion:

1. Ingrese a `https://www.comunitymanager.io`.
2. Consulte los planes comerciales vigentes.
3. Seleccione un plan.
4. Registre la agencia y su usuario administrador.
5. Revise el resumen.
6. Inicie el pago mediante una pasarela habilitada.

La seleccion del plan nunca activa servicios. La organizacion inicia con el
plan gratuito y el plan comercial queda pendiente hasta recibir una
confirmacion de pago aprobada.

## Rutas

| Ruta | Acceso | Uso |
|---|---|---|
| `/` | Publico | Portada y catalogo de planes |
| `/register?plan=<codigo>` | Publico | Registro comercial |
| `/checkout?plan=<codigo>` | Autenticado | Resumen e inicio del pago |
| `/app` | Autenticado | Panel privado anterior |
| `/settings/billing` | Autenticado | Administracion posterior |

El panel que anteriormente estaba en `/` se movio a `/app`. No se modificaron
las rutas, webhooks ni servicios de Messenger, WhatsApp o Instagram.

## Controles de seguridad

- Los planes publicos se consultan en servidor con `service_role`.
- Solo se exponen los tres planes comerciales activos.
- Un plan debe estar activo, ser publico, tener precio COP mensual y una
  pasarela habilitada.
- El precio mostrado no se acepta como autoridad durante el checkout.
- `/api/billing/checkout` vuelve a consultar monto, moneda, plan y pasarela.
- Solo un agente con rol `admin` puede iniciar el pago.
- Cada intento requiere `Idempotency-Key`.
- El alta esta limitada a tres solicitudes por IP cada hora.
- Un correo existente no puede registrarse de nuevo ni reemplazar una cuenta
  de Supabase Auth.
- Un pago pendiente, rechazado, fallido o vencido no activa el plan.
- El plan se activa solamente mediante el proceso transaccional del webhook.

## Migracion 012

Archivo:
`web/supabase/migrations/20260730000200_012_public_plan_onboarding.sql`

Aplicada en Supabase `smartmedia` el 2026-07-30.

Columnas aditivas en `smarttalk.organizations`:

- `billing_email`
- `billing_phone`
- `billing_country_code`
- `onboarding_plan_id`
- `onboarding_status`

Estados de onboarding:

- `not_started`
- `pending_payment`
- `checkout_started`
- `active`
- `payment_rejected`
- `payment_failed`
- `payment_expired`
- `cancelled`

Tambien crea:

- Indice parcial `idx_organizations_onboarding`.
- Funcion `sync_checkout_onboarding_status`.
- Trigger del mismo nombre sobre `checkout_sessions`.
- Evento en `billing_audit_events`.

## Evidencia

- `npm test`: 99 pruebas aprobadas.
- `npm run lint -- --quiet`: aprobado.
- `npx tsc --noEmit`: aprobado.
- `npm run build`: aprobado.
- Deployment Vercel Production: `Ready`.
- Dominio: `https://www.comunitymanager.io`.
- `/`: HTTP 200 y muestra Inicial, Crecimiento y Escala.
- Registro Inicial: HTTP 200.
- Usuario creado como `admin` y `agency_user`.
- Agencia creada con plan gratuito.
- `onboarding_status`: `pending_payment`.
- `onboarding_plan`: `demo-inicial-2026`.
- Suscripciones creadas antes del pago: cero.
- Checkout sin credenciales: HTTP 409,
  `PAYMENT_GATEWAY_NOT_CONFIGURED`.
- No se creo pago ni sesion de checkout al fallar la configuracion.

## Variables pendientes para ePayco sandbox

No eliminar ni reemplazar variables existentes. Agregar o confirmar:

```env
NEXT_PUBLIC_APP_URL=https://www.comunitymanager.io
NEXT_PUBLIC_EPAYCO_PUBLIC_KEY=
EPAYCO_PRIVATE_KEY=
EPAYCO_CUSTOMER_ID=
EPAYCO_P_KEY=
EPAYCO_TEST=true
```

El checkout permanecera bloqueado hasta que las variables requeridas tengan
valores validos. Esto es intencional.

## Orden de despliegue

1. Confirmar que la migracion `012` existe en Supabase. Completado.
2. Ejecutar pruebas locales. Completado.
3. Subir el codigo a GitHub. Completado en `699e807`.
4. Desplegar a Production. Completado.
5. Verificar `/`, `/register`, `/login`, `/app` y `/checkout`. Completado.
6. Agregar credenciales ePayco sandbox en Vercel sin borrar variables.
7. Ejecutar un pago sandbox aprobado.
8. Confirmar una sola suscripcion activa y un solo periodo.
9. Repetir el webhook y comprobar idempotencia.
10. Repetir regresion de Messenger, WhatsApp e Instagram.

## Reversion

Reversion de aplicacion:

- Volver al deployment anterior en Vercel.
- Mantener la migracion `012`; sus columnas son aditivas y no afectan canales.
- Mantener `BILLING_ENFORCEMENT_MODE=off`.
- Deshabilitar checkout en `/admin/payment-gateways` si es necesario.

No eliminar tablas, columnas, pagos ni eventos de auditoria durante una
incidencia.
