# QA de limites del plan Demo Inicial

## Que prepara

El script `web/supabase/seed/qa_demo_inicial_limit.sql` prepara la organizacion
`QA Agencia Inicial` usando la suscripcion activa que ya existe:

- 5 marcas, hasta el limite `brands.total` del plan.
- 3 canales simulados activos: Facebook Messenger, Instagram y WhatsApp.
- Los canales se distribuyen entre las primeras tres marcas.
- Contactos sinteticos hasta `max_contacts` del plan, actualmente 1.000.
- Una conversacion y un mensaje entrante de prueba por cada canal simulado.
- Usuarios de agencia hasta el limite, usando una invitacion sintetica pendiente.
- Asesores de marca hasta el limite, uno por marca mediante invitaciones sinteticas.
- Un administrador de marca pendiente por cada marca, asignado de forma aislada.
- Broadcasts completados sinteticos hasta el limite mensual, sin destinatarios ni envio.
- Flujos de chatbot inactivos sinteticos hasta el limite.
- Cinco invitaciones de asesor, una por cada marca, y cinco invitaciones de
  administrador de marca, cada una asignada a una sola marca.

Todos los registros simulados llevan `qa_seed = true` o la etiqueta
`qa-seed`. No se crean tokens, cuentas OAuth ni conexiones reales con Meta o
WhatsApp.

## Como ejecutarlo

1. Abrir el SQL Editor del proyecto Supabase correcto.
2. Ejecutar `qa_demo_inicial_limit.sql` completo, sin modificar el bloque de seguridad.
3. Confirmar el resultado `qa_seed_result`.
4. En CommunityManager validar Facturacion y Uso:
   - Marcas: `5 / 5`.
   - Canales activos: `3 / 3`.
   - Contactos: `1.000 / 1.000`.
   - Usuarios de agencia: `2 / 2`.
   - Asesores de marca: `5 / 5`.
   - Broadcasts del mes: `10 / 10`.
   - Flujos: `2 / 2`.
5. En Equipo confirmar las invitaciones QA y sus marcas asignadas. Los correos
   usan el dominio `.invalid`, por lo que no se envian invitaciones reales.
6. Abrir Inbox y confirmar un mensaje QA de Facebook, Instagram y WhatsApp.
7. Intentar crear una sexta marca: el boton debe estar bloqueado o el backend
   debe responder con limite excedido.
8. Intentar crear otro asesor, usuario, broadcast o flujo. Cada operacion debe
   ser bloqueada por el backend al alcanzar su limite.
9. Intentar conectar un cuarto canal real solo despues de verificar que el
   tercero ya aparece como activo. La operacion debe ser rechazada por el
   limite, sin llamar al proveedor si el backend la valida antes.
10. Abrir el detalle de un contacto y usar `Eliminar contacto` con un usuario
    administrador. La eliminación borra sus conversaciones por cascada y
    libera un cupo; un asesor no puede ejecutar esta operación.

## Prueba de contacto sobre el limite

La migracion `20260805000100_027_contact_quota_restrictions.sql` agrega el
estado `restricted` a los contactos. Con `BILLING_ENFORCEMENT_MODE=hard`:

1. Enviar un lead nuevo por Facebook Messenger, Instagram o WhatsApp cuando
   el contador ya este en `1.000/1.000`.
2. Confirmar que el webhook responde correctamente y que el lead queda en la
   marca y canal propietarios con su nombre.
3. Confirmar que no se crea conversacion ni mensaje para ese lead.
4. Confirmar que Contactos muestra `Oculto por limite del plan` y no muestra
   telefono, identificador del proveedor ni contenido del mensaje.
5. Solicitar el detalle o los mensajes directamente por API: debe responder
   `402 contact_restricted`.
6. Eliminar/liberar un contacto valido o ampliar el plan y repetir el flujo.
   Los nuevos leads deben volver a tener contacto completo y conversacion.

Los contactos restringidos también cuentan para el límite hasta que un
administrador los elimine desde Contactos. El botón y la API validan la
organización y la marca antes de borrar, por lo que no es posible liberar cupo
eliminando información de otra cuenta.

El identificador original no se guarda en `smarttalk.contacts`. Solo se
conserva un hash con alcance de organizacion, marca y canal en
`smarttalk.contact_private_identifiers`, accesible exclusivamente por
`service_role`, para evitar duplicados sin exponer el numero.

## Orden de despliegue

1. Ejecutar primero la migracion en el SQL Editor del proyecto Supabase
   correcto.
2. En Vercel establecer `BILLING_ENFORCEMENT_MODE=hard` en Production. No se
   agrega otra variable para esta funcionalidad.
3. Desplegar la aplicacion.
4. Ejecutar el seed QA si se necesita volver a llenar los limites. El seed es
   idempotente y no conecta proveedores reales.

Si la variable permanece en `off`, `observe` o `soft`, el sistema registra la
decision de limite pero conserva el flujo completo; eso es intencional para
pruebas de observacion. El bloqueo y el contacto restringido requieren
`hard`.

## Reversion

Ejecutar `web/supabase/seed/qa_demo_inicial_limit_cleanup.sql` para eliminar
solamente los datos sinteticos. La marca `[QA] Marca Demo Inicial` se conserva.

## Aclaracion de alcance

`channels.active` es un limite total por organizacion, no por marca. La
seleccion de Instagram, Facebook o WhatsApp en una marca no consume el limite;
lo consume el registro de canal cuyo estado es `active`.

Los canales, contactos, invitaciones, broadcasts y flujos de este dataset son
solo para QA. Los tres canales no tienen credenciales de proveedor y no pueden
enviar mensajes reales. Las invitaciones y los registros de broadcast no
generan correo ni llamadas externas.
