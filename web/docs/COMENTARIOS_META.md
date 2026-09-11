# Comentarios de Facebook e Instagram — configuración en Meta

App **Community ManagerWA** (`1491695645279792`), portfolio `680953270632416`.

## Ya quedó hecho (11 sep 2026)

| Qué | Dónde | Estado |
|---|---|---|
| Campo `feed` (comentarios de páginas) | Webhooks → objeto *Página* | Suscrito |
| Campo `comments` (comentarios de Instagram) | Webhooks → objeto *Instagram* | Suscrito |
| `pages_manage_engagement` (responder comentarios de la página) | Caso de uso *Administrar todos los aspectos de tu página* | Activado, "Listo para la prueba" |
| `instagram_manage_comments` (responder comentarios de Instagram) | Caso de uso *API de Instagram* | Ya venía "Listo para la prueba" |
| Ambos permisos en la conexión de canales | Configuración de Login for Business **CommunityManager Facebook Mess** (`1345028407804200`), de 7 a 9 permisos | Guardado |

Las URLs de webhook ya apuntaban a producción:
`https://www.comunitymanager.io/api/webhook/facebook` y `…/api/webhook/instagram`.

No se tocaron las configuraciones *CommunityManager Facebook* (`28411472441797718`)
ni *Whatsapp B* (`994300759657345`).

## Lo que falta hacer

1. **Reconectar Facebook e Instagram de cada empresa** en *Canales*. Los tokens
   guardados se emitieron antes de estos permisos y no los traen. Reconectar no
   borra conversaciones ni contactos.
2. En el CRM, entrar a **Comentarios**, elegir la empresa y activar
   *Atender comentarios automáticamente*. Eso suscribe esa página y esa cuenta
   de Instagram concretas (`subscribed_apps`).

## Límite importante: acceso estándar

Los dos permisos de comentarios están en **acceso estándar**, no avanzado. Meta
sólo los concede a personas **con un rol en la app** (administrador, desarrollador
o tester) y sobre activos del propio portfolio comercial.

- Para las marcas propias (Smart Digital, Moda Style…) funciona, porque quien
  conecta es administrador de la app.
- Para un cliente externo que conecte su propia página con su usuario, harían
  falta en **Revisión de la aplicación**: `pages_manage_engagement` e
  `instagram_manage_comments` con acceso avanzado (requiere video del flujo y
  verificación del negocio).

Mientras tanto, el mensaje **al interno** sí funciona para cualquiera: usa
`pages_messaging` e `instagram_manage_messages`, que ya tienen acceso avanzado.

## Límites de Meta que la plataforma ya respeta

- Un solo mensaje al interno por comentario y dentro de **7 días**: el botón
  queda bloqueado con el motivo.
- Respuestas públicas: las redacta la IA leyendo el comentario, no repite el
  texto anterior, espera unos segundos al azar y respeta un tope por hora
  configurable.
