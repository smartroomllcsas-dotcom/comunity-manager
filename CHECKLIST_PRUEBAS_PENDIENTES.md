# Checklist de pruebas pendientes

## Estado actualizado de auditoría - 2026-08-09

**Dictamen:** CommunityManager todavía no debe declararse aprobado para salida
comercial. La base de planes, suscripciones, pagos, límites y aislamiento por
marca está implementada y `BILLING_ENFORCEMENT_MODE=hard` ya está activo en
Production, pero faltan pruebas E2E operativas y controles de seguridad antes de
declarar salida comercial.

### Confirmación manual más reciente — 2026-08-09

- [x] Credenciales sandbox de ePayco configuradas y aceptadas por el flujo de
  checkout.
- [x] Compras sandbox ejecutadas para Demo Inicial, Demo Crecimiento y Demo
  Escala; cada cuenta alcanzó los límites del plan desde la aplicación.
- [x] Revisadas visualmente las vistas autenticadas `/admin/plans`,
  `/admin/payment-gateways` y `/settings/billing`.

Esta confirmación cierra la validación funcional de planes y la revisión visual
indicadas en esta actualización. Deben conservarse en el registro QA las
referencias de pago, organización, suscripción, deployment y capturas; no se
consideran sustituto de las pruebas de concurrencia, ciclo de vida u outbox.

### Evidencia disponible

- [x] Commits integrados: `31c6cd9` (enforcement) y `f73fd39` (reprocesamiento de excedentes), sobre `ee77782`.
- [x] `npm run test`: 12 archivos Vitest, 140 pruebas aprobadas, más 6 pruebas Node aprobadas.
- [x] `npm run lint -- --quiet`: aprobado, sin errores.
- [x] `npm run build`: aprobado en la validación local posterior al último cambio.
- [x] `git diff --check`: aprobado.
- [x] El propietario confirmó en Supabase `Success. No rows returned` para las migraciones `027`, `028`, `029` y `030`.
- [x] Migraciones locales presentes hasta `20260805000400_030_contact_overage_release_queue.sql`.
- [x] Fixture QA inicial y script de limpieza presentes; todavía no constituyen un proyecto QA separado.

### Hallazgos que bloquean la aprobación

- [x] Los webhooks conservan el payload técnico y ahora cada mensaje entrante sobre el límite se registra de forma durable en `smarttalk.contact_overage_events`, privado para `service_role` y deduplicado por canal/evento.
- [x] Implementar el worker que reclama, libera y reprocesa automáticamente los eventos `pending` cuando la organización amplíe el plan. La migración `030` usa una cola con lease y `SKIP LOCKED`; el cron es `/api/cron/release-contact-overage`.
- [x] Enforcement backend implementado en posts, flujos/chatbot, reportes, almacenamiento, IA y broadcasts mediante `checkBillingFeature` y respuestas HTTP 402.
- [x] La migración `030` fue confirmada por el propietario en Supabase antes de desplegar el cron de reprocesamiento.
- [ ] Hacer atómicos los límites de recursos sujetos a concurrencia. Hoy varias decisiones son consulta de uso seguida de insert/update separado; falta probar y proteger el caso simultáneo de límite + 1.
- [ ] Separar QA en otro proyecto Supabase y Preview de Vercel. El seed actual apunta a una organización QA dentro del proyecto conectado.
- [ ] Ejecutar aceptación E2E por cada plan con ePayco sandbox y registrar referencia, estado de pago, suscripción y límites observados.
- [ ] Probar cambio, cancelación, vencimiento, gracia, suspensión y reactivación en una cuenta no productiva.
- [ ] Completar worker de outbox y notificaciones de billing; las tablas existen, pero no hay evidencia de procesamiento completo.
- [x] Confirmar en Vercel el valor actual de `BILLING_ENFORCEMENT_MODE`: `hard`, aplicado en Production el 2026-08-06 y cargado en el deployment `dpl_CtXr95p4vkJaTypfy3uW9zY1DdJ2` (`Ready`, smoke test HTTP 200).

