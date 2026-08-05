# Aislamiento de marcas, canales y leads

Proyecto: CommunityManager  
Fecha: 2026-07-30  
Migraciones: `20260730000300_013_brand_channel_lead_isolation.sql` y
`20260805000200_028_advisor_brand_rls_hardening.sql`
Estado: la migracion 013 esta aplicada y validada en Supabase `smartmedia`; la
028 queda lista para ejecutar antes del siguiente despliegue.

## Objetivo

Garantizar que cada canal pertenezca a una marca y que contactos,
conversaciones y mensajes nunca se enruten hacia otra marca u organizacion.

La jerarquia obligatoria es:

`organizacion -> marca -> canal -> contacto -> conversacion -> mensaje`

## Modelo aplicado

- `smarttalk.channels.brand_id` es obligatorio y referencia
  `public.cm_clients.id`.
- `smarttalk.contacts.brand_id` es obligatorio.
- `smarttalk.conversations.brand_id` es obligatorio.
- La identidad externa de un lead es unica por organizacion y marca:
  `(organization_id, brand_id, wa_id)`.
- El mismo identificador externo puede existir en dos marcas sin compartir
  contacto ni historial.
- Un trigger PostgreSQL rechaza canales, contactos o conversaciones cuyo
  `organization_id` y `brand_id` no coincidan.
- Una conversacion solo puede usar un canal y un contacto de su misma marca.

## Backend

- WhatsApp deriva organizacion y marca exclusivamente del canal encontrado por
  `phone_number_id`.
- Facebook Messenger e Instagram derivan la marca del canal Meta encontrado.
- Los contactos se buscan e insertan por organizacion, marca e identificador
  externo.
- Las conversaciones se reutilizan solo por organizacion, marca, contacto y
  canal.
- Los estados de entrega se actualizan dentro de las conversaciones del canal,
  no globalmente por `wa_message_id`.
- La sincronizacion de cuentas Meta solo consulta marcas de la organizacion
  autenticada; ya no recorre cuentas de otros usuarios.
- El intercambio de codigo de WhatsApp exige sesion y acceso a `client_id`.
  El `user_id` enviado por el navegador ya no es confiable ni se utiliza.
- Los tokens nuevos de WhatsApp se guardan cifrados.

## Acceso de asesores

- Las politicas RLS de `channels`, `contacts` y `conversations` consultan
  `brand_advisor_assignments`.
- Un usuario de agencia conserva acceso a las marcas de su organizacion.
- Un asesor de marca solo ve canales y conversaciones de marcas asignadas.
- La API del inbox aplica el mismo filtro en backend.
- La migracion 028 reemplaza las politicas historicas de `messages` e
  `internal_notes`, que validaban solo la organizacion, por politicas que
  tambien validan la marca asignada.
- La IA, el snooze, las notas, los segmentos, las etiquetas y los envios
  masivos validan el alcance de marca antes de leer contactos o ejecutar una
  accion.
- El superadministrador conserva acceso global y no necesita asignacion.

## Interfaz

- La configuracion de canales obliga a elegir una marca propietaria.
- La pagina de contactos obliga a elegir una marca antes de listar, importar o
  exportar leads.
- La API publica una lista de marcas ya filtrada para el usuario autenticado.

## Migracion de datos heredados

Se clasificaron los recursos de `dev@comunitymanager.io` antes de limpiar la
cuenta:

| Marca | Canal | Contactos/conversaciones |
|---|---|---:|
| TESTDEV | WhatsApp | 2 |
| TEST2DEV | Facebook Messenger | 1 |
| TEST3DEV | Instagram | 3 |

El canal WhatsApp tenia un `legacy_client_id` obsoleto en JSON. La migracion
recupero su marca correcta mediante el `phone_number_id` de
`cm_whatsapp_accounts`.

## Pruebas ejecutadas

- Migracion SQL: exitosa.
- Canales sin marca despues de migrar: `0`.
- Contactos sin marca despues de migrar: `0`.
- Conversaciones sin marca despues de migrar: `0`.
- Mismo identificador externo en dos marcas: permitido como dos contactos
  independientes.
- Conversacion con contacto y canal de marcas diferentes: rechazada por
  PostgreSQL.
- Registros temporales de prueba: eliminados.
- `npm run build`: aprobado.
- `npm run lint`: sin errores; permanecen advertencias heredadas.
- `git diff --check`: aprobado.
- Verificacion estatica del alcance de marca: rutas de contactos, inbox,
  canales, IA, segmentos, etiquetas y broadcasts revisadas.

## Limpieza autorizada de cuenta de pruebas

Se elimino exclusivamente `dev@comunitymanager.io` para repetir el onboarding:

- 3 marcas: `TESTDEV`, `TEST2DEV`, `TEST3DEV`.
- 3 canales.
- 6 contactos.
- 6 conversaciones y sus mensajes relacionados.
- 95 eventos de actividad.
- 16 registros de chat heredado.
- La organizacion `Developer Admin Workspace`.
- El usuario de aplicacion y el usuario de Supabase Auth.

La verificacion posterior encontro `0` registros residuales para todos esos
identificadores. La cuenta
`cliente.prueba.planes@comunitymanager.io` y las demas organizaciones se
conservaron.

## Pruebas manuales pendientes

1. Registrar nuevamente `dev@comunitymanager.io` desde la portada y elegir un
   plan.
2. Crear dos marcas distintas.
3. Conectar un canal diferente en cada marca.
4. Enviar mensajes desde un mismo telefono/usuario externo a ambas marcas.
5. Confirmar dos contactos independientes y conversaciones separadas.
6. Invitar un asesor asignado solo a una marca.
7. Confirmar que ese asesor no ve la otra marca, sus canales ni sus leads.
8. Repetir recepcion y respuesta con WhatsApp, Messenger e Instagram.
9. Ejecutar la migracion 028 y repetir el intento de lectura directa de
   `contacts`, `conversations`, `messages` e `internal_notes` con el cliente
   Supabase autenticado del asesor; las marcas no asignadas deben devolver cero
   filas o acceso denegado.

## Reversion

No eliminar las columnas para una emergencia. Revertir primero la aplicacion al
commit anterior y mantener la migracion. Si se requiere una correccion de
esquema, crear una migracion hacia adelante preservando `brand_id`.
