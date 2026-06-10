# PLAN FUTURO — Permisos Meta para publicación y ads

> Este archivo deja pendiente la siguiente fase para retomarla cuando se active explícitamente.

## Objetivo
Habilitar funciones de:
- Publicación en Facebook
- Publicación en Instagram
- Gestión de campañas / anuncios

## Permisos a retomar después

### Publicación
- `pages_manage_posts`
- `instagram_content_publish`

### Publicidad
- `ads_read`
- `ads_management`

## Cuándo retomarlo
Retomar esta fase solo cuando:
1. La bandeja de entrada de Facebook Messenger e Instagram Direct ya esté funcionando.
2. El login y los webhooks de mensajes estén estables.
3. Se confirme que realmente se necesita publicar contenido o leer/gestionar ads.

## Siguiente trabajo probable
Cuando se retome esta fase, revisar:
- `src/components/FacebookLoginButton.tsx`
- `src/lib/meta.ts`
- `src/app/api/social/publish/route.ts`
- cualquier flujo de campañas / insights que use Meta Graph API

## Nota
Estos permisos **no son necesarios** para el MVP de mensajería:
- Facebook Messenger Inbox
- Instagram Direct Inbox

