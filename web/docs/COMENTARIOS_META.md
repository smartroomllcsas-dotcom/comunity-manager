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

## Error "Invalid Scopes: pages_read_user_content" (resuelto el 11 sep)

Al reconectar Instagram, el diálogo de Meta mostraba:

> Este contenido no está disponible en este momento —
> `Invalid Scopes: pages_read_user_content`

Ese permiso **no se pide desde el código** (no aparece en `getOAuthUrl`). Lo
añade Meta: dentro del caso de uso *Administrar todos los aspectos de tu página*,
`pages_manage_engagement` lo arrastra como dependencia, y al activar el primero
el diálogo empezó a pedir los dos. Como `pages_read_user_content` seguía en
"Agregar a revisión de la app", Meta rechazaba el diálogo entero.

**Solución aplicada**: activarlo en ese mismo caso de uso (queda en
"Listo para la prueba", acceso estándar). Verificado abriendo el diálogo con la
lista exacta de permisos que envía la aplicación: ya carga sin error.

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

## Permisos por solicitar en Revisión de la aplicación

Hoy todo funciona con **tus** marcas porque eres administrador de la app. En el
momento en que un cliente externo conecte su propia página o cuenta con su
usuario, hará falta **acceso avanzado**. Esta es la lista, en orden de prioridad.

### 1. Imprescindibles para el módulo Comentarios

| Permiso | Qué desbloquea | Hoy |
|---|---|---|
| `pages_manage_engagement` | Responder, ocultar y borrar comentarios en la página | Estándar |
| `instagram_manage_comments` | Responder y moderar comentarios de Instagram | Estándar |

Sin acceso avanzado, con un cliente externo llegan los comentarios y se le puede
escribir al interno, pero **no** se puede responder en público.

### 2. Recomendado junto con los anteriores

| Permiso | Qué desbloquea | Hoy |
|---|---|---|
| `pages_read_user_content` | Leer por API los comentarios que escriben los usuarios (traer los anteriores, no sólo los que llegan por webhook) | Activado, "Listo para la prueba" |

### 3. Sólo si se publica desde el CRM (Composer)

| Permiso | Qué desbloquea | Hoy |
|---|---|---|
| `pages_manage_posts` | Crear, editar y borrar publicaciones de la página | Sin activar |
| `instagram_content_publish` | Publicar en Instagram | Estándar |

Nota: `pages_manage_posts` está fuera del código a propósito. Pedirlo antes de
que Meta lo apruebe rompe el diálogo de conexión con *Invalid Scopes*.

### 4. Para operar clientes externos en el resto del producto

| Permiso | Qué desbloquea | Hoy |
|---|---|---|
| `business_management` | Leer y administrar activos del portfolio del cliente | Estándar |
| `ads_management`, `ads_read` | Módulo de anuncios con cuentas publicitarias ajenas | Estándar |
| `leads_retrieval`, `pages_manage_ads` | Leads de formularios de clientes externos (verificar estado en el caso de uso de clientes potenciales) | Verificar |

Ya tienen acceso avanzado ("Lista para publicar") y no hay que pedirlos:
`pages_messaging`, `pages_read_engagement`, `pages_show_list`,
`pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`,
`public_profile`.

### Qué pide Meta en cada solicitud

- Video de pantalla mostrando el flujo completo dentro del producto: conectar la
  página, ver el comentario que llega y responderlo desde el CRM.
- Explicación de por qué el negocio necesita el permiso.
- Verificación del negocio y política de privacidad publicada.
