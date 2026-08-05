# Validacion comercial por planes

## Alcance

Este documento describe la validacion de planes, suscripciones, canales,
contactos y equipo en CommunityManager. Las pruebas deben ejecutarse con
cuentas de agencia normales. El superadministrador no es una cuenta valida
para probar limites porque el backend le concede acceso ilimitado por diseño.

## Variables de produccion

En Vercel, proyecto `comunityagent`, agregar o confirmar estas variables en
`Production` sin eliminar las existentes:

```env
BILLING_ENFORCEMENT_MODE=hard
BILLING_GRACE_DAYS=3
EPAYCO_TEST=true
NEXT_PUBLIC_APP_URL=https://www.comunitymanager.io
```

Las credenciales privadas de ePayco, Wompi y PayU deben permanecer sin el
prefijo `NEXT_PUBLIC_`. Después de cambiar variables se debe crear un nuevo
deployment para que Vercel las cargue.

`BILLING_ENFORCEMENT_MODE=off` desactiva todos los límites comerciales para
clientes. Solo debe usarse durante una contingencia controlada, nunca para la
prueba final de los planes.

## Cuenta sin suscripción activa

El valor técnico `organizations.plan_id = Free` no activa una cuenta por sí
solo. Una cuenta normal solo queda habilitada cuando tiene una fila de
`subscriptions` en estado `trial`, `active` o `past_due` dentro de su periodo
válido. El superadministrador es la única excepción y tiene acceso ilimitado.

Cuando la cuenta no tiene una suscripción válida, la aplicación muestra en la
parte superior de las vistas privadas el aviso **Cuenta no activa** con el
enlace **Ver planes**. Si el último intento fue rechazado, el aviso cambia a
**Pago rechazado** y explica que debe completar nuevamente el pago.

Las operaciones comerciales también se protegen en backend. En modo `hard`,
crear marcas, conectar o reactivar canales, invitar equipo, importar contactos,
enviar mensajes/broadcasts y usar funciones premium responden HTTP `402` con:

```json
{
  "code": "BILLING_SUBSCRIPTION_REQUIRED",
  "redirect": "/settings/billing"
}
```

No es suficiente ocultar botones en el frontend. El aviso visual orienta al
usuario y el `402` evita que una llamada directa a la API evada el requisito.
Después de un pago aprobado, el webhook activa la suscripción y el aviso deja
de aparecer sin cambiar la organización ni mezclar sus datos.

## Preparacion

1. Crear tres cuentas de agencia desde los planes públicos o usar tres
   organizaciones de QA existentes. Nombrarlas `[QA] Inicial`, `[QA]
   Crecimiento` y `[QA] Escala`.
2. Confirmar que cada organización tenga una suscripción `active` o `trial`,
   un plan y un usuario administrador de agencia que no sea
   `is_super_admin=true`.
3. Mantener los tres clientes aislados. No reutilizar la misma marca,
   organización, canal o usuario para comparar planes.
4. Verificar en `Mi plan` que el número de marcas, canales, contactos,
   usuarios de agencia y asesores coincida con `plan_entitlements`.

## Matriz de pruebas

| Area | Caso | Resultado esperado |
| --- | --- | --- |
| Compra | Pagar con ePayco en modo prueba | Pago aprobado crea o activa una suscripcion en la organizacion compradora; el webhook repetido no duplica el pago |
| Compra | Pago pendiente o rechazado | No activa servicios; la organizacion conserva el estado correcto y el intento queda auditado |
| Equipo | Invitar usuario de agencia | Se bloquea al alcanzar `agency.users`, contando invitaciones pendientes |
| Equipo | Invitar asesor | Se bloquea al alcanzar `brand.advisors_total` y tambien `brand.advisors_per_brand` |
| Equipo | Invitar administrador de marca | Solo una persona puede administrar cada marca y solo puede actuar sobre esa marca |
| Marcas | Crear marca | Se bloquea al alcanzar `brands.total`; no se debe contar el superadministrador como cliente |
| Canales | Crear canal manual, OAuth Meta o WhatsApp | Los tres caminos aplican `channels.active`; reconectar o actualizar un canal existente no consume otro cupo |
| Canales | Desconectar y reactivar | Al reactivar se vuelve a validar el limite vigente |
| Contactos | Importar contactos nuevos | Se importan solo hasta `contacts.total`; filas existentes se actualizan y no consumen cupo |
| Contactos | Mensaje entrante nuevo por Facebook, Instagram o WhatsApp | El evento se acepta y el contacto queda en su organizacion/marca; si excede el limite, la decision queda auditada y no se pierde el mensaje |
| Aislamiento | Asesor de marca A consulta marca B | No ve marcas, canales, contactos, conversaciones ni mensajes de B; una URL o API manual debe responder `403` o `404` |
| Superadmin | Repetir las pruebas con el dueño de la plataforma | Puede operar sin limite y no representa el comportamiento comercial de un cliente |

## Prueba de canales sin credenciales reales