### Evidencia de prueba sintética ejecutada

- [x] El 5 de agosto de 2026 se ejecutó un webhook firmado en local con
  `BILLING_ENFORCEMENT_MODE=hard` contra `QA Agencia Inicial`, que tenía
  `1.000/1.000` contactos.
- [x] Messenger, Instagram y WhatsApp respondieron `200`; cada evento quedó
  en `smarttalk.contact_overage_events` con estado `pending`.
- [x] Cada contacto quedó con `visibility_status=restricted` y
  `restricted_reason=contacts_limit`; no se creó conversación ni mensaje
  visible.
- [x] Se reenvió el mismo webhook Messenger y la deduplicación mantuvo una
  sola fila de excedente.
- [x] Los identificadores temporales se retiraron de los tres canales QA. Se
  dejaron los tres contactos sintéticos para evidenciar que los leads nuevos
  se registran sin exponer contenido ni número; por eso el contador QA ahora
  muestra `1.003/1.000`.

### Regla de lectura

Las casillas de la sección histórica inferior conservan evidencia de la fecha
original. Este bloque es el estado vigente de la auditoría y debe prevalecer
para decidir si se habilita Production.

### Lista ejecutiva de pendientes — 2026-08-06

La integración QA de 42 pruebas y el deployment con
`BILLING_ENFORCEMENT_MODE=hard` ya están completados. La suite usa un Supabase
en memoria y no sustituye la aceptación real con cuentas de QA.

#### P0 — bloqueadores para declarar salida comercial

- [ ] Proteger los límites contra concurrencia y probar dos altas simultáneas en
  el límite.
- [ ] Separar QA en un proyecto Supabase y un Preview de Vercel propios.
- [x] Ejecutar ePayco sandbox con una organización normal para cada uno de los
  tres planes y alcanzar los límites observados desde la aplicación. Las
  referencias de pago, suscripción y deployment deben conservarse en el registro
  QA asociado.
- [ ] Probar en una cuenta no productiva cambio de plan, cancelación,
  vencimiento, gracia, suspensión y reactivación.
- [ ] Completar y demostrar el procesamiento de outbox y las notificaciones de
  billing, incluyendo reintentos e idempotencia.

#### P1 — gates de aprobación antes de cobros reales

- [ ] Aprobar contract tests de ePayco/Wompi/PayU e integración PostgreSQL/RLS.
- [ ] Completar E2E multicanal de Facebook, Instagram y WhatsApp.
- [ ] Aprobar sandbox financiero, backup/restauración y rollback.
- [ ] Revisar `observe` sin falsos bloqueos y validar una organización piloto en
  `hard`.
- [ ] Definir alertas, responsable operativo y autorización explícita para
  activar cobros reales.

#### P2 — validaciones posteriores y endurecimiento

- [ ] Completar renovaciones, upgrades/downgrades y conciliación de webhooks.
- [ ] Probar duplicados y concurrencia de pagos, jobs y webhooks.
- [ ] Completar rate limiting, seguridad, auditoría, carga y resiliencia ante
  timeouts o caídas de gateway/base de datos.
- [ ] Completar las regresiones de autenticación, roles, aislamiento de marca,
  notificaciones y colas descritas en las secciones C–Q.

No se debe marcar un punto como cerrado por tener una prueba sintética: cada
punto requiere evidencia reproducible (deployment, log, captura, ID de evento
o consulta SQL) y debe conservarse sin exponer secretos.

### Evidencia manual recibida — Plan Demo Inicial

La captura de `communitymanager.io/settings/billing` confirma que una cuenta
compró correctamente el plan **Demo Inicial** y llegó a estos valores visibles:

| Recurso | Uso observado | Límite |
|---|---:|---:|
| Usuarios de agencia | 2 | 2 |
| Asesores de marca | 5 | 5 |
| Marcas | 5 | 5 |
| Canales activos | 3 | 3 |
| Contactos | 1.003 | 1.000 |
| Broadcasts del mes | 10 | 10 |
| Flujos de chatbot | 2 | 2 |

