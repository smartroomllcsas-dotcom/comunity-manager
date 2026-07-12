#!/usr/bin/env node
// One-shot data migration: re-cifra tokens en claro a las columnas *_ciphertext.
// Idempotente: reejecutar es no-op para filas ya cifradas.
//
// Uso:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TOKEN_ENCRYPTION_KEY=... \
//     node scripts/reencrypt-tokens.mjs
//
// Requiere @supabase/supabase-js instalado.

import { createCipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12

function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY requerida')
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error(`TOKEN_ENCRYPTION_KEY debe ser 32 bytes (recibí ${key.length})`)
  return key
}

function encryptToken(plain) {
  if (!plain) return null
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

function assertEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} requerida`)
  return value
}

const supabaseUrl = assertEnv('NEXT_PUBLIC_SUPABASE_URL').trim()
const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY').trim()

const publicDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false }, db: { schema: 'public' } })
const smarttalkDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false }, db: { schema: 'smarttalk' } })

async function reencryptTable({ label, client, table, columns }) {
  console.log(`\n--- ${label} ---`)
  // Trae filas con al menos una columna plain no nula.
  const selectCols = ['id', ...columns.flatMap((c) => [c.plain, c.cipher])].join(',')
  const orFilter = columns.map((c) => `${c.plain}.not.is.null`).join(',')
  const { data, error } = await client.from(table).select(selectCols).or(orFilter)
  if (error) {
    console.error(`  error leyendo ${table}:`, error.message)
    return
  }

  let migrated = 0
  let skipped = 0

  for (const row of data ?? []) {
    const updates = {}
    for (const { plain, cipher } of columns) {
      const plainValue = row[plain]
      const cipherValue = row[cipher]
      // Si ya está cifrado, dejamos y limpiamos el plain (nunca cohabitan).
      if (cipherValue) {
        if (plainValue) updates[plain] = null
        continue
      }
      if (!plainValue) continue
      updates[cipher] = encryptToken(plainValue)
      updates[plain] = null
    }

    if (Object.keys(updates).length === 0) {
      skipped++
      continue
    }

    const { error: updateError } = await client.from(table).update(updates).eq('id', row.id)
    if (updateError) {
      console.error(`  fallo actualizando ${table}.${row.id}:`, updateError.message)
      continue
    }
    migrated++
  }

  console.log(`  migradas: ${migrated}, sin cambios: ${skipped}`)
}

async function main() {
  console.log('Iniciando re-cifrado de tokens…')

  await reencryptTable({
    label: 'public.cm_social_accounts',
    client: publicDb,
    table: 'cm_social_accounts',
    columns: [
      { plain: 'access_token', cipher: 'access_token_ciphertext' },
      { plain: 'page_access_token', cipher: 'page_access_token_ciphertext' },
    ],
  })

  await reencryptTable({
    label: 'public.cm_whatsapp_accounts',
    client: publicDb,
    table: 'cm_whatsapp_accounts',
    columns: [{ plain: 'access_token', cipher: 'access_token_ciphertext' }],
  })

  await reencryptTable({
    label: 'smarttalk.channels',
    client: smarttalkDb,
    table: 'channels',
    columns: [{ plain: 'access_token', cipher: 'access_token_ciphertext' }],
  })

  await reencryptTable({
    label: 'smarttalk.organizations',
    client: smarttalkDb,
    table: 'organizations',
    columns: [{ plain: 'access_token', cipher: 'access_token_ciphertext' }],
  })

  console.log('\nHecho.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
