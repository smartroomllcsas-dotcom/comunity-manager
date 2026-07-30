# Separacion de usuarios de agencia y asesores de marca

Proyecto: CommunityManager
Fecha: 2026-07-30
Migracion: `20260730000100_011_agency_users_brand_advisors.sql`

## Objetivo

Evitar que los colaboradores internos de una agencia y los asesores de sus
marcas consuman el mismo limite comercial.

## Modelo aplicado

### Usuario de agencia

- Valor interno: `agency_user`.
- Incluye propietario, administrador, supervisor y colaboradores internos.
- Puede trabajar con varias marcas segun su rol.
- Consume el beneficio `agency.users`.

### Asesor de marca

- Valor interno: `brand_advisor`.
- Conserva el rol operativo `agent`.
- Debe estar asignado al menos a una marca.
- Puede pertenecer a varias marcas de la misma agencia.
- Consume `brand.advisors_total`.
- Cada asignacion consume `brand.advisors_per_brand` en la marca correspondiente.

## Tablas y campos

- `smarttalk.agents.member_type`.
- `smarttalk.invitations.member_type`.
- `smarttalk.brand_advisor_assignments`.
- `smarttalk.invitation_brand_assignments`.

Las asignaciones validan en PostgreSQL que usuario, invitacion, marca y
organizacion pertenezcan a la misma agencia.

## Compatibilidad

- Los agentes existentes se clasificaron como `agency_user`.
- `team.members` se conserva como beneficio heredado.
- Los canales y mensajes existentes no se modificaron.
- `BILLING_ENFORCEMENT_MODE=off` permanece sin cambios.
- Las tablas nuevas usan RLS de lectura por organizacion.
- Las escrituras administrativas se ejecutan en backend con `service_role`.

## Controles backend

- Invitar un usuario de agencia consulta `agency.users`.
- Invitar un asesor consulta `brand.advisors_total`.
- Cada marca seleccionada consulta `brand.advisors_per_brand`.
- Una marca ajena a la organizacion es rechazada.
- Un asesor sin marcas es rechazado.
- Un asesor no puede promoverse a supervisor o administrador sin cambiar
  primero su tipo de miembro.
- La validacion de acceso a una pagina de marca exige una asignacion cuando el
  usuario es `brand_advisor`.

## Interfaz

En `/settings/agents` el administrador puede:

1. Elegir entre usuario de agencia y asesor de marca.
2. Seleccionar una o varias marcas al invitar un asesor.
3. Ver conteos separados.
4. Ver el tipo y las marcas de cada miembro.
5. Reclasificar miembros existentes.

En `/admin/plans` se configuran por separado:

- Usuarios de agencia.
- Asesores de marca totales.
- Asesores por marca.

En `/settings/billing` los consumos aparecen separados.

## Estado de la migracion

Aplicada en Supabase `smartmedia` el 2026-07-30 mediante SQL Editor, rol
`postgres`, dentro de una transaccion.

Validacion registrada:

- Columna `agents.member_type`: existe.
- Tabla `brand_advisor_assignments`: existe.
- Tabla `invitation_brand_assignments`: existe.
- Funciones comerciales nuevas: `3`.
- Usuarios existentes clasificados como agencia: `2`.
- Asesores creados automaticamente: `0`.
- Beneficios nuevos configurados en los planes demo: `9`.

## Limitacion de transicion

Los recursos del inbox como conversaciones y canales siguen perteneciendo a la
organizacion. La asignacion por marca ya protege las rutas que reciben un
`clientId`, pero la segmentacion completa del inbox requiere que cada canal y
conversacion tenga una marca identificable.

No se debe activar enforcement estricto de acceso por marca en todo el inbox
hasta completar ese etiquetado y ejecutar una regresion de Messenger,
WhatsApp e Instagram.