Esta captura demuestra compra, activación visual del plan y consumo hasta los
límites. El contador de contactos muestra un excedente de 3, que debe
conciliarse con `smarttalk.contact_overage_events` y la cola de reproceso; no se
deben borrar contactos solo para que el contador vuelva a 1.000.

### Evidencia de siembra — Plan Demo Crecimiento (2026-08-07)

Se sembró localmente la organización demo `98bd0b2c-cf1f-4c0c-9581-45f0442cf678`
(`Agencia test 2`) usando únicamente registros sintéticos con prefijo
`[QA-CRECIMIENTO]`. La suscripción estaba `active`, el plan era
`demo-crecimiento-2026` y la organización conservó su valor por organización
`billing_enforcement_mode=observe`; la variable global de Production permanece
en `BILLING_ENFORCEMENT_MODE=hard`.

| Recurso | Uso exacto | Límite | Evidencia |
|---|---:|---:|---|
| Marcas | 15 | 15 | 15 marcas `[QA-CRECIMIENTO]` |
| Canales activos | 10 | 10 | Canales sintéticos sin credenciales |
| Contactos | 10.000 | 10.000 | Contactos sintéticos `qa_seed` |
| Usuarios de agencia | 5 | 5 | 1 usuario existente + 4 invitaciones `.invalid` |
| Asesores de marca | 20 | 20 | 20 invitaciones `.invalid` |
| Broadcasts del mes | 50 | 50 | Registros `completed` sintéticos, sin envío |
| Flujos | 10 | 10 | Flujos sintéticos inactivos |

El seed no llamó proveedores, no conectó cuentas sociales y no envió mensajes.
La tabla `billing_decision_events` no se llena al sembrar directamente; para
cerrar la validación de `hard` aún debe intentarse una alta número 16 por la
API de la aplicación y conservar la respuesta HTTP `402` con
`code=BILLING_LIMIT_REACHED`.

#### Evidencia runtime de enforcement `hard` — 2026-08-07

La cuenta normal de agencia intentó superar dos límites desde la aplicación.
Las rutas reales rechazaron la operación y registraron la decisión:

| Ruta | Feature | Uso | Límite | Modo | Resultado |
|---|---|---:|---:|---|---|
| `api/cm/clients` | `brands.total` | 15 | 15 | `hard` | `allowed=false`, `would_block=true`, `402` |
| `api/invitations` | `brand.advisors_total` | 20 | 20 | `hard` | `allowed=false`, `would_block=true`, `402` |
| `api/invitations` | `agency.users` | 5 | 5 | `hard` | `allowed=false`, `would_block=true`, `402` |
| `api/chatbot/flows` | `automations.flows` | 10 | 10 | `hard` | `allowed=false`, `would_block=true`, `402` |
| `api/contacts/import` | `contacts.total` | 10.000 | 10.000 | `hard` | 0 nuevos, 1 omitido; `allowed=false`, `would_block=true` |

La evidencia está en `smarttalk.billing_decision_events` con
`reason=limit_reached`. Esto confirma que la variable global de Production
`BILLING_ENFORCEMENT_MODE=hard` se aplica aunque la organización conserve
`billing_enforcement_mode=observe`.

#### Hallazgo y corrección local — alta manual de contactos

El botón visual **Añadir contacto** en `/contacts` no tenía manejador ni ruta
de alta, por lo que no servía para validar ni crear contactos. Se corrigió
localmente con un diálogo y `POST /api/contacts`; la ruta autentica, valida la
marca y su alcance, comprueba duplicados y aplica `contacts.total` mediante
`checkBillingFeature`. Falta publicar el cambio y ejecutar su prueba manual en
Production; hasta entonces la validación de contactos se realiza por la ruta
de importación.

#### Hallazgo runtime — contacto entrante sobre el límite (2026-08-07)

