# Implementacion del sistema comercial de CommunityManager

Fecha: 2026-07-29  
Estado: codigo validado localmente; migraciones `009` y `010` aplicadas en Supabase `smartmedia` el 2026-07-30  

## Actualizacion multi-pasarela 2026-07-29

Se preparo una segunda migracion aditiva y una capa desacoplada para configurar
ePayco, Wompi y PayU:

- Migracion `010_multi_gateway_manual_renewal`.
- Panel `/admin/payment-gateways`.
- Precios independientes por plan y pasarela.
- Checkout generico con idempotencia obligatoria.
- Adaptadores `EpaycoGateway`, `WompiGateway` y `PayUGateway`.
- Firmas SHA-256 para checkout Wompi, eventos Wompi, WebCheckout PayU y
  confirmacion PayU.
- Finalizacion ePayco transaccional e idempotente mediante
  `finalize_epayco_approved_payment`.
- Renovacion manual obligatoria.
- Campos y outbox preparados para futura tokenizacion y renovacion automatica.

Estado operativo:

- ePayco: checkout y confirmacion disponibles despues de aplicar migraciones y
  configurar credenciales.
- Wompi y PayU: configuracion, precios y adaptadores preparados; checkout
  bloqueado deliberadamente hasta implementar y certificar el procesamiento
  transaccional de sus webhooks.
- Las migraciones `009` y `010` se ejecutaron y verificaron en la base remota.

El procedimiento exacto se encuentra en
`MIGRACIONES_BILLING_PENDIENTES.md`.

El manual completo de variables, Supabase, Vercel, pruebas y aprobaciones se
encuentra en `GUIA_OPERATIVA_FASE_2_DESPLIEGUE.md`.
Modelo comercial aprobado: una suscripcion por agencia

## 1. Decision de arquitectura

La suscripcion pertenece a `smarttalk.organizations`, que representa la
agencia. Las marcas administradas por la agencia continúan en
`public.cm_clients` y se relacionan mediante
`cm_clients.smarttalk_organization_id`.

Este modelo permite:

- Una factura y una suscripcion por agencia.
- Varios usuarios y marcas bajo el mismo plan.
- Limites acumulados para toda la agencia.
- Cambio de plan sin alterar las conexiones de Facebook, Instagram o WhatsApp.
- Mantener operativos los webhooks entrantes durante una mora o suspension.

No se implemento una suscripcion independiente por cada marca porque duplicaria
pagos, estados y soporte, y no corresponde al uso actual multiusuario.

## 2. Cambios implementados

### 2.1 Base de datos aditiva

Migracion preparada:

`web/supabase/migrations/20260729000100_009_agency_billing_foundation.sql`

La migracion agrega, sin eliminar tablas ni columnas existentes:

- Catalogo de funciones comerciales: `feature_catalog`.
- Limites por plan: `plan_entitlements`.
- Precios versionados por moneda: `plan_prices`.
- Sesiones de checkout: `checkout_sessions`.
- Eventos de webhook: `billing_webhook_events`.
- Historial de suscripcion: `subscription_events`.
- Eventos y contadores de consumo: `usage_events` y `usage_counters`.
- Decisiones de limites: `billing_decision_events`.
- Campos de ciclo de vida, gracia, suspension y proveedor.
- Restricciones de unicidad para evitar pagos y suscripciones actuales
  duplicadas.
- Funcion atomica `record_billing_usage`, disponible solo para `service_role`.
- Politicas RLS de lectura por organizacion para los datos comerciales.

La migracion no activa bloqueos. La variable global queda en `off`.

### 2.2 Motor central de limites

Archivos:

- `web/src/lib/billing/features.ts`
- `web/src/lib/billing/service.ts`

Modos disponibles:

- `off`: no consulta ni bloquea.
- `observe`: calcula y registra lo que bloquearia, pero permite la accion.
- `soft`: permite la accion y deja trazabilidad para avisos.
- `hard`: bloquea con respuesta `402` cuando se supera el limite.

El modo efectivo nunca puede ser mas estricto que el modo global. Esto permite
activar una agencia piloto sin habilitar bloqueos para todos los clientes.

Funciones conectadas inicialmente:

- Usuarios e invitaciones.
- Marcas totales.
- Canales activos.
- Mensajes salientes mensuales.
- Publicaciones mensuales.
- Campanas/envios masivos mensuales.
- Acceso y solicitudes mensuales de IA.

Los webhooks entrantes de Meta y WhatsApp no fueron bloqueados. Esta decision
evita perdida de mensajes durante mora, cambios de plan o incidentes de pago.

### 2.3 Administracion de planes

