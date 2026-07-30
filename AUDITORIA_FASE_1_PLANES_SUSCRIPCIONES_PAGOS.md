# Auditoria tecnica: planes, suscripciones y pagos

**Proyecto:** CommunityManager / CommunityAgent  
**Fecha de auditoria:** 2026-07-29  
**Alcance:** Fase 1, analisis previo a la implementacion comercial  
**Estado del repositorio al iniciar:** rama `master`, sin cambios locales  
**Regla aplicada:** no se modifico logica, base de datos, configuracion ni integraciones existentes

## 1. Resumen ejecutivo

CommunityManager es una aplicacion full-stack construida con Next.js. En un mismo proyecto conviven:

1. El modulo historico de Community Manager, almacenado principalmente en el esquema `public` con tablas prefijadas `cm_`.
2. El inbox multicanal SmartTalk, almacenado en el esquema PostgreSQL `smarttalk`.
3. Una implementacion comercial parcial con planes, suscripciones, pagos, uso y pantallas administrativas.

Las conexiones de Facebook Messenger, Instagram, WhatsApp y Respond.io no necesitan ser reemplazadas para implementar planes. Deben preservarse y envolverse con controles comerciales en servidor.

La base configurada contiene actualmente:

| Elemento | Cantidad observada |
|---|---:|
| Clientes o marcas `cm_clients` | 4 |
| Propietarios distintos de esos clientes | 2 |
| Organizaciones SmartTalk | 1 |
| Canales SmartTalk | 3 |
| Contactos SmartTalk | 6 |
| Conversaciones SmartTalk | 6 |
| Mensajes SmartTalk | 33 |
| Planes | 4 |
| Suscripciones | 0 |
| Pagos | 0 |
| Registros de consumo | 0 |

La implementacion comercial actual **no debe activarse en produccion como esta**. Las tablas y las pantallas son un buen punto de partida visual, pero faltan controles de servidor, recurrencia real, idempotencia, conciliacion, trazabilidad y suspension uniforme.

Antes de cobrar se deben resolver cuatro prerrequisitos:

- Normalizar la entidad propietaria de la suscripcion.
- Cerrar riesgos de autenticacion, RLS y autorizacion en rutas antiguas.
- Sustituir el flujo de pago parcial por un ciclo de suscripcion verificable e idempotente.
- Crear una capa central de capacidades y consumo aplicada en servidor.

## 2. Metodologia y limites de la auditoria

Se realizaron las siguientes acciones de solo lectura:

- Inventario de archivos, rutas, modulos y dependencias.
- Lectura de esquemas SQL y migraciones.
- Trazado de autenticacion, sesiones, roles y RLS.
- Trazado de webhooks, canales, publicaciones, mensajes, IA y almacenamiento.
- Revision del codigo existente de ePayco, facturacion y administracion.
- Ejecucion previa de `npm run build`, completada correctamente.
- Consulta de metadatos y conteos agregados en la base configurada, sin extraer contenido de clientes, mensajes, tokens ni datos personales.
- Ejecucion de `npm audit --omit=dev` y `npm outdated`.
- Consulta de documentacion oficial vigente de ePayco para validar el flujo recomendado.

No se realizaron:

- Cambios en tablas, datos, usuarios o configuracion remota.
- Pagos de prueba.
- Altas, bajas o reconexiones de canales.
- Cambios de dependencias.
- Pruebas destructivas o de carga.

## 3. Arquitectura encontrada

### 3.1 Stack principal

| Capa | Tecnologia encontrada |
|---|---|
| Frontend | Next.js `16.2.1`, React `19.2.4`, TypeScript |
| Backend | Route Handlers y Server Actions de Next.js; no existe backend separado |
| UI | Tailwind CSS 4, Base UI, componentes tipo shadcn, Lucide |
| Estado y datos cliente | TanStack React Query 5, Zustand 5 |
| Base de datos de produccion | Supabase/PostgreSQL |
| Base local alternativa | MySQL mediante `mysql2` |
| Autenticacion principal del inbox | Supabase Auth con cookies SSR |
| Autenticacion historica CM | Tabla `cm_users`, cookie/localStorage `cm_user_id` |
| Hosting configurado | Vercel, salida Next.js `standalone` |
| Tareas programadas | Vercel Cron diario para refresco de tokens |
| Archivos multimedia | Supabase Storage; conversion opcional con `ffmpeg-static` |
| IA | Anthropic API; quedan nombres y tipos heredados para OpenAI |
| Pagos presentes | Smart Checkout de ePayco, implementacion parcial |

El proyecto no tiene un framework backend adicional. El backend real son las rutas bajo `web/src/app/api`, los webhooks y las Server Actions.

### 3.2 Estructura funcional

#### Community Manager historico

- Inicio y actividad.
- Clientes o marcas.
- Calendario y publicaciones.
- Agentes conceptuales de marketing.
- Chat con IA.
- Conexion de activos Meta.
- Conexion historica de WhatsApp.
- Campanas e insights de Meta.

Archivos principales:

- `web/src/app/(agency)`
- `web/src/lib/meta.ts`
- `web/src/lib/meta-oauth-handler.ts`
- `web/src/lib/webhook.ts`
- `web/src/lib/whatsapp-cm.ts`
- `web/src/lib/supabase.ts`

#### SmartTalk / inbox multicanal

- Inbox y mensajes.
- Contactos, campos, etiquetas y segmentos.
- Canales.
- Equipos, agentes e invitaciones.
- Respuestas rapidas y notas.
- Broadcasts.
- Flujos de chatbot.
- Agentes y asistencia con IA.
- Reportes.
- Configuracion de organizacion.

Archivos principales:

- `web/src/app/(dashboard)`
- `web/src/components/inbox`
- `web/src/components/chatbot`
- `web/src/app/api/inbox`
- `web/src/app/api/messages`
- `web/src/app/api/channels`
- `web/src/lib/chatbot`
- `web/src/lib/whatsapp`
- `web/src/lib/respond-io`