Después de llenar la cuenta, un ingreso desde Instagram registró una decisión
`contacts.total` con `source=sync/instagram/inbound-contact`, modo `hard`,
`allowed=false`, `would_block=true` y uso `10.000/10.000`. El sistema creó un
contacto `restricted` con `quota_restricted=true`, por lo que el conteo pasó a
`10.001`. Esto confirma la política de no perder el lead entrante. Sin embargo,
la consulta a `smarttalk.contact_overage_events` no devolvió una fila para ese
contacto. Debe investigarse antes de cerrar la continuidad y el reproceso de
excedentes: el payload/identificador privado debería conservarse en esa cola.

#### Qué falta hacer con esta cuenta

- [ ] Intentar una marca, canal, asesor, usuario, broadcast y flujo adicionales
  y guardar la respuesta HTTP esperada (`402`) para cada límite.
- [ ] Confirmar que los tres contactos excedentes tienen la política de
  continuidad correcta y que cada evento de excedente está deduplicado.
- [ ] Confirmar que el excedente no permite nuevas altas administrativas, pero
  que los webhooks entrantes conservan el evento y no pierden el mensaje.
- [ ] Guardar fecha, organización, usuario, referencia de pago y deployment de
  la prueba; la captura por sí sola no identifica la transacción.
- [x] Repetir la compra y la matriz de límites con Demo Crecimiento y Demo
  Escala; los tres planes fueron llevados hasta sus límites.

Manual principal:
`GUIA_OPERATIVA_FASE_2_DESPLIEGUE.md`

## Evidencia aprobada localmente y en Production 2026-07-30

- [x] Arquitectura por organizacion.
- [x] ePayco, Wompi y PayU desacopladas mediante adaptadores.
- [x] Renovacion predeterminada en modo manual.
- [x] Checkout Wompi/PayU bloqueado hasta certificar webhooks.
- [x] Activacion ePayco movida a funcion PostgreSQL transaccional e idempotente.
- [x] `npm test` histórico: 99 pruebas aprobadas, 93 Vitest y 6 Node.
- [x] `npm run lint -- --quiet`: aprobado.
- [x] `npm run build`: aprobado.
- [x] `git diff --check`: aprobado.
- [x] Deployment Vercel Production en estado `Ready`.
- [x] `/`, `/login` y `/api/health` responden HTTP `200`.
- [x] Rutas administrativas redirigen a login sin sesion.
- [x] Cron de billing rechaza llamadas sin secreto con HTTP `401`.
- [x] Migracion `011` aplicada y objetos verificados en Supabase.
- [x] Usuarios y asesores separados en modelo, limites e interfaz.
- [x] Cron diario compatible con Vercel Hobby.
- [x] Portada publica con planes vigentes.
- [x] Seleccion de plan y registro comercial.
- [x] Agencia creada en plan gratuito con plan elegido pendiente.
- [x] Propietario creado como administrador y usuario de agencia.
- [x] Migracion `012` aplicada en Supabase.
- [x] Checkout bloqueado si faltan credenciales de la pasarela.
- [x] Desplegar portada publica y onboarding en Vercel Production.
- [x] Migracion `013` aplicada y aislamiento por marca validado en PostgreSQL.
- [x] Cuenta `dev@comunitymanager.io` limpiada para repetir onboarding.
- [x] Configurar credenciales ePayco sandbox en Vercel.
- [x] Completar pagos sandbox desde el onboarding público para los tres planes.
- [ ] Funcion PostgreSQL transaccional validada en staging.
- [x] Diseños autenticados revisados en navegador: `/admin/plans`,
  `/admin/payment-gateways` y `/settings/billing`.
- [ ] Worker de outbox implementado y probado.
- [ ] Notificaciones de billing implementadas y probadas.
- [x] Rate limiting de checkout/webhooks implementado y probado localmente; la
  validación de carga en entorno desplegado sigue pendiente.

## Estado multi-pasarela agregado 2026-07-29

- [x] Aplicar migraciones `009` y `010`, en ese orden, en Supabase `smartmedia`
  (2026-07-30, SQL Editor, rol `postgres`, transacciones independientes).
