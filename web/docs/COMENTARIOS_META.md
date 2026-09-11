# Comentarios de Facebook e Instagram — qué hay que configurar en Meta

El módulo **Comentarios** (menú del CRM) ya está desplegado. Para que funcione de
punta a punta hacen falta tres cosas en la app de Meta **Community ManagerWA**
(identificador `1491695645279792`). Sin ellas, los comentarios no llegan o la
respuesta pública falla con un error de permisos.

## 1. Permisos (los que faltan hoy)

| Permiso | Para qué | ¿Ya lo tenemos? |
|---|---|---|
| `pages_read_engagement` | leer comentarios de la página | sí |
| `pages_messaging` | escribir al interno (private reply) | sí |
| `instagram_basic`, `instagram_manage_messages` | Instagram: leer y escribir al interno | sí |
| **`pages_manage_engagement`** | **responder un comentario de la página** | **falta** |
| **`instagram_manage_comments`** | **responder un comentario de Instagram** | **falta** |

Los dos que faltan ya están pedidos en el código (`src/lib/meta.ts`), pero Meta
sólo los concede si el **caso de uso de la app** los incluye. Si el diálogo de
conexión empieza a fallar con `Invalid Scopes: pages_manage_engagement`, es que
el caso de uso todavía no los tiene.

En el panel: **Casos de uso** → el caso que usa la app para páginas → *Personalizar*
→ activar `pages_manage_engagement` (y `instagram_manage_comments` en el de
Instagram). Si Meta los marca como "requiere revisión", hay que enviarlos a
**Revisión de la aplicación** con un video del flujo.

## 2. Configuración de inicio de sesión (Login for Business)

La conexión de canales usa una configuración de Facebook Login for Business
(`NEXT_PUBLIC_META_CONFIG_ID = 994300759657345`). **Los permisos de esa
configuración mandan sobre lo que pida el código.** Hay que editarla y añadir
los mismos dos permisos; si no, aunque el caso de uso los tenga, el token que
recibimos no los traerá.

## 3. Webhooks

En **Webhooks** de la app, además de los campos actuales:

- Objeto **Página**: activar el campo **`feed`** (comentarios de publicaciones y
  de pautas).
- Objeto **Instagram**: activar el campo **`comments`**.

La suscripción de cada página y cada cuenta de Instagram concreta la hace la
plataforma sola: al activar *Atender comentarios automáticamente* en el módulo
Comentarios llama a `subscribed_apps` con esos campos.

## 4. Reconectar los canales

Los tokens guardados se emitieron **sin** los permisos nuevos. Después de los
pasos 1 y 2 hay que entrar a **Canales** y volver a conectar Facebook e
Instagram de cada empresa: así el token se vuelve a emitir con los permisos de
comentarios. Reconectar no borra conversaciones ni contactos.

## Qué funciona sin reconectar

- Recibir y guardar los comentarios (en cuanto el webhook tenga `feed`/`comments`).
- **Escribir al interno** a quien comentó: usa `pages_messaging` /
  `instagram_manage_messages`, que ya están concedidos.

Lo único que exige los permisos nuevos es **responder el comentario en público**.

## Límites de Meta que ya respeta la plataforma

- Un solo mensaje al interno por comentario y dentro de **7 días**: el botón
  queda bloqueado con el motivo.
- Respuestas públicas: las redacta la IA leyendo el comentario, no repite el
  texto anterior, espera unos segundos al azar y respeta un tope por hora
  configurable, para que Meta no lo lea como spam.