#### Administracion y facturacion existentes

- Panel de superadministrador.
- Listado de organizaciones.
- Edicion visual de planes.
- Listado y cambio de estado de suscripciones.
- Historial de pagos.
- Pantalla de plan y consumo para el cliente.
- Checkout y confirmacion de ePayco.

Archivos principales:

- `web/src/app/(admin)`
- `web/src/app/(dashboard)/settings/billing/page.tsx`
- `web/src/components/billing/EpaycoCheckout.tsx`
- `web/src/app/api/epayco`
- `web/src/lib/epayco/client.ts`
- `web/supabase/migrations/20260514120006_006_admin_billing.sql`

### 3.3 Configuracion de produccion

La aplicacion esta vinculada a un proyecto Vercel y declara:

- `npm run build` como compilacion.
- `.next` como salida.
- Next.js como framework.
- Cron `0 3 * * *` para `/api/cron/refresh-tokens`.
- `output: "standalone"` en Next.js.
- Inclusion de binarios de FFmpeg en el trazado de salida.

La documentacion interna indica Supabase como proveedor obligatorio en produccion y MySQL solo para desarrollo local.

### 3.4 Variables de entorno

Se inventariaron solo los nombres, sin copiar valores:

#### Aplicacion y base de datos

- `NEXT_PUBLIC_APP_URL`
- `INTERNAL_APP_URL`
- `NEXT_PUBLIC_DB_PROVIDER`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_POSTGREST_URL`
- `NEXT_PUBLIC_POSTGREST_API_KEY`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

#### Meta, Facebook, Instagram y WhatsApp

- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_META_APP_ID`
- `NEXT_PUBLIC_META_CONFIG_ID`
- `NEXT_PUBLIC_META_GRAPH_VERSION`
- `NEXT_PUBLIC_FACEBOOK_APP_ID`
- `NEXT_PUBLIC_FACEBOOK_CONFIG_ID`
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `NEXT_PUBLIC_INSTAGRAM_LOGIN_URL`
- `META_IG_APP_ID`
- `META_IG_APP_SECRET`
- `WHATSAPP_API_VERSION`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_WHATSAPP_CONFIG_ID`

#### IA, pagos y servicios

- `ANTHROPIC_API_KEY`
- `RESPOND_IO_API_BASE`
- `CRON_SECRET`
- `NEXT_PUBLIC_EPAYCO_PUBLIC_KEY`
- `EPAYCO_PRIVATE_KEY`
- `EPAYCO_CUSTOMER_ID`
- `EPAYCO_P_KEY`
- `EPAYCO_TEST`

Recomendacion futura: validar variables al arrancar con un esquema tipado y separar claramente variables publicas, secretas y opcionales. Ninguna llave privada debe usar prefijo `NEXT_PUBLIC_`.

## 4. Base de datos y modelo actual

### 4.1 Esquema `public`: Community Manager

Tablas principales:

| Tabla | Funcion |
|---|---|
| `cm_users` | Usuario historico, rol, plan textual y credencial local |
| `cm_clients` | Cliente o marca administrada por un usuario |
| `cm_content_pillars` | Pilares de contenido por marca |
| `cm_scheduled_posts` | Calendario y publicaciones programadas |
| `cm_agents` | Catalogo de agentes conceptuales de marketing |
| `cm_activity_log` | Actividad parcial del usuario |
| `cm_chat_history` | Historial del chat historico |
| `cm_oauth_states` | Estado temporal de OAuth |
| `cm_social_accounts` | Activos y tokens de Meta por marca |
| `cm_whatsapp_accounts` | Cuentas y tokens historicos de WhatsApp |

Relacion principal actual:

```text
cm_users 1 ─── N cm_clients 1 ─── N recursos de marca
```

`cm_clients` representa una marca o cliente gestionado, no necesariamente la empresa que compra la suscripcion.

### 4.2 Esquema `smarttalk`: inbox multiempresa

Tablas principales por dominio:

| Dominio | Tablas |
|---|---|
| Tenant y acceso | `organizations`, `agents`, `invitations` |
| Canales | `channels` |
| Inbox | `contacts`, `conversations`, `messages`, `internal_notes` |
| Mensajeria masiva | `message_templates`, `broadcasts`, `broadcast_recipients` |
| Automatizacion | `chatbot_flows`, `assignment_rules` |
| IA | `ai_config`, `ai_agents`, `knowledge_sources` |
| CRM | `tags`, `contact_field_definitions`, `contact_segments`, `lifecycle_stages`, `lifecycle_history`, `contact_activities`, `closing_categories` |
| Equipos | `teams`, `agent_teams` |
| Comercial | `plans`, `subscriptions`, `payments`, `usage_records` |

Relacion principal:

```text
organizations 1 ─── N agents
organizations 1 ─── N channels
organizations 1 ─── N contacts/conversations/broadcasts/automations
organizations 1 ─── N subscriptions (hoy no hay restriccion de unicidad)
```

La mayoria de las tablas SmartTalk incluye `organization_id` y tiene RLS basada en `get_agent_org_id()`.

### 4.3 Puente entre ambos esquemas

La migracion de puente agrega:

- `smarttalk.organizations.cm_client_id`
- `public.cm_clients.smarttalk_organization_id`

La base configurada muestra cuatro `cm_clients`, una `organization` y ningun enlace poblado entre ellos. El esquema permite enlaces, pero no define de forma consistente si son uno a uno o muchos a uno.

Tambien existe una desviacion entre codigo y base: el codigo de login consulta `cm_users.cm_client_id`, pero esa columna no esta disponible en la base configurada. Este desfase debe corregirse mediante migracion y backfill controlados, no con cambios manuales en produccion.

## 5. Autenticacion, sesiones, roles y permisos

### 5.1 Sesiones existentes

Existen dos mecanismos que hoy se intentan puentear:

1. **Sesion Community Manager**
   - Identificador en cookie y `localStorage`: `cm_user_id`.
   - Duracion configurada: 30 dias.
   - Usuario recuperado desde `cm_users`.
2. **Sesion Supabase**
   - Gestionada por `@supabase/ssr`.
   - Cookies de Supabase.
   - Usuario vinculado con `smarttalk.agents`.

El login principal intenta:

- Validar primero contra `cm_users`.
- Crear o actualizar el usuario de Supabase Auth.
- Crear un agente y, si hace falta, una organizacion SmartTalk.
- Crear ambas sesiones.

### 5.2 Roles existentes

| Ambito | Roles |
|---|---|
| Community Manager | valores textuales como `admin`, `user` o `cliente` segun flujo |
| SmartTalk | `admin`, `supervisor`, `agent` |
| Administracion global | booleano `agents.is_super_admin` |

Los roles SmartTalk se verifican en varias rutas de administracion de equipos, campos e IA. Sin embargo, no existe una politica central de permisos; las comprobaciones estan repetidas y no todas las rutas mutables tienen el mismo nivel de proteccion.

### 5.3 Hallazgos de seguridad que afectan la facturacion

#### Criticos

1. `cm_users.password_hash` contiene y compara la contrasena como texto, no un hash seguro.
2. Las politicas RLS de las tablas `cm_*` usan `USING (true)` y se conceden operaciones a `anon` y `authenticated`. En la practica no aislan propietarios.
3. Varias rutas historicas reciben `clientId` y consultan tokens o ejecutan acciones sin autenticar al usuario ni verificar que sea propietario. Ejemplos: campanas, insights y publicacion social.
4. Rutas antiguas de WhatsApp usan `clientId` con cliente administrador y no todas verifican propiedad.

#### Altos

1. `subscriptions`, `payments` y `usage_records` tienen politica `FOR ALL` para miembros de la organizacion. Un usuario autenticado no debe poder modificar su propia suscripcion, pagos o consumo desde el navegador.
2. El superadministrador se valida en la interfaz, pero varias paginas administrativas consultan o modifican Supabase directamente desde el navegador. Deben usar APIs de servidor y autorizacion global verificable.
3. La suspension por `organizations.is_active` se verifica en `/st/login`, pero no de forma uniforme en el login principal, middleware ni todas las APIs. Una sesion existente puede seguir operando.
4. El webhook de Respond.io solo valida firma si el canal tiene secreto; la ausencia del secreto deja el webhook abierto para ese canal.

Estas correcciones son prerrequisitos del sistema comercial. No requieren alterar el comportamiento normal de los canales cuando se implementan con pruebas de regresion.

## 6. Estado del sistema comercial existente

### 6.1 Lo que ya existe

#### Planes

La tabla `plans` contiene:

- `name`
- `max_agents`
- `max_contacts`
- `max_broadcasts_per_month`
- `max_chatbot_flows`
- `ai_enabled`
- `price_monthly`

Planes semilla:

- `free`
- `starter`
- `professional`
- `enterprise`

#### Organizaciones

`organizations` ya tiene:

- `plan_id`
- `trial_ends_at`
- `is_active`

#### Suscripciones

La tabla `subscriptions` ya modela:

- Organizacion.
- Plan.
- Estado.
- Periodo actual.
- Cancelacion al final del periodo.
- Referencias ePayco.
- Ultimo pago y metodo.

#### Pagos

La tabla `payments` guarda:

- Organizacion y suscripcion.
- Referencia ePayco.
- Monto y moneda.
- Estado.
- Metodo.
- Respuesta completa del proveedor.

#### Consumo

`usage_records` incluye:

- Contactos.
- Mensajes enviados.
- Broadcasts.
- Agentes.
- Periodo.

#### Interfaz

Existen pantallas de:

- Plan y uso del cliente.
- Checkout.
- Organizaciones.
- Planes.
- Suscripciones.
- Pagos.
- Estadisticas globales.

### 6.2 Lo que falta o no funciona como sistema comercial

1. Los limites solo se muestran; no se aplican al crear o usar recursos.
2. `usage_records` no se escribe desde la aplicacion.
3. No hay servicio central de capacidades o `entitlements`.
4. No hay maquina de estados completa para trial, gracia, mora, suspension y reactivacion.
5. No hay tarea programada para vencimientos, cobro, reintentos o suspension.
6. No hay una suscripcion unica vigente por organizacion.
7. No hay historial inmutable de cambios de estado.
8. No hay versionado de planes ni precios.
9. No hay moneda en `plans`.
10. No hay impuestos, descuentos, cupones, facturas ni notas credito.
11. No hay conciliacion con el proveedor.
12. No hay pruebas automatizadas del flujo de pagos.

### 6.3 Riesgos especificos del flujo ePayco actual

#### Firma incompatible con la documentacion vigente

El codigo actual calcula MD5 con una concatenacion distinta. La documentacion oficial vigente de ePayco indica SHA-256 con:

```text
customer_id ^ p_key ^ x_ref_payco ^ x_transaction_id ^ x_amount ^ x_currency_code
```

Ademas, el codigo actual acepta la firma si no puede cargar `crypto`. Una validacion de pagos nunca debe fallar en modo abierto.

Referencia: [ePayco - Paginas de respuesta y confirmacion](https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion).

#### No es una suscripcion recurrente real

El checkout actual procesa una transaccion normal y, si es aprobada, suma un mes localmente. No crea ni administra un plan o suscripcion recurrente en ePayco, aunque existen campos llamados `epayco_subscription_id`.

ePayco ofrece operaciones de planes y suscripciones recurrentes, por lo que el flujo debe usar esa capacidad si el negocio necesita cobro automatico. Referencia: [ePayco - Suscripciones](https://docs.epayco.com/docs/descripcion-general-4).

#### Falta idempotencia

ePayco puede reintentar el webhook. Actualmente:

- No existe restriccion unica sobre transaccion o evento.
- Cada reintento puede insertar otro pago.
- Cada aprobacion repetida puede volver a mover el periodo.

#### Falta validacion comercial

El webhook no vuelve a cargar el plan para comprobar:

- Que el plan exista y este vendible.
- Que el monto pagado coincida con el precio.
- Que la moneda coincida.
- Que la organizacion corresponda a una sesion de checkout emitida por el servidor.
- Que ambiente de prueba y produccion coincidan.

#### Moneda y escala ambiguas

Los planes semilla usan valores `29`, `79` y `199`, mientras el checkout envia moneda `COP`. Si esos valores pretendian representar USD o miles de COP, el cobro seria incorrecto. La moneda y la unidad minima deben ser explicitas.

#### Estados inconsistentes

- Un pago rechazado al intentar cambiar de plan puede marcar `past_due` una suscripcion activa anterior.
- `organizations.plan_id` y `subscriptions.plan_id` pueden divergir.
- La pantalla toma el plan actual de `organizations`, no necesariamente de la suscripcion vigente.
- No existe periodo de gracia ni politica de reintentos.

#### Privacidad

Se almacena la respuesta completa del proveedor en JSON. Puede incluir datos personales. Se requiere definir campos permitidos, cifrado si aplica, acceso, retencion y eliminacion.

## 7. Modelo multiempresa recomendado

### 7.1 Clasificacion actual

SmartTalk ya es un sistema multi-tenant con:

- Base compartida.
- Esquema compartido.
- `organization_id` como discriminador.
- Varios agentes por organizacion.
- RLS por organizacion.

Community Manager historico se comporta como:

- Una cuenta `cm_users`.
- Varios clientes o marcas `cm_clients` por cuenta.
- Recursos asociados a cada marca o al usuario.
- Sin entidad explicita de empresa o agencia.

### 7.2 Propietario recomendado de la suscripcion

La suscripcion debe pertenecer a **`smarttalk.organizations`**, no a `cm_users` ni directamente a `cm_clients`.

Razon:

- Ya es el limite de aislamiento de datos del inbox.
- Ya agrupa agentes, canales y recursos.
- Ya contiene `plan_id`, trial y estado.
- Las tablas comerciales existentes ya apuntan a `organization_id`.

Para que esta eleccion cubra Community Manager, se debe declarar:

```text
organization = cuenta comercial / empresa / agencia compradora
cm_client     = marca o cliente gestionado dentro de esa cuenta
agent         = usuario miembro de la cuenta
```

Cardinalidad objetivo:

```text
organization 1 ─── N cm_clients
organization 1 ─── N memberships/users
organization 1 ─── 1 suscripcion comercial vigente
```

`cm_clients.smarttalk_organization_id` puede servir temporalmente como enlace muchos-a-uno. `organizations.cm_client_id` es ambiguo y debe deprecarse despues de un backfill verificado, no eliminarse de inmediato.

### 7.3 Decision comercial pendiente

Antes de implementar se debe confirmar con el cliente:

- Si una suscripcion cubre toda una agencia con varias marcas.
- Si cada marca compra su propia suscripcion.
- Si un usuario puede pertenecer a varias organizaciones.

La recomendacion de esta auditoria es **una suscripcion por organizacion/agencia, con limite de marcas dentro del plan**. Es el modelo que mejor cumple el objetivo planteado y evita cobrar accidentalmente por usuario.

## 8. Inventario propuesto de funciones limitables

`-1` no debe usarse como valor magico en codigo nuevo. Es preferible `NULL` para ilimitado y una validacion central.

| Codigo interno | Funcion | Tipo | Calculo propuesto | Accion al llegar al limite |
|---|---|---|---|---|
| `team.members` | Usuarios/agentes | Cantidad actual | Miembros activos de la organizacion | Bloquear nueva invitacion/alta |
| `brands.total` | Marcas/clientes | Cantidad actual | `cm_clients` vinculados a la organizacion | Bloquear nueva marca |
| `channels.active` | Redes/canales conectados | Cantidad actual | Canales activos normalizados, sin duplicar legado | Bloquear nueva conexion |
| `contacts.total` | Contactos | Cantidad actual | Contactos de la organizacion | Avisar y bloquear importacion/creacion manual; no perder mensajes entrantes |
| `messages.outbound_month` | Mensajes salientes | Consumo por periodo | Mensajes outbound confirmados | Bloquear nuevos envios, conservar recepcion |
| `broadcasts.month` | Broadcasts mensuales | Consumo por periodo | Broadcasts iniciados, no borradores | Bloquear iniciar otro broadcast |
| `broadcast_recipients.month` | Destinatarios masivos | Consumo por periodo | Destinatarios procesados | Detener antes de exceder |
| `posts.month` | Publicaciones mensuales | Consumo por periodo | Publicaciones efectivamente enviadas/programadas segun regla comercial | Bloquear publicar/programar |
| `campaigns.access` | Modulo de campanas | Bandera | No aplica | Ocultar UI y denegar API |
| `automations.flows` | Flujos de chatbot | Cantidad actual | Flujos existentes o activos, segun contrato | Bloquear crear/activar |
| `automations.assignment_rules` | Reglas de asignacion | Cantidad o bandera | Reglas activas | Bloquear crear/activar |
| `ai.access` | Funciones de IA | Bandera | No aplica | Denegar rutas de IA |
| `ai.requests_month` | Solicitudes IA | Consumo por periodo | Llamadas aceptadas por servidor | Bloquear al agotar |
| `ai.tokens_month` | Presupuesto IA | Consumo por periodo | Tokens de entrada y salida reportados | Bloquear o vender excedente |
| `reports.access` | Reportes | Bandera | No aplica | Ocultar y denegar ruta |
| `reports.retention_days` | Retencion de reportes | Ventana | Antiguedad maxima consultable | Limitar rango |
| `storage.bytes` | Almacenamiento | Cantidad acumulada | Suma de objetos privados por organizacion | Bloquear nuevas cargas |
| `templates.total` | Plantillas | Cantidad actual | Plantillas propias/sincronizadas | Bloquear nuevas |
| `segments.total` | Segmentos | Cantidad actual | Segmentos guardados | Bloquear nuevos |
| `api.access` | API e integraciones avanzadas | Bandera | No aplica | Denegar credenciales/endpoints |
| `respond_io.access` | Canal Respond.io | Bandera | No aplica | Bloquear nueva conexion; definir politica para canal existente |
| `support.tier` | Nivel de soporte | Valor enumerado | No aplica | Enrutamiento operativo, no bloqueo tecnico |

### 8.1 Reglas de calculo

- Las cantidades actuales deben consultarse en una fuente canonica, no confiar en contadores enviados por el navegador.
- El consumo mensual debe usar el periodo de la suscripcion, no necesariamente el mes calendario.
- Las operaciones concurrentes deben reservar consumo de forma atomica.
- Los eventos externos deben ser idempotentes.
- Borrar un recurso no debe reducir consumos historicos facturables.
- Webhooks entrantes no deben rechazarse por limite o mora; se debe preservar el mensaje y desactivar solo acciones salientes o premium.

### 8.2 Politica recomendada al suspender

Mantener accesibles:

- Login.
- Facturacion y cambio de metodo.
- Lectura limitada.
- Exportacion de datos.
- Recepcion y persistencia de webhooks.
- Soporte.

Bloquear:

- Mensajes salientes.
- Publicaciones.
- Broadcasts.
- Nuevas conexiones.
- Nuevos usuarios o marcas.
- Automatizaciones y llamadas IA.
- Cambios que incrementen consumo.

Esto evita perder mensajes de clientes finales y permite reactivar sin reconstruir integraciones.

## 9. Modelo de datos propuesto

La implementacion debe ser aditiva. No se recomienda borrar las tablas comerciales actuales en la primera migracion.

### 9.1 Catalogo comercial

#### `plans`

Conservar como identidad del producto y agregar:

- `code` unico e inmutable.
- `display_name`.
- `description`.
- `status`: draft, active, archived.
- `is_public`.
- `version`.
- `created_by`.
- `updated_at`.

#### `plan_prices`

- `plan_id`.
- `currency`.
- `amount_minor` como entero.
- `interval`: month, year.
- `interval_count`.
- `tax_behavior`.
- `provider`.
- `provider_plan_id`.
- `active_from` y `active_to`.

No modificar precios historicos en sitio; crear nuevas versiones.

#### `plan_entitlements`

- `plan_id`.
- `feature_code`.
- `limit_type`: boolean, quantity, metered, enum.
- `limit_value`.
- `reset_interval`.
- `overage_policy`.

Esto reemplaza gradualmente las columnas fijas `max_*` sin romper las pantallas actuales.

### 9.2 Suscripcion

#### `subscriptions`

Extender o normalizar:

- Una suscripcion comercial vigente por organizacion.
- Estado mediante enum controlado.
- Proveedor.
- Customer, plan y subscription ID externos.
- Precio y moneda contratados.
- Inicio y fin de periodo.
- Inicio y fin de trial.
- Inicio y fin de gracia.
- Cancelacion programada.
- Motivo de cancelacion/suspension.
- Version para concurrencia.

Estados recomendados:

```text
incomplete -> trialing -> active -> past_due -> suspended
                         active -> cancelling -> cancelled
                         suspended -> active