- [ ] Verificar panel `/admin/payment-gateways`.
- [ ] Confirmar que no permite habilitar una pasarela sin credenciales.
- [ ] Confirmar que no permite checkout cuando el ambiente DB/runtime difiere.
- [ ] Configurar un precio independiente para ePayco, Wompi y PayU.
- [ ] Probar renovacion manual ePayco antes y despues del vencimiento.
- [ ] Confirmar que renovar antes del vencimiento conserva los dias existentes.
- [ ] Confirmar que Wompi y PayU siguen bloqueadas para checkout hasta terminar
  sus webhooks.
- [ ] Repetir pruebas de Messenger, WhatsApp e Instagram despues de migrar.

**Proyecto:** CommunityManager (esquema tecnico heredado `smarttalk`)
**Fecha:** 2026-07-30
**Uso:** marcar solo con evidencia: captura, log, ID de evento o consulta SQL.

## A. Preparacion y recuperacion

- [ ] Backup completo de esquemas `public` y `smarttalk`.
- [ ] Restauracion del backup comprobada en un entorno aislado.
- [ ] Variables de entorno verificadas sin exponer secretos.
- [x] Variables operativas de billing agregadas en Vercel Production el
  2026-07-30: enforcement `off`, gracia de 3 dias, sandbox y renovacion manual.
- [x] Confirmar las variables operativas en Vercel Production despues del
  primer despliegue.
- [x] Confirmar con prueba funcional que las credenciales sandbox de ePayco
  son correctas.
- [x] Pasarela confirmada en sandbox mediante compras de los tres planes.
- [ ] URL publica HTTPS de webhook confirmada.
- [ ] Logs y correlation IDs visibles.
- [ ] Procedimiento de rollback probado.

## B. Migracion y datos

- [ ] Migracion ejecutada sin error en PostgreSQL compatible con produccion.
- [ ] Constraints e indices creados.
- [ ] Funcion atomica de consumo ejecutable solo por `service_role`.
- [ ] RLS validado con dos organizaciones.
- [x] Cada marca vinculada a la organizacion correcta.
- [ ] Ninguna marca accesible desde otra agencia.
- [ ] No existen dos suscripciones vigentes para una organizacion.
- [ ] Planes heredados conservados.
- [ ] Precios guardados en unidades menores y moneda correcta.

## C. Regresion de autenticacion

- [x] Registro nuevo mediante seleccion de plan.
- [ ] Login correcto.
- [ ] Login incorrecto.
- [ ] Migracion de contrasena heredada a `bcrypt`.
- [ ] Logout invalida sesiones.
- [ ] Rol `agent` no administra facturacion.
- [ ] Rol `admin` administra su agencia.
- [ ] Superadmin administra catalogo.
- [ ] Hash de contrasena nunca aparece en respuestas.

## C.1 Usuarios de agencia y asesores

- [x] Agentes existentes migrados como `agency_user`.
- [x] No se crearon asesores automaticamente.
- [ ] Invitar un usuario de agencia.
- [ ] Invitar un asesor con una marca.
- [ ] Invitar un asesor con varias marcas.
- [ ] Rechazar asesor sin marca.
- [ ] Rechazar una marca de otra agencia.
- [ ] Reclasificar usuario de agencia como asesor.
- [ ] Reclasificar asesor como usuario de agencia.
- [ ] Validar limite total de asesores en `observe`.
- [ ] Validar limite por marca en `observe`.
- [ ] Confirmar que un asesor no accede a una marca no asignada.
- [x] Etiquetar canales, contactos y conversaciones por marca.
- [ ] Confirmar con dos asesores reales que RLS oculta marcas no asignadas.

## C.2 Aislamiento de leads por marca

- [x] Canal con `brand_id` obligatorio.
- [x] Contacto con `brand_id` obligatorio.
- [x] Conversacion con `brand_id` obligatorio.
- [x] Rechazo DB de contacto/canal pertenecientes a marcas distintas.
- [x] Mismo identificador externo separado entre dos marcas.
- [ ] Crear dos marcas nuevas mediante el onboarding limpio.
- [ ] Conectar un canal en cada marca.
- [ ] Enviar desde el mismo usuario externo a las dos marcas.
- [ ] Confirmar dos contactos y dos historiales independientes en interfaz.

