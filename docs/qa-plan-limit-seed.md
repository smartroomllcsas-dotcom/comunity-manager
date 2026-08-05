# QA de limites del plan Demo Inicial

## Que prepara

El script `web/supabase/seed/qa_demo_inicial_limit.sql` prepara la organizacion
`QA Agencia Inicial` usando la suscripcion activa que ya existe:

- 5 marcas, hasta el limite `brands.total` del plan.
- 3 canales simulados activos: Facebook Messenger, Instagram y WhatsApp.
- Los canales se distribuyen entre las primeras tres marcas.
- Contactos sinteticos hasta `max_contacts` del plan, actualmente 1.000.
- Una conversacion y un mensaje entrante de prueba por cada canal simulado.

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
5. Abrir Inbox y confirmar un mensaje QA de Facebook, Instagram y WhatsApp.
6. Intentar crear una sexta marca: el boton debe estar bloqueado o el backend
   debe responder con limite excedido.
7. Intentar conectar un cuarto canal real solo despues de verificar que el
   tercero ya aparece como activo. La operacion debe ser rechazada por el
   limite, sin llamar al proveedor si el backend la valida antes.

## Reversion

Ejecutar `web/supabase/seed/qa_demo_inicial_limit_cleanup.sql` para eliminar
solamente los datos sinteticos. La marca `[QA] Marca Demo Inicial` se conserva.

## Aclaracion de alcance

`channels.active` es un limite total por organizacion, no por marca. La
seleccion de Instagram, Facebook o WhatsApp en una marca no consume el limite;
lo consume el registro de canal cuyo estado es `active`.
