# Bitácora de actividades — CommunityAgent

Registro de lo aplicado en producción (rama `visual/os-fusion`, proyecto Vercel `comunityagent`) y de lo pendiente. Se actualiza en cada sesión de trabajo. Fechas en hora de Colombia.

## Estado actual (8 sep 2026)

| Empresa | Canales activos | Agente IA | Notas |
|---|---|---|---|
| Smart Digital Media | WhatsApp API, Instagram, Messenger | Sí (califica Tibio/Calificado/Perdido, agenda por Cal.com) | Plantillas Utility `recordatorio_reunion` y `confirmacion_solicitud_lead` **pendientes de aprobación en Meta** |
| Moda Style CG | WhatsApp por QR (WAHA), Instagram, Messenger | Sí (redirige a WhatsApp desde IG/Messenger; en el QR envía bienvenida mayorista y pasa a Ventas) | Respuestas fijas y reglas de prendas/archivos configuradas desde el CRM |

## Aplicado

### 11 sep 2026
- **Meta configurado para comentarios** (app Community ManagerWA): campos `feed` (Página) y `comments` (Instagram) suscritos en Webhooks; `pages_manage_engagement` activado en el caso de uso de páginas; `pages_manage_engagement` e `instagram_manage_comments` agregados a la configuración de Login for Business "CommunityManager Facebook Mess". Ambos quedan en **acceso estándar**: funcionan para quien tenga rol en la app y activos del portfolio propio; para clientes externos habría que pedir acceso avanzado en Revisión de la aplicación. Detalle en `web/docs/COMENTARIOS_META.md`. **Falta reconectar Facebook e Instagram de cada empresa en Canales** para que el token traiga los permisos nuevos.
- **Módulo de Comentarios** (nuevo en el menú), por empresa: llegan los comentarios de publicaciones y pautas de Facebook e Instagram; se pueden responder en público y escribirle al interno a quien comentó. Ese mensaje abre el chat en la Bandeja con el contacto creado, y cuando la persona responde el agente de la empresa sigue la conversación. Configurable: automático (respuesta pública y/o mensaje al interno) o manual, con textos propios, palabras clave para filtrar y "sólo el primer comentario de cada persona". Migración **050** aplicada y suscripción a los avisos de Meta (`feed` y `comments`) al activar. Límite de Meta: un solo mensaje al interno por comentario y dentro de 7 días; la pantalla **bloquea** el botón y explica el motivo en vez de dejar que falle. Respuesta pública **redactada por la IA** leyendo el comentario (no genérica, distinta cada vez) con textos fijos de respaldo, sin repetir el texto anterior, con pausa aleatoria y tope configurable por hora para que Meta no lo lea como spam.
- **Detener el seguimiento de un cliente a mano**: bloque "Seguimiento automático" en la ficha del contacto y en la pestaña Notas del chat. Botón **Detener seguimiento** (con motivo opcional; el lead NO pasa a Perdido) y **No contactar** (sale de seguimiento, difusiones y sincronización, y pasa a Perdido). Ambos dejan nota en el chat firmada por el asesor y son reversibles.
- Notas internas también en hora de Colombia.