Se agregaron APIs de servidor protegidas para crear y editar planes:

- `web/src/app/api/admin/plans/route.ts`
- `web/src/app/api/admin/plans/[id]/route.ts`
- `web/src/lib/admin/verify-super-admin.ts`
- `web/src/lib/billing/admin-plans.ts`

El panel `web/src/app/(admin)/admin/plans/page.tsx` ya no modifica planes
directamente desde el navegador. Permite configurar:

- Estado y visibilidad.
- Moneda y precio en unidades menores.
- Limites de marcas, canales y mensajes.
- Entitlements versionados.
- Archivado seguro en vez de borrado destructivo.

### 2.4 Checkout y confirmacion ePayco

Archivos principales:

- `web/src/lib/epayco/client.ts`
- `web/src/app/api/epayco/checkout/route.ts`
- `web/src/app/api/epayco/confirmation/route.ts`

Controles aplicados:

- Checkout exclusivo para administradores de la agencia.
- Precio obtenido en servidor desde `plan_prices`.
- Referencia interna y sesion opaca con expiracion.
- Firma SHA-256 de ePayco validada en tiempo constante.
- Validacion estricta de cliente, referencia, monto, moneda y ambiente.
- Registro sanitizado del payload; no se guardan campos sensibles no permitidos.
- Idempotencia por transaccion y por evento.
- Reintento seguro después de fallos parciales.
- Un pago rechazado o pendiente no elimina una suscripcion valida anterior.
- Un checkout aprobado solo se finaliza despues de activar la suscripcion.

La implementacion actual compra un periodo prepagado mensual o anual. No guarda
tarjetas. Para cobro automatico recurrente se debe contratar y probar el
producto de tokenizacion/recurrencia de ePayco antes de habilitar renovaciones
automaticas.

### 2.5 Ciclo de vida

Ruta:

`web/src/app/api/cron/billing-lifecycle/route.ts`

Programacion:

`web/vercel.json`

Comportamiento:

- Suscripcion vencida: pasa a `past_due` y abre periodo de gracia.
- Gracia vencida: pasa a `suspended`.
- Cancelacion programada: finaliza al terminar el periodo.
- La organizacion no se desactiva por completo; se suspenden funciones
  comerciales mediante el motor de limites.
- Cada cambio queda registrado en `subscription_events`.

La ruta exige `Authorization: Bearer <CRON_SECRET>`.

### 2.6 Alta segura de marcas

Ruta:

`web/src/app/api/cm/clients/route.ts`

El alta de una marca dejo de confiar en una insercion directa desde el
navegador. Ahora:

- Valida sesion y cuenta CM.
- Exige administrador de agencia.
- Asigna `smarttalk_organization_id` en el servidor.
- Consulta el limite `brands.total`.
- Conserva el modo MySQL solo para desarrollo local.
- Registra la actividad desde servidor.

El puente de inicio de sesion ya no depende de `cm_users.cm_client_id`, columna
que no existe en la base auditada. Resuelve la agencia a partir de las marcas
propiedad del usuario y vincula las marcas antiguas que aun no tengan agencia.

### 2.7 Contraseñas

Archivo:

`web/src/lib/password.ts`

Las contraseñas nuevas usan `scrypt` con sal aleatoria. Las contraseñas
heredadas en texto plano se aceptan durante el inicio de sesion una sola vez y
se reemplazan inmediatamente por un hash. El hash no se devuelve al navegador.

### 2.8 Autorizacion de recursos CM

Archivo:

`web/src/lib/cm-client-access.ts`

Se agrego validacion de propiedad antes de iniciar conexiones o consultar
recursos sensibles de Meta, Instagram y WhatsApp. Los callbacks OAuth siguen
usando su estado de un solo uso.

## 3. Compatibilidad y seguridad operacional

- No se modificaron los procesadores de mensajes entrantes.
- No se desconectaron canales existentes.
- Las migraciones `009` y `010` fueron aplicadas a la base remota el
  2026-07-30 mediante SQL Editor con rol `postgres`.
- No se activaron bloqueos comerciales.
- No se configuraron precios reales ni credenciales.
- El esquema es aditivo y conserva columnas de planes heredadas durante la
  transicion.
- Los planes sin precio activo aparecen como no disponibles para compra.

## 4. Variables requeridas

Configurar en el entorno de despliegue:

