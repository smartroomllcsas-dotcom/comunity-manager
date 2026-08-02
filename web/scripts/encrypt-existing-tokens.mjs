#!/usr/bin/env node
/**
 * Sprint 22 · Cifrado one-off de access tokens en claro.
 *
 * Este script es un ALIAS de `scripts/reencrypt-tokens.mjs` que ya existe en
 * el repo (Sprint 4). Se mantiene bajo el nombre pedido por el spec de
 * Sprint 22 para que sea descubrible por su documentación.
 *
 * Recorre las tablas con columnas *_ciphertext (channels, cm_social_accounts,
 * cm_whatsapp_accounts, organizations), cifra cualquier token en claro que
 * aún no tenga contraparte cifrada, y limpia la columna plain. Idempotente.
 *
 * Uso:
 *   # Modo simple (env vars en shell):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TOKEN_ENCRYPTION_KEY=... \
 *     node scripts/encrypt-existing-tokens.mjs
 *
 *   # Con .env.local (Node >= 20.6):
 *   node --env-file=.env.local scripts/encrypt-existing-tokens.mjs
 *
 * Env vars requeridas:
 *   NEXT_PUBLIC_SUPABASE_URL     URL del proyecto Supabase.
 *   SUPABASE_SERVICE_ROLE_KEY    Service role key (bypass RLS).
 *   TOKEN_ENCRYPTION_KEY         32 bytes base64 o hex.
 *                                Generar: openssl rand -base64 32
 *
 * Salida (por tabla):
 *   migradas: N   sin cambios: M
 * Errores por fila se loguean y no abortan el proceso.
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Delegamos al script canónico. Import dinámico para heredar side-effects
// (validación de env + ejecución del main). Ambos scripts hacen exactamente
// lo mismo — mantenerlos separados evita romper llamadores existentes.
await import(path.resolve(__dirname, 'reencrypt-tokens.mjs'))