### 10 sep 2026
- **Ramas unificadas**: `master` quedó igual a `visual/os-fusion` (239 commits integrados, sin conflictos; 262 pruebas en verde). Producción sigue desplegándose por CLI desde el mismo código.
- **El asesor es dueño del chat**: si una persona respondió o dejó nota interna en un chat en las últimas 24 h, el agente IA no responde ahí (en ningún canal); y el seguimiento automático no toca chats con último mensaje humano, nota humana en 7 días, asesor asignado o bot en pausa. Antes el agente "reabordaba" clientes que ya había atendido un asesor.
- **Inbox en hora de Colombia**: todas las horas del Inbox (lista y chat) se muestran en hora de Colombia sin depender del navegador; separadores por día ("Hoy", "Ayer", fecha completa) y fecha exacta en cada mensaje del cliente.
- **Inbox**: la insignia de mensajes sin leer desaparece al instante al abrir el chat, y la lista se ordena por el último mensaje real (del cliente o nuestro). Antes, abrir un chat lo subía al inicio y responder no siempre lo movía. Migración **049** aplicada (trigger: cada mensaje nuevo mueve la conversación).
- **Seguimiento automático por pasos, para todas las empresas**: reemplaza la retoma única. Por defecto 3 intentos (24 h, 72 h y 7 días de silencio del cliente) y, si sigue sin responder 48 h después del último, se marca Perdido, nota en el chat y correo a los asesores. WhatsApp API usa plantilla (la del paso o la de retoma; Utility para EE. UU. o si Meta limita marketing); WhatsApp por QR usa texto (Moda incluido). Configurable en Automatización de leads → "Seguimiento automático". No aplica a Perdido/Cliente, "no contactar" ni a quien ya agendó.
- Retoma con plantilla Utility para números de EE. UU./Canadá y limitados por Meta.
- Plantillas Utility de Smart Digital aprobadas por Meta (9 sep): `recordatorio_reunion`, `confirmacion_solicitud_lead`, `confirmacion_pedido`. Recordatorio de reunión probado en vivo con una reunión manual.

### 9 sep 2026
- **Agenda** (nuevo en el menú): calendario mensual con las reuniones agendadas por Cal.com de la empresa activa, próximas y pasadas, enlace a la ficha del contacto y al chat, botón "Agendar para un cliente" (página pública de Cal.com embebida) y acceso a Cal.com. El panel de Cal.com no se puede embeber (lo bloquea Cal.com), por eso abre en pestaña nueva.
- Corregido el flujo de despliegue: varios deploys del 8 sep no habían salido; ahora se verifica la edad del último deploy.

### 8 sep 2026
- **Base de datos**: aplicadas en producción (SQL Editor del Studio) la migración **048 Difusiones v2** (columnas de empresa, canal, plantilla nueva, audiencia, variables, programación, cupo por hora y seguimiento por destinatario) y la **046** pendiente (notas internas sin autor humano). Los archivos quedan en `web/supabase/migrations/`.
- **Difusiones v2, por empresa** (menú Difusiones): asistente en 3 pasos (mensaje → audiencia → envío). Canal WhatsApp API (plantilla aprobada de la empresa, variables con datos del contacto) o WhatsApp por QR (texto libre). Audiencia por etapa, origen, etiquetas, fecha de llegada y "sin escribir hace N días", con vista previa de cuántos reciben y quiénes quedan excluidos y por qué (sin número, no contactar/Perdido, sin WhatsApp, limitados por Meta, ya recibió la plantilla). Envío ahora o programado, ritmo por hora, pausar/reanudar/cancelar, reintentar fallidos. Seguimiento real por destinatario: enviado, entregado, leído, respondió, fallido con motivo. Cron cada 5 min. Todo validado por empresa (canal, plantilla, contactos, permisos).
- **Home nueva** (`/es/os`): resumen por empresa con leads de hoy, chats que esperan respuesta, atendidos por la IA, reuniones, estado de canales, últimos 7 días, embudo, últimos leads y accesos rápidos. Selector de empresa.
- **Instagram/Messenger sin duplicados**: el bot guarda el id de Meta y el eco ya no se repite en el chat. Borrados 67 ecos duplicados.
- **Sin respuestas dobles**: si el cliente manda dos mensajes seguidos, responde solo la ejecución del último (revisa la cola antes de contestar).