## D. Regresion Facebook Messenger

- [ ] Conectar cuenta.
- [ ] Recibir texto.
- [ ] Responder texto.
- [ ] Recibir y enviar adjunto soportado.
- [ ] Mensaje no duplicado.
- [ ] Reiniciar sesion sin perder conexion.
- [ ] Webhook sigue entrando durante suspension.
- [ ] Agencia ajena no puede operar el canal.

## E. Regresion Instagram

- [ ] Conectar cuenta.
- [ ] Recibir mensaje.
- [ ] Responder mensaje.
- [ ] Publicar contenido.
- [ ] Contabilizar una publicacion por plataforma exitosa.
- [ ] Error de Meta no contabiliza consumo.
- [ ] Mensaje no duplicado.
- [ ] Webhook sigue entrando durante suspension.

## F. Regresion WhatsApp

- [ ] Conectar numero.
- [ ] Recibir texto.
- [ ] Enviar texto.
- [ ] Enviar plantilla aprobada.
- [ ] Imagen.
- [ ] Audio.
- [ ] Video.
- [ ] Documento.
- [ ] Mensaje no duplicado.
- [ ] Token/numero persiste tras redeploy.
- [ ] Webhook sigue entrando durante suspension.

## G. Planes y precios

- [ ] Crear plan borrador.
- [ ] Configurar features booleanos.
- [ ] Configurar limites cuantitativos.
- [ ] Configurar limites por periodo.
- [ ] Configurar precio COP real.
- [ ] Publicar plan.
- [x] Plan visible en catalogo publico.
- [ ] Plan sin precio no es comprable.
- [ ] Nueva version no modifica suscripciones actuales.
- [ ] Archivar plan impide nuevas compras.

## H. Compra y pagos sandbox

- [ ] Checkout solo para administrador.
- [ ] Monto tomado del servidor.
- [ ] Pago aprobado activa exactamente una vez.
- [ ] Pago pendiente no activa.
- [ ] Pago rechazado no activa.
- [ ] Pago fallido no activa.
- [ ] Checkout vencido no activa.
- [ ] Firma invalida rechazada.
- [ ] Referencia alterada rechazada.
- [ ] Monto alterado rechazado.
- [ ] Moneda alterada rechazada.
- [ ] Ambiente sandbox/produccion cruzado rechazado.
- [ ] Webhook duplicado responde sin duplicar efectos.
- [ ] Dos webhooks concurrentes no duplican periodo.
- [ ] Redirect sin webhook no activa.
- [ ] Conciliacion recupera webhook perdido.
- [ ] Payload almacenado no contiene datos PCI.

## I. Estados de suscripcion

- [ ] `incomplete -> active`.
- [ ] `trialing -> active`.
- [ ] `active -> past_due`.
- [ ] `past_due -> grace_period`.
- [ ] `grace_period -> suspended`.
- [ ] `grace_period -> active`.
- [ ] `suspended -> active`.
- [ ] Cancelacion programada.
- [ ] Cancelacion inmediata autorizada.
- [ ] Vencimiento al final del periodo.
- [ ] Cada transicion crea historial.
- [ ] Transicion invalida se rechaza.

## J. Renovacion

- [ ] Renovacion manual por checkout.
- [ ] Renovacion automatica solo si existe fuente autorizada.
- [ ] Intento aprobado extiende un periodo exacto.
- [ ] Intento pendiente se concilia.
- [ ] Intento rechazado incrementa contador.
- [ ] Reintentos no duplican cobros.
- [ ] Periodo se calcula desde fin vigente, no acorta servicio.
- [ ] Cancelacion programada impide nueva renovacion.

## K. Cambio de plan