```dotenv
BILLING_ENFORCEMENT_MODE=off
BILLING_GRACE_DAYS=3
CRON_SECRET=<secreto-aleatorio-largo>

NEXT_PUBLIC_APP_URL=https://dominio-produccion
NEXT_PUBLIC_EPAYCO_PUBLIC_KEY=<public-key>
EPAYCO_PRIVATE_KEY=<private-key>
EPAYCO_CUSTOMER_ID=<customer-id>
EPAYCO_P_KEY=<p-key>
EPAYCO_TEST=true
```

`EPAYCO_TEST` debe permanecer en `true` hasta completar pruebas end-to-end.

## 5. Orden de despliegue recomendado

1. Crear respaldo lógico de los esquemas `public` y `smarttalk`.
2. Crear un entorno staging con copia anonimizada de datos.
3. Ejecutar la migracion en staging.
4. Vincular manualmente cualquier marca antigua sin
   `smarttalk_organization_id`; no asumir correspondencias por nombre.
5. Crear precios COP o USD reales en `plan_prices`.
6. Desplegar la aplicacion con `BILLING_ENFORCEMENT_MODE=off`.
7. Probar login, bandeja, envio/recepcion y conexiones de los tres canales.
8. Probar ePayco en ambiente de pruebas: aprobado, rechazado, pendiente,
   firma invalida, monto alterado y webhook duplicado.
9. Cambiar globalmente a `observe` y revisar `billing_decision_events` durante
   al menos un ciclo operativo.
10. Activar `hard` solo para una agencia piloto y despues ampliar
    progresivamente.
11. Cambiar `EPAYCO_TEST=false` unicamente con credenciales y URL de
    confirmacion de produccion verificadas.

## 6. Verificaciones locales realizadas

- `npm test`: 6 pruebas aprobadas.
- Casos probados: hash y migracion de contrasena heredada, firma ePayco,
  manipulacion de firma/monto, conversion monetaria, sanitizacion, firmas de
  integridad/eventos Wompi y firmas de checkout/confirmacion PayU.
- `npm run lint -- --quiet`: sin errores.
- `git diff --check`: sin errores de formato.
- `npm run build`: compilacion y TypeScript verificados durante el desarrollo;
  debe repetirse despues de instalar dependencias en CI.

El lint completo reporta advertencias heredadas que no bloquean la compilacion.
No se corrigieron masivamente para evitar cambios laterales en modulos
funcionales.

El lint de Supabase local no se pudo ejecutar porque esta maquina no tiene
Docker ni Podman disponibles. Las migraciones fueron ejecutadas en Supabase
`smartmedia` dentro de transacciones independientes y sus objetos principales
fueron verificados despues de la aplicacion.

## 7. Riesgos y trabajo pendiente

- Las politicas RLS permisivas heredadas de varias tablas `public.cm_*` deben
  reemplazarse en una fase separada, despues de mover todas las lecturas y
  escrituras restantes a APIs autenticadas.
- El limite de marcas usa comprobacion previa e insercion; dos solicitudes
  exactamente simultaneas podrian excederlo por una unidad. Si el volumen lo
  exige, debe convertirse en una operacion SQL transaccional.
- La activacion de pago realiza varias escrituras idempotentes, pero no una
  unica transaccion SQL. Una funcion transaccional del lado de Postgres seria
  la siguiente mejora antes de alto volumen.
- La recurrencia automatica requiere un contrato/API especifica de ePayco y no
  debe simularse almacenando datos de tarjeta.
- Existen vulnerabilidades transitivas pendientes en dependencias. Next se
  actualizo a `16.2.12`; no se aplico la actualizacion mayor de Anthropic sin
  una prueba de compatibilidad.
- La migracion de hashes se completa gradualmente al iniciar sesion. Se
  recomienda medir cuantas cuentas heredadas quedan.

## 8. Reversion

Reversion inmediata de comportamiento:

1. Establecer `BILLING_ENFORCEMENT_MODE=off`.
2. Volver a desplegar la version anterior si existe una regresion de interfaz.
3. Mantener las tablas nuevas; al ser aditivas no interfieren con mensajeria.
4. No eliminar pagos ni eventos de auditoria.

Reversion de base de datos:

- Debe realizarse solo desde el respaldo y durante mantenimiento.
- Antes de eliminar tablas nuevas, exportar pagos, webhooks y eventos.
- No eliminar columnas agregadas mientras alguna version desplegada las use.

La estrategia principal de reversión es apagar enforcement, no destruir datos
comerciales.

## 9. Referencias oficiales verificadas

- [ePayco: paginas de respuesta y confirmacion](https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion)
- [ePayco: tokenizacion de clientes](https://docs.epayco.com/v1/docs/tokenizacion-de-clientes)
- [ePayco: cobros con token y suscripciones](https://docs.epayco.com/docs/cobrar-con-token)