### 7 sep 2026
- **Agente IA en el WhatsApp por QR (WAHA)**: atiende al instante (webhook en línea), no interviene si un asesor respondió desde el celular en la última hora, ignora mensajes de protocolo vacíos, resuelve ids @lid por contacto conocido, sin ventana de 24 h. Limpieza en Moda: 1.359 mensajes vacíos y 824 contactos/conversaciones vacías borrados.
- **Cola de webhooks**: reclamo atómico (no se solapan corridas), drenado por tiempo y chats en paralelo. Antes: 288 pendientes y respuestas con 15 min de retraso.
- **Historial del modelo** siempre termina en el cliente (error "must end with a user message" que callaba al agente).
- **Respuestas automáticas exactas por canal** (texto tal cual, sin IA): nueva sección en *Automatización de leads*. Moda: mensaje de bienvenida mayorista ($50.000 COP) al pedir catálogo/info, una sola vez.
- **Instrucciones por canal** (WhatsApp / Instagram / Messenger) por empresa. Moda: redirección elegante a WhatsApp desde IG/Messenger; en el QR, saludo, bienvenida mayorista, "QUIERO SER MAYORISTA" → Calificado + Ventas + nota; preguntas por prenda específica y archivos/imágenes/audios → "una asesora te atiende" + Ventas.
- **Recordatorio de reunión** por WhatsApp 60 min antes (plantilla Utility pide responder SÍ) y **retoma automática** a las 24 h. Plantilla Utility de primer contacto para EE. UU./Canadá y reintento cuando Meta restringe marketing.
- **Sincronización de leads**: separa reintentables de "no contactables por WhatsApp" (sin WhatsApp, Meta limitó marketing 131049, inactivo 24 h, inválido); envía primero los nunca intentados, del más antiguo al más nuevo. Smart Digital: 31 pendientes, 20 no contactables.
- **No contactar**: si el cliente dice "no quiero que me contacten", "no me interesa", "stop", o responde "No" a la primera plantilla, se marca *No contactar* + Perdido + nota y queda fuera de sincronización y retoma.
- **Contactos duplicados** por "+57" vs "57": unificados 7 y normalizados 60 en Smart Digital; el lead de formulario ya se guarda en dígitos.
- **Inbox**: ventana de respuesta con fechas claras y bloqueo explícito (IG/Messenger 24 h), selector de plantillas aprobadas con variables explicadas, cambio de empresa sin recargas, botón "WhatsApp por QR" en cada tarjeta de cliente, adjuntos del QR descargables.

### 4–6 sep 2026
- Agente IA entiende **imágenes, PDF y documentos (Claude)** y **audios/videos (OpenAI)**.
- **Cal.com**: webhook de reservas, enlace de agenda personalizado, tarjeta "Reunión" en la ficha del contacto, lead creado al agendar desde la web pública.
- **Avisos a asesores por correo** cuando un lead no se puede contactar por WhatsApp (rebote, sin WhatsApp, sin teléfono, 24 h sin entregar), con el nombre de la empresa. Todo asesor asignado a una empresa recibe los correos de sus leads.
- Sincronización de leads de formulario que llegaron antes de la automatización; plantilla de primer contacto visible en el chat.
- Invitaciones: "Cancelar" corregido; avisos de error visibles (Toaster montado).
- Canal **WhatsApp por QR (WAHA)** self-hosted: conexión, QR automático, reconexión, ingestión de DMs @lid.
- API server-to-server para envío de plantillas (`X-Integration-Key`), primer consumidor Doc Me Up Express.

## Pendiente

- **Variables en Vercel**: `OPENAI_API_KEY` (audios/videos).
- Contactos de Moda que entraron con id @lid como "número": se corrigen solos cuando WhatsApp mande el número; opcional una pasada consultando la agenda de WAHA.
- Estado de la sesión WAHA en `waha_sessions` figura FAILED aunque funciona: sincronizar el estado.
- Cuenta vieja `smartsends` y usuario admin antiguo: revisar. Contraseña del asesor smartroomllcsas@gmail.com la pone el usuario.
- Billing P0, endurecer `/api/integrations/wa/send`.
- **Difusiones (pendiente de esta vista)**: primera prueba en vivo: crear una difusión en Smart Digital con la etiqueta o etapa de un grupo pequeño y ritmo 5 por hora, y revisar el detalle. Después borrar las 60 difusiones QA sintéticas del sistema viejo que siguen en la lista.
- 2 tests `qa-e2e` (profile, resilience) fallan desde antes; meta-oauth ya quedó corregido.
