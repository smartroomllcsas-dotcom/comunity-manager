# Checklist de pruebas pendientes

## Estado actualizado de auditoría - 2026-08-05

**Dictamen:** CommunityManager todavía no debe declararse aprobado para salida
comercial. La base de planes, suscripciones, pagos, límites y aislamiento por
marca está implementada, pero faltan pruebas E2E y varios controles de
enforcement antes de activar `BILLING_ENFORCEMENT_MODE=hard` en Production.

### Evidencia disponible

- [x] Commit local y remoto revisado: `7dba8e5` (`fix: enforce advisor brand data isolation`).
- [x] `npm run test`: 9 archivos Vitest, 127 pruebas aprobadas, más 6 pruebas Node aprobadas.
- [x] `npm run lint -- --quiet`: aprobado, sin errores.
- [x] `npm run build`: aprobado en la validación local posterior al último cambio.
- [x] `git diff --check`: aprobado.
- [x] El propietario confirmó en Supabase `Success. No rows returned` para las migraciones `027` y `028`.
- [x] Migraciones locales presentes hasta `20260805000200_028_advisor_brand_rls_hardening.sql`.
- [x] Fixture QA inicial y script de limpieza presentes; todavía no constituyen un proyecto QA separado.

### Hallazgos que bloquean la aprobación

- [x] Los webhooks conservan el payload técnico y ahora cada mensaje entrante sobre el límite se registra de forma durable en `smarttalk.contact_overage_events`, privado para `service_role` y deduplicado por canal/evento.
- [ ] Implementar el worker que libere y reprocesa automáticamente los eventos `pending` cuando la organización amplíe el plan.
- [ ] Completar enforcement en las rutas heredadas de publicaciones y flujos. La ruta general de posts y el editor de flujos escriben directamente sin `checkBillingFeature`.
- [ ] Aplicar `reports.access` y `storage.bytes`; existen en el catálogo, pero no hay enforcement real en las rutas de reportes/almacenamiento.
- [ ] Hacer atómicos los límites de recursos sujetos a concurrencia. Hoy varias decisiones son consulta de uso seguida de insert/update separado; falta probar y proteger el caso simultáneo de límite + 1.
- [ ] Separar QA en otro proyecto Supabase y Preview de Vercel. El seed actual apunta a una organización QA dentro del proyecto conectado.
- [ ] Ejecutar aceptación E2E por cada plan con ePayco sandbox y registrar referencia, estado de pago, suscripción y límites observados.
- [ ] Probar cambio, cancelación, vencimiento, gracia, suspensión y reactivación en una cuenta no productiva.
- [ ] Completar worker de outbox y notificaciones de billing; las tablas existen, pero no hay evidencia de procesamiento completo.
- [ ] Confirmar en Vercel el valor actual de `BILLING_ENFORCEMENT_MODE`. La documentación histórica registra `off`; no se debe asumir que Production está en `hard` sin verificarlo.

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
- [ ] Configurar credenciales ePayco sandbox en Vercel.
- [ ] Completar un pago sandbox desde el onboarding publico.
- [ ] Funcion PostgreSQL transaccional validada en staging.
- [ ] Disenos autenticados revisados en navegador.
- [ ] Worker de outbox implementado y probado.
- [ ] Notificaciones de billing implementadas y probadas.
- [ ] Rate limiting de checkout/webhooks implementado y probado.

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
- [ ] Confirmar con prueba funcional que las credenciales sandbox de ePayco
  son correctas.
- [ ] Pasarela confirmada en sandbox.
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
