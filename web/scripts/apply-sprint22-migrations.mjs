#!/usr/bin/env node
// Aplica SOLO las 3 migraciones de Sprint 22 (idempotentes) al Postgres self-hosted.
// Uso: node --env-file=.env.local scripts/apply-sprint22-migrations.mjs
// O bien: SMARTMEDIA_PG_URL="postgresql://..." node scripts/apply-sprint22-migrations.mjs

import { Client } from 'pg'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const CONNECTION_STRING = process.env.SMARTMEDIA_PG_URL
  || process.env.DATABASE_URL

if (!CONNECTION_STRING) {
  console.error('[apply-sprint22] Falta SMARTMEDIA_PG_URL o DATABASE_URL en env.')
  console.error('Nota: en 2026-08 el pooler supavisor (puerto 5442) requiere tenant específico.')
  console.error('Método verificado: SSH root@server + docker exec -i standby-smartmedia-db psql -U supabase_admin -d postgres < migration.sql')
  process.exit(1)
}

const SPRINT22_FILES = [
  '20260801190000_014_rls_audit.sql',
  '20260801191000_015_encrypt_tokens.sql',
  '20260801192000_016_cm_social_accounts.sql',
]

const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations')

async function main() {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  console.log('Conectado a', CONNECTION_STRING.replace(/:[^:@]+@/, ':***@'))

  let failed = false
  for (const file of SPRINT22_FILES) {
    const full = path.join(migrationsDir, file)
    let sql
    try {
      sql = await readFile(full, 'utf8')
    } catch (e) {
      console.error(`\n  MISSING file ${file}:`, e.message)
      failed = true
      continue
    }
    console.log(`\n>>> ${file} (${sql.length} chars)`)
    const start = Date.now()
    try {
      // envolver en transacción para atomicidad
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('COMMIT')
      console.log(`    ok en ${Date.now() - start}ms`)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(`    FALLO en ${file}:`, err.message)
      failed = true
      // continua con las demás — idempotencia debería permitir re-ejecución
    }
  }

  await client.end()
  if (failed) {
    console.error('\n[apply-sprint22] al menos una migración falló. Revisa arriba.')
    process.exit(1)
  } else {
    console.log('\nHecho. 3/3 migraciones aplicadas.')
  }
}

main().catch((err) => {
  console.error('\n[apply-sprint22] error fatal:', err.message)
  process.exit(1)
})
