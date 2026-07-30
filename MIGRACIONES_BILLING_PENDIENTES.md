# Migraciones de planes, pagos y suscripciones

Fecha de preparacion: 2026-07-29  
Fecha de aplicacion: 2026-07-30  
Estado: `009` y `010` aplicadas y verificadas en el proyecto Supabase `smartmedia`  
Renovacion inicial: manual

## Registro de aplicacion

Las migraciones se ejecutaron en orden desde SQL Editor con rol `postgres` y
cada archivo se envolvio en una transaccion `BEGIN`/`COMMIT`.

La CLI local no se utilizo porque no tenia un `SUPABASE_ACCESS_TOKEN` vigente.
Este proyecto tampoco expone la tabla
`supabase_migrations.schema_migrations`, por lo que la verificacion se hizo
contra los objetos reales creados en `smarttalk`.

Resultado verificado:

- Existe `smarttalk.feature_catalog`, marcador de `009`.
- Existe `smarttalk.payment_gateway_settings`, marcador de `010`.
- Existen `smarttalk.billing_audit_events` y
  `smarttalk.notification_logs`.
- El catalogo contiene 12 funciones comerciales.
- Existen tres pasarelas configurables.
- ePayco inicia habilitada para checkout en `sandbox` y renovacion `manual`.
- Wompi y PayU inician deshabilitadas en `sandbox` y renovacion `manual`.
- No se activaron cobros automaticos.

## Regla de despliegue

No ejecutar la migracion `010` sin haber aplicado y validado primero la `009`.
Crear un respaldo de la base de datos y probar ambas migraciones en staging antes
de ejecutarlas en produccion.

Para futuras migraciones, usar Supabase CLI cuando se configure un access token.
Si este despliegue sigue sin exponer `supabase_migrations.schema_migrations`,
validar el estado por objetos reales antes de ejecutar nuevamente archivos ya
aplicados.

## Orden obligatorio

1. `web/supabase/migrations/20260729000100_009_agency_billing_foundation.sql`
2. `web/supabase/migrations/20260729000200_010_multi_gateway_manual_renewal.sql`

## Migracion 009

Archivo:
`web/supabase/migrations/20260729000100_009_agency_billing_foundation.sql`

Objetivo:

- Crea catalogo de funciones, beneficios por plan y precios versionados.
- Amplia suscripciones sin reemplazar datos existentes.
- Crea sesiones de checkout, eventos de suscripcion, inbox de webhooks,
  contadores de consumo y auditoria de decisiones.
- Agrega politicas RLS de lectura por organizacion.
- Mantiene el control comercial apagado mediante
  `BILLING_ENFORCEMENT_MODE=off`.

## Migracion 010

Archivo:
`web/supabase/migrations/20260729000200_010_multi_gateway_manual_renewal.sql`

Objetivo:

- Registra configuracion operativa para `epayco`, `wompi` y `payu`.
- Permite un precio activo por plan, moneda, periodo y pasarela.
- Fuerza renovacion manual para organizaciones y suscripciones existentes.
- Prepara referencias a fuentes tokenizadas y proximo cobro, sin activarlas.
- Amplia pagos y webhooks con ambiente, idempotencia, intentos y errores.
- Finaliza pagos ePayco aprobados mediante una funcion PostgreSQL
  transaccional e idempotente.
- Crea snapshots de beneficios, notificaciones, auditoria y outbox.
- Agrega integridad referencial entre entidades comerciales y pasarelas.
- No almacena secretos de proveedores en PostgreSQL.

## Estado por pasarela

| Pasarela | Configurable | Precio configurable | Checkout | Renovacion |
|---|---:|---:|---|---|
| ePayco | Si | Si | Operativo despues de migrar y configurar sandbox | Manual |
| Wompi | Si | Si | Bloqueado hasta implementar/certificar webhook | Manual |
| PayU | Si | Si | Bloqueado hasta implementar/certificar confirmacion | Manual |