Para probar el contador sin conectar cuentas personales, usar la ruta
autenticada `POST /api/channels` desde una sesión de administrador de la
organización de QA. Crear canales `pending` con nombres claramente marcados,
por ejemplo `[QA] Facebook 1`, `[QA] Instagram 1` y `[QA] WhatsApp 1`.
La misma decisión de backend se reutiliza en OAuth Meta, Embedded Signup de
WhatsApp, sincronización legacy y reactivación.

No insertar canales directamente en Supabase para validar límites: eso evita
intencionalmente el backend y produce una prueba inválida. La base de datos se
puede consultar para inspección, pero las altas deben pasar por la API.

## Prueba de leads por marca y canal

1. Crear dos marcas en una organización de QA.
2. Asociar un canal diferente a cada marca.
3. Crear o recibir un contacto en cada canal.
4. Confirmar en `Leads` e `Inbox` que cada registro conserva
   `organization_id`, `brand_id` y `channel_id` correctos.
5. Iniciar sesión como asesor de la marca A y confirmar que no puede leer ni
   modificar los registros de la marca B.
6. Repetir la prueba con Facebook, Instagram y WhatsApp. Un webhook duplicado
   debe dejar un solo mensaje gracias a la deduplicación por id del proveedor.

## Regla para mensajes entrantes sobre el límite

Los límites de contactos sí bloquean las importaciones y altas administrativas.
Los webhooks externos no se rechazan por ese límite: Meta y WhatsApp podrían
reintentar o perder el mensaje. El sistema registra una decisión de billing con
`allowed=false`, conserva el contacto y procesa la conversación. Esto es una
decisión de continuidad operativa y debe explicarse al cliente como una
política de recepción de mensajes, no como contactos ilimitados.

## Evidencia que se debe guardar

- Captura o referencia del pago aprobado, pendiente y rechazado.
- Organización, plan, estado y periodo de cada suscripción.
- Conteo antes y después de cada límite.
- Respuesta HTTP `402` de cada operación bloqueada.
- Usuario, marca y canal usados para cada prueba de aislamiento.
- Registro de `billing_decision_events` para límites alcanzados y webhooks
  entrantes sobre el límite.
- Confirmación de que el superadministrador fue probado por separado.

## Despliegue y reversa

1. Respaldar Supabase.
2. Confirmar que la migración
   `20260804000000_026_brand_administrators.sql` ya fue aplicada.
3. Desplegar la aplicación.
4. Configurar `BILLING_ENFORCEMENT_MODE=hard` en Vercel y redeployar.
5. Ejecutar esta matriz con organizaciones `[QA]`.
6. Si aparece una regresión, volver al deployment anterior y cambiar
   temporalmente el modo a `observe`; no borrar tablas, suscripciones,
   eventos ni políticas RLS.

## Estado de esta implementación

- Aplicado en backend: límites de canales en creación manual, OAuth Meta,
  OAuth Instagram, ambos intercambios de WhatsApp, sync legacy, Respond.io y
  reactivación.
- Aplicado en backend: límite de contactos en importación y auditoría segura
  para entradas de Facebook, Instagram, WhatsApp y Respond.io.
- Aplicado en frontend: aviso global de cuenta no activa, pago rechazado o pago
  pendiente en las vistas privadas; la vista de facturación muestra el motivo
  y conserva los planes disponibles para completar la activación.
 - Aplicado en frontend: `/clients` valida `/api/billing/status` antes de mostrar
   el formulario; sin suscripción activa el botón de creación queda deshabilitado,
   el formulario no se renderiza y se ofrece el enlace para activar un plan.
 - Aplicado en backend: `POST /api/cm/clients` ejecuta la misma verificación
   centralizada antes del `INSERT`; una llamada directa sin suscripción responde
   `402 BILLING_SUBSCRIPTION_REQUIRED`. El superadministrador conserva el bypass.
- Aplicado en backend: el plan `Free` heredado no sustituye una suscripción y
  `BILLING_ENFORCEMENT_MODE=hard` se respeta aunque la organización conserve el
  valor histórico `observe`.
- Plataformas comerciales actuales para nuevas marcas: Instagram, Facebook y
  WhatsApp. Las etiquetas heredadas de otras plataformas no se eliminan de
  registros existentes y no se alteran sus flujos de conexión.
- Aplicado en backend y facturación: las lecturas de organización y suscripción
  usan explícitamente las relaciones `plan_id` (`organizations_plan_id_fkey` y
  `subscriptions_plan_id_fkey`). Esto evita que PostgREST confunda los campos
  de onboarding/pending y muestre "Cuenta no activa" después de un pago aprobado.
- Validado en Supabase: el pago ePayco `379960820` está `approved`, la suscripción
  está `active`, la organización está activa y el plan es `Demo Inicial`.
- No se agregó una migración nueva para estos controles; reutilizan las tablas
  y el catálogo de billing existentes.
- Pendiente de operación: completar la matriz con tres organizaciones no
  superadmin y validar una cuenta que no tenga suscripción para comprobar que
  el aviso y el bloqueo continúan funcionando.