- [ ] Upgrade programado.
- [ ] Upgrade inmediato solo tras pago aprobado si se habilita.
- [ ] Downgrade al final del periodo.
- [ ] Snapshot anterior conservado.
- [ ] Nuevo snapshot aplicado en fecha correcta.
- [ ] Recursos existentes no se borran al bajar de plan.
- [ ] Nuevas altas se bloquean si ya excede el nuevo limite.

## L. Limites y enforcement

- [ ] `off` no consulta ni bloquea.
- [ ] `observe` registra `would_block` sin bloquear.
- [ ] `soft` permite y notifica.
- [ ] `hard` bloquea backend.
- [ ] Ocultar boton no es el unico control.
- [ ] Llamada API directa tambien se bloquea.
- [ ] Ultima unidad permitida funciona.
- [ ] Siguiente unidad devuelve error estable.
- [ ] Usuarios/invitaciones.
- [ ] Marcas.
- [ ] Canales.
- [ ] Contactos.
- [ ] Mensajes salientes.
- [ ] Publicaciones.
- [ ] Broadcasts.
- [ ] IA.
- [ ] Almacenamiento cuando se implemente.
- [ ] Consumo duplicado usa idempotencia.
- [ ] Contadores coinciden con eventos.

## M. Suspension y acceso esencial

- [ ] Login disponible.
- [ ] Pantalla de facturacion disponible.
- [ ] Pago de reactivacion disponible.
- [ ] Recepcion de mensajes disponible.
- [ ] Datos no eliminados.
- [ ] Creacion de recursos premium bloqueada.
- [ ] Envio saliente se comporta segun politica aprobada.
- [ ] Reactivacion no exige reconectar canales.

## N. Notificaciones

- [ ] Pago aprobado.
- [ ] Pago pendiente.
- [ ] Pago rechazado.
- [ ] Inicio de gracia.
- [ ] Aviso previo a suspension.
- [ ] Suspension.
- [ ] Reactivacion.
- [ ] Cambio de plan.
- [ ] Cancelacion.
- [ ] Idempotencia evita correos duplicados.
- [ ] Fallo de proveedor se reintenta.

## O. Jobs y cola

- [ ] Dos ejecuciones del cron no duplican trabajo.
- [ ] Lease vencido permite recuperar job.
- [ ] Backoff aumenta entre intentos.
- [ ] Evento agotado pasa a dead-letter.
- [ ] Reproceso manual queda auditado.
- [ ] Worker puede reiniciarse sin perder eventos.
- [ ] Eventos antiguos se procesan en orden seguro.

## P. Seguridad

- [ ] Service role ausente del bundle cliente.
- [ ] Secretos ausentes de logs.
- [ ] PAN/CVV nunca almacenados.
- [ ] Rate limit en checkout y webhooks.
- [ ] Limite de tamano de payload.
- [ ] Content-Type validado.
- [ ] Firma comparada en tiempo constante cuando aplique.
- [ ] RLS entre organizaciones.
- [ ] APIs antiguas no permiten `organization_id` arbitrario.
- [ ] Auditoria inmutable.
- [ ] Dependencias auditadas.

## Q. Rendimiento y resiliencia

- [ ] Carga de webhooks concurrentes.
- [ ] Gateway timeout.
- [ ] Gateway 5xx.
- [ ] Respuesta malformada.
- [ ] Base temporalmente no disponible.
- [ ] Reintento despues de caida entre pago y activacion.
- [ ] Consulta de uso con volumen representativo.
- [ ] Indices usados en jobs de vencimiento.

## R. Aprobacion de salida

- [x] Build de produccion aprobado localmente.
- [x] Pruebas unitarias aprobadas localmente.
- [x] Deployment Production y smoke test publico aprobados.
- [ ] Contract tests de pasarela aprobados.
- [ ] Integracion PostgreSQL aprobada.
- [ ] E2E multicanal aprobado.
- [ ] Sandbox financiero aprobado.
- [ ] Backup y rollback aprobados.
- [ ] `observe` revisado sin falsos bloqueos.
- [ ] Organizacion piloto en `hard`.
- [ ] Alertas y responsable operativo definidos.
- [ ] Autorizacion explicita para activar cobros reales.