El bloqueo de Wompi y PayU es intencional. Evita que un usuario pague y que el
plan no se active. Los adaptadores y firmas ya estan preparados, pero no deben
recibir dinero hasta completar la activacion transaccional e idempotente.

## Variables requeridas

Base:

```env
BILLING_ENFORCEMENT_MODE=off
BILLING_GRACE_DAYS=3
PAYMENT_GATEWAY_DEFAULT=epayco
PAYMENT_ENVIRONMENT=sandbox
PAYMENT_RENEWAL_MODE=manual
PAYMENT_AUTO_RENEWAL_APPROVED=false
```

ePayco:

```env
NEXT_PUBLIC_EPAYCO_PUBLIC_KEY=
EPAYCO_PRIVATE_KEY=
EPAYCO_CUSTOMER_ID=
EPAYCO_P_KEY=
EPAYCO_TEST=true
```

Wompi:

```env
WOMPI_PUBLIC_KEY=
WOMPI_PRIVATE_KEY=
WOMPI_INTEGRITY_SECRET=
WOMPI_EVENTS_SECRET=
WOMPI_ENVIRONMENT=sandbox
```

PayU:

```env
PAYU_API_LOGIN=
PAYU_API_KEY=
PAYU_MERCHANT_ID=
PAYU_ACCOUNT_ID=
PAYU_ENVIRONMENT=sandbox
```

Las claves privadas y secretos nunca deben usar el prefijo `NEXT_PUBLIC_`.

## Validacion posterior a cada migracion

Antes de aplicar:

```bash
cd web
npx supabase login
npx supabase migration list --linked
npx supabase db push --dry-run
```

El `dry-run` debe mostrar solamente las migraciones esperadas. Si muestra
migraciones antiguas, detener el despliegue.

Consulta de validacion:

```sql
SELECT
  to_regclass('smarttalk.feature_catalog') AS migration_009,
  to_regclass('smarttalk.payment_gateway_settings') AS migration_010,
  to_regclass('smarttalk.billing_audit_events') AS audit_table,
  to_regclass('smarttalk.notification_logs') AS notifications_table;

SELECT gateway, is_enabled, checkout_enabled, environment, renewal_mode
FROM smarttalk.payment_gateway_settings
ORDER BY priority;

SELECT COUNT(*) AS automatic_organizations
FROM smarttalk.organizations
WHERE renewal_mode = 'automatic';

SELECT COUNT(*) AS automatic_subscriptions
FROM smarttalk.subscriptions
WHERE renewal_mode = 'automatic';
```

Resultados esperados:

- Existen los objetos marcadores de ambas migraciones.
- ePayco inicia habilitada en sandbox y Wompi/PayU deshabilitadas.
- Todas las renovaciones existentes permanecen en `manual`.
- La aplicacion compila y mensajeria conserva sus flujos actuales.

## Prueba minima antes de produccion

1. Crear o editar un plan.
2. Asignar precio ePayco en COP.
3. Abrir checkout sandbox.
4. Confirmar pago aprobado.
5. Verificar una sola fila en `payments`.
6. Verificar suscripcion activa y fecha de fin correcta.
7. Repetir el webhook y confirmar que no duplica pago ni periodo.
8. Renovar manualmente antes del vencimiento y confirmar que suma el nuevo
   periodo al final del periodo vigente.
9. Confirmar que Wompi y PayU aceptan configuracion, pero no permiten checkout.
10. Ejecutar pruebas de Facebook Messenger, WhatsApp e Instagram.
11. Simular un fallo/reintento y confirmar que la funcion
    `finalize_epayco_approved_payment` no extiende dos veces.

## Reversion

Primera respuesta operativa, sin destruir datos:

```env
BILLING_ENFORCEMENT_MODE=off
PAYMENT_RENEWAL_MODE=manual
PAYMENT_AUTO_RENEWAL_APPROVED=false
```

Ademas, deshabilitar checkout desde
`/admin/payment-gateways`. No eliminar tablas ni columnas en una emergencia.
Si se requiere correccion de esquema, crear una migracion `011` hacia adelante.