```

#### `subscription_events`

Historial inmutable:

- Suscripcion.
- Estado anterior y nuevo.
- Motivo.
- Actor: sistema, administrador, cliente, proveedor.
- Identificador correlacion.
- Fecha.
- Metadatos filtrados.

### 9.3 Pagos y webhooks

#### `checkout_sessions`

- Organizacion.
- Plan y precio.
- Monto y moneda esperados.
- Usuario iniciador.
- Estado.
- Expiracion.
- Token aleatorio no predecible.
- Referencia interna unica.

El webhook debe resolver la compra desde esta sesion, no confiar directamente en `x_extra1` y `x_extra2`.

#### `payment_transactions`

- Identificador externo unico.
- Referencia interna.
- Organizacion y suscripcion.
- Monto esperado, pagado y moneda.
- Estado.
- Ambiente test/live.
- Metodo.
- Fechas.
- Respuesta normalizada.

#### `billing_webhook_events`

- Proveedor.
- ID o hash unico del evento.
- Firma valida.
- Fecha recibida.
- Estado de procesamiento.
- Numero de intentos.
- Error.
- Payload filtrado o cifrado.

Restriccion unica por proveedor y evento/transaccion para idempotencia.

### 9.4 Capacidades y consumo

#### `feature_catalog`

Define codigo, descripcion, unidad y estrategia de medicion.

#### `organization_entitlement_overrides`

Permite excepciones comerciales auditadas sin crear planes especiales.

#### `usage_events`

Eventos inmutables para recursos medidos:

- Organizacion.
- Feature.
- Cantidad.
- Periodo.
- Clave idempotente.
- Recurso origen.
- Fecha.

#### `usage_counters`

Proyeccion eficiente por organizacion, feature y periodo. Debe actualizarse de forma atomica desde funciones SQL o transacciones de servidor.

### 9.5 Membresias y marcas

Objetivo:

- `organizations` como cuenta comercial.
- `organization_memberships` si se necesita que un usuario pertenezca a mas de una organizacion.
- `cm_clients.smarttalk_organization_id` como enlace transitorio de marcas.
- Eventual renombre conceptual de `cm_clients` a marca, sin renombrar fisicamente hasta estabilizar compatibilidad.

## 10. Estrategia tecnica para aplicar limites

### 10.1 Servicio central

Crear una capa de servidor con operaciones equivalentes a:

```text
getBillingContext(organizationId)
canUseFeature(organizationId, featureCode)
assertFeature(organizationId, featureCode)
checkLimit(organizationId, featureCode, requestedUnits)
reserveUsage(organizationId, featureCode, units, idempotencyKey)
commitUsage(reservationId)
releaseUsage(reservationId)
```

Ninguna ruta debe interpretar directamente columnas del plan.

### 10.2 Puntos de control obligatorios

| Funcion | Punto de control futuro |
|---|---|
| Invitar usuario | `api/invitations` y aceptacion |
| Crear marca | flujo de `cm_clients` |
| Conectar canal | `api/channels/*` y OAuth callbacks |
| Enviar mensaje | `api/messages/send` |
| Importar contacto | `api/contacts/import` |
| Crear contacto | APIs y mutaciones directas existentes |
| Enviar broadcast | `api/broadcasts/send` |
| Crear/activar chatbot | rutas de chatbot y flujos |
| Usar IA | `api/ai/assist`, agentes IA y motor automatico |
| Publicar en redes | `api/social/publish` |
| Subir archivo | `api/uploads/chat-media` |
| Acceder a reportes | rutas/paginas de reportes y consultas |

La interfaz tambien debe informar limites, pero el control de seguridad siempre debe estar en servidor o base de datos.

### 10.3 Webhooks y automatizaciones

- Los webhooks de Meta, WhatsApp, Instagram y Respond.io deben seguir aceptando y persistiendo eventos validos.
- Si la organizacion esta suspendida, no ejecutar respuestas automaticas ni acciones premium.
- Registrar la razon de cada automatizacion omitida.
- No desconectar ni borrar tokens automaticamente por mora.

### 10.4 Despliegue gradual

Agregar una configuracion de enforcement:

```text
off      = no calcula ni bloquea
observe  = calcula y registra, no bloquea
soft     = avisa y bloquea solo altas no criticas
hard     = aplica contrato completo
```

Activar por organizacion y por feature. Esto permite comparar consumos reales antes de afectar clientes.

## 11. Pasarela recomendada

### Recomendacion principal: conservar ePayco

Motivos:

- Ya existe interfaz, configuracion y experiencia de checkout.
- El proyecto y sus precios apuntan al mercado colombiano.
- ePayco soporta checkout, tokenizacion y suscripciones recurrentes.
- Cambiar de proveedor ahora aumenta el riesgo sobre un sistema de mensajeria que ya funciona.

La recomendacion no es conservar el codigo actual sin cambios. Se debe reemplazar la logica de "pago aprobado = sumar un mes" por una integracion de suscripciones real o, si el contrato comercial acepta renovacion manual, declarar explicitamente que se venden periodos prepagados no recurrentes.

Documentacion oficial consultada:

- [ePayco - Smart Checkout](https://docs.epayco.com/docs/checkout-general)
- [ePayco - Confirmacion y firma](https://docs.epayco.com/docs/checkout-respuesta-y-confirmacion)
- [ePayco - Suscripciones](https://docs.epayco.com/docs/descripcion-general-4)
- [ePayco - Tokenizacion](https://docs.epayco.com/v1/docs/tokenizacion-de-clientes)

### Condicion de salida

Cambiar de pasarela solo si ePayco no cubre contractualmente:

- Renovacion recurrente requerida.
- Metodos de pago objetivo.
- Monedas objetivo.
- Reintentos y manejo de mora.
- Facturacion/conciliacion necesaria.
- Requisitos legales del comercio.

La decision final requiere validar la cuenta ePayco real del cliente, tarifas, habilitacion de suscripciones y terminos comerciales. Eso no puede inferirse del codigo.

## 12. Riesgos tecnicos priorizados

| Prioridad | Riesgo | Impacto |
|---|---|---|
| P0 | Contrasenas historicas sin hash | Compromiso de cuentas |
| P0 | RLS `cm_*` abierta y grants a `anon` | Fuga o alteracion entre clientes |
| P0 | Rutas antiguas sin propiedad de `clientId` | Acceso a tokens/acciones de otra cuenta |
| P0 | Firma ePayco incompatible y fallback abierto | Activacion fraudulenta |
| P0 | Webhook de pago no idempotente | Pagos duplicados y periodos incorrectos |
| P0 | Monto y moneda no validados | Plan activado con pago incorrecto |
| P1 | Tenant Community Manager no normalizado | Limites/cobros asignados a entidad equivocada |
| P1 | Suspension no aplicada uniformemente | Cliente moroso conserva funciones |
| P1 | Limites solo visuales | Uso ilimitado pese al plan |
| P1 | Admin opera directamente desde navegador | Fallos de RLS o mutacion no autorizada |
| P1 | Plan de organizacion y suscripcion pueden divergir | Acceso incorrecto |
| P1 | Doble webhook y doble modelo de canales | Conteos duplicados y comportamiento distinto |
| P1 | Respuesta completa de pago con PII | Riesgo de privacidad |
| P2 | Sin observabilidad central | Diagnostico y auditoria insuficientes |
| P2 | Sin pruebas automatizadas | Regresiones en mensajeria y cobros |
| P2 | Esquema del repo y base configurada difieren | Despliegues no reproducibles |
| P2 | Storage publico y sin cuota por tenant | Fuga/costo no controlado |

## 13. Dependencias

### 13.1 Estado de compilacion, lint y pruebas

| Control | Resultado observado |
|---|---|
| `npm run build` | Correcto |
| `npm run lint` | Fallido por configuracion del comando |
| Suite automatizada | No encontrada |

El script actual ejecuta `next lint`. Con la version instalada, Next.js interpreta `lint` como un directorio y responde que `web/lint` no existe. Se debe configurar ESLint directamente, por ejemplo con un archivo `eslint.config.*` compatible y un script basado en `eslint`, antes de usar lint como control de CI.

La compilacion correcta confirma compatibilidad estructural, pero no reemplaza pruebas de autenticacion, webhooks, pagos ni aislamiento multi-tenant.

### 13.2 Estado de seguridad de dependencias

`npm audit --omit=dev` reporto:

| Severidad | Cantidad |
|---|---:|
| Critica | 0 |
| Alta | 8 |
| Moderada | 4 |
| Baja | 2 |
| Total | 14 |

Dependencias directas relevantes:

- Next.js `16.2.1` tiene correccion disponible en `16.2.12`.
- PostCSS instalado por debajo de la version corregida indicada por la auditoria.
- Anthropic SDK requiere una actualizacion mayor para resolver su aviso directo.

### 13.3 Estrategia de actualizacion

No actualizar todo junto con facturacion.

Orden recomendado:

1. Crear rama y ambiente staging.
2. Aplicar primero parches compatibles de Next.js, React ecosystem, PostCSS, Supabase y MySQL.
3. Ejecutar build y regresion completa de OAuth, webhooks y mensajeria.
4. Tratar Anthropic SDK como migracion separada por ser cambio mayor.
5. Actualizar dependencias transitivas restantes.
6. Generar y revisar un nuevo `npm audit`.

La version de TypeScript mas reciente observada es una version mayor; no debe incluirse sin verificar compatibilidad del toolchain.

## 14. Logs, errores y trazabilidad

### Estado actual

- Manejo local con `try/catch`.
- Respuestas JSON de error.
- Uso extendido de `console.error` y `console.warn`.
- `cm_activity_log` registra solo algunas acciones de Meta, WhatsApp y UI.
- No existe Sentry, OpenTelemetry ni logger estructurado.
- No existe tabla general de auditoria.
- `usage_records` esta vacia y no tiene productores.

### Recomendacion

Implementar:

- Logger estructurado con `request_id`, `organization_id`, `user_id`, ruta y resultado.
- Redaccion automatica de tokens, secretos, contenido de mensajes y PII.
- Monitoreo de errores.
- Auditoria inmutable para cambios de plan, suspension, reactivacion y acciones del superadministrador.
- Metricas de webhooks: recibidos, validos, duplicados, fallidos y latencia.
- Alertas de discrepancia entre proveedor, pago, suscripcion y organizacion.

No registrar numeros completos de tarjeta, tokens de pago, secretos de Meta ni payloads sin filtrar.

## 15. Archivos y modulos que se deberan modificar

Esta lista corresponde a fases futuras; **ninguno fue modificado durante esta auditoria**.

### Base de datos

- Nuevas migraciones bajo `web/supabase/migrations`.
- `web/src/types/database.ts`.
- Scripts de validacion y backfill, separados de migraciones destructivas.

No editar migraciones ya aplicadas; crear migraciones nuevas.

### Tenant, autenticacion y permisos

- `web/src/app/login/actions.ts`
- `web/src/app/api/auth/local/route.ts`
- `web/src/components/AuthProvider.tsx`
- `web/src/lib/supabase/middleware.ts`
- `web/src/middleware.ts`, migrandolo a la convencion vigente de proxy de Next.js cuando se haga la actualizacion
- Rutas Community Manager que reciben `clientId`

### Facturacion

- `web/src/lib/epayco/client.ts`
- `web/src/app/api/epayco/checkout/route.ts`
- `web/src/app/api/epayco/confirmation/route.ts`
- `web/src/components/billing/EpaycoCheckout.tsx`
- `web/src/app/(dashboard)/settings/billing/page.tsx`
- `web/src/app/(admin)/admin/plans/page.tsx`
- `web/src/app/(admin)/admin/subscriptions/page.tsx`
- `web/src/app/(admin)/admin/payments/page.tsx`
- APIs administrativas existentes y nuevas.

### Limites

- Nuevo modulo de servidor `web/src/lib/billing` o equivalente.
- Invitaciones y agentes.
- Creacion de marcas.
- Conexion de canales.
- Envio de mensajes.
- Broadcasts.
- Chatbot e IA.
- Publicacion social.
- Importacion de contactos.
- Carga de archivos.
- Reportes.

### Operacion

- `web/vercel.json` para tareas de lifecycle/conciliacion si se conserva Vercel Cron.
- `.env.example` y `.env.production.example`, solo con nombres y descripciones.
- Documentacion de despliegue.
- Suite de pruebas automatizadas.

## 16. Incompatibilidades y decisiones pendientes

1. Definir si se cobra por agencia/organizacion o por marca.
2. Definir moneda y precios reales.
3. Definir mensual, anual, trial y dias de gracia.
4. Definir si la renovacion sera automatica o prepago manual.
5. Confirmar habilitacion de ePayco Suscripciones en la cuenta del comercio.
6. Definir que ocurre con mensajes salientes durante mora.
7. Definir si los contactos excedentes quedan solo lectura o se cobra excedente.
8. Definir si un usuario puede pertenecer a varias organizaciones.
9. Unificar el webhook canonico de cada canal sin retirar el legacy antes de migrar configuraciones externas.
10. Definir retencion legal y privacidad de pagos, mensajes y archivos.
11. Resolver el desfase entre migraciones versionadas y esquema remoto.
12. Decidir como migrar `cm_users` a Supabase Auth sin invalidar cuentas existentes.

## 17. Plan de implementacion por etapas

### Etapa 0: seguridad y linea base

- Crear staging aislado.
- Respaldar base y configuracion.
- Agregar pruebas de humo para Facebook, Instagram, Messenger y WhatsApp.
- Corregir hash de contrasenas y migracion progresiva de credenciales.
- Cerrar RLS y autorizacion por propietario.
- Aplicar parches de dependencias prioritarios.
- Corregir lint y crear una suite minima.

**Criterio de salida:** todos los canales siguen enviando y recibiendo; no hay acceso cruzado entre tenants.

### Etapa 1: normalizacion de tenant

- Declarar `organizations` como cuenta comercial.
- Enlazar cada `cm_client` con una organizacion.
- Backfill con reporte previo y posterior.
- Resolver el campo inexistente `cm_users.cm_client_id`.
- Definir membresias.

**Criterio de salida:** cada recurso facturable resuelve una unica organizacion.

### Etapa 2: catalogo y modelo comercial

- Versionar planes y precios.
- Crear catalogo de features y entitlements.
- Fortalecer suscripciones y pagos.
- Agregar eventos y auditoria.
- Mover mutaciones admin a APIs de servidor.

**Criterio de salida:** planes administrables sin alterar contratos historicos.

### Etapa 3: medicion en modo observacion

- Instrumentar recursos y consumo.
- Crear contadores atomicos.
- Ejecutar con enforcement `observe`.
- Comparar conteos con consultas reales.

**Criterio de salida:** consumo consistente durante al menos un periodo de prueba.

### Etapa 4: pagos ePayco

- Implementar firma oficial con comparacion segura y fallo cerrado.
- Crear checkout sessions internas.
- Validar monto, moneda, ambiente, plan y organizacion.
- Implementar idempotencia.
- Integrar suscripcion recurrente o declarar prepago.
- Conciliar estados.

**Criterio de salida:** pruebas aprobada, pendiente, rechazada, repetida, fuera de orden y firma invalida.

### Etapa 5: lifecycle

- Trial.
- Renovacion.
- Reintentos.
- Gracia.
- `past_due`.
- Suspension segura.
- Reactivacion automatica.
- Cancelacion al fin del periodo.

**Criterio de salida:** cada transicion queda auditada y puede reintentarse sin duplicar efectos.

### Etapa 6: limites graduales

- Activar primero limites de altas.
- Activar luego consumo.
- Proteger salida, no recepcion.
- Habilitar por organizacion.
- Mostrar avisos y upgrade.

**Criterio de salida:** exceder un limite no rompe canales, historial ni recepcion de webhooks.

### Etapa 7: endurecimiento y salida

- Pruebas E2E.
- Pruebas de concurrencia.
- Pruebas de recuperacion.
- Observabilidad y alertas.
- Runbook de soporte.
- Activacion progresiva.

## 18. Plan de pruebas

### Regresion de funciones existentes

- Login y logout.
- Conexion OAuth Meta.
- Conexion WhatsApp Embedded Signup.
- Recepcion y envio por WhatsApp.
- Recepcion y envio por Messenger.
- Recepcion y envio por Instagram.
- Respond.io si esta habilitado.
- Refresco de tokens.
- Publicacion social.
- Inbox, notas, asignacion y cierre.
- Broadcasts.
- IA y automatizaciones.

### Facturacion

- Checkout solo para usuario autenticado y organizacion propia.
- Plan inexistente o archivado.
- Monto alterado.
- Moneda alterada.
- Firma invalida.
- Webhook duplicado.
- Eventos fuera de orden.
- Pago pendiente que luego aprueba.
- Pago rechazado sin afectar suscripcion anterior.
- Trial a activo.
- Mora, gracia, suspension y reactivacion.
- Cancelacion inmediata y al final del periodo.

### Limites

- Dos peticiones concurrentes en el ultimo cupo.
- Borrado de recursos.
- Cambio de plan hacia arriba y hacia abajo.
- Limites ilimitados.
- Overrides.
- Reinicio de periodo.
- Webhook entrante durante suspension.
- Mensaje automatico omitido durante suspension.
- Exportacion y facturacion disponibles durante suspension.

## 19. Respaldo y reversion

### Antes de cada etapa

1. Crear snapshot o backup verificable de PostgreSQL.
2. Exportar por separado los esquemas `public` y `smarttalk`.
3. Guardar conteos y checksums de tablas afectadas.
4. Registrar version de despliegue Vercel y commit.
5. Validar restauracion en staging.
6. Documentar variables requeridas sin copiar secretos al repositorio.

### Estrategia de migracion

- Migraciones aditivas.
- No borrar ni renombrar columnas en la primera salida.
- Backfills idempotentes y reanudables.
- Restricciones nuevas inicialmente `NOT VALID` cuando aplique y validar despues.
- Indices concurrentes cuando el volumen lo requiera.
- Feature flags por organizacion.
- Escritura dual temporal solo si tiene reconciliacion.

### Reversion de aplicacion

1. Cambiar enforcement a `off`.
2. Revertir al despliegue Vercel anterior.
3. Mantener tablas nuevas sin uso; no ejecutar un `DROP` urgente.
4. Reconciliar eventos recibidos durante la ventana.
5. Restaurar backup solo ante corrupcion confirmada, no como mecanismo normal de rollback.

### Reversion de pagos

No borrar transacciones ni eventos. Corregir mediante:

- Evento compensatorio.
- Ajuste auditado.
- Reembolso a traves del proveedor.
- Reactivacion o extension con motivo y actor.

## 20. Criterios de aceptacion globales

El sistema se considerara listo cuando:

- La suscripcion pertenece inequivocamente a una organizacion.
- Todos los recursos facturables resuelven ese tenant.
- Ningun cliente puede consultar o mutar datos de otro.
- Los webhooks de pago son firmados, idempotentes y conciliables.
- Los montos y monedas se validan en servidor.
- Los limites se aplican en servidor y de forma atomica.
- La suspension no pierde mensajes entrantes ni desconecta canales.
- La reactivacion es automatica e idempotente.
- Cada cambio comercial tiene auditoria.
- Existe monitoreo y alertas.
- Las integraciones actuales superan la regresion E2E.
- Existe un rollback probado.

## 21. Conclusion

El proyecto tiene una base comercial parcial valiosa, pero actualmente las tablas y pantallas de billing son principalmente un prototipo funcional. No existe todavia un sistema confiable de suscripciones y limites.

La ruta de menor riesgo es:

1. Mantener las integraciones multicanal existentes.
2. Fortalecer primero seguridad y tenant.
3. Usar `smarttalk.organizations` como cuenta comercial.
4. Conservar ePayco, corrigiendo firma e implementando recurrencia e idempotencia reales.
5. Introducir una capa central de entitlements en modo observacion.
6. Activar limites gradualmente, preservando siempre la recepcion de mensajes.

No se recomienda iniciar cambios de cobro o suspension antes de aprobar las decisiones comerciales de la seccion 16 y completar la Etapa 0.
