import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .reduce((acc, line) => {
    const i = line.indexOf('=')
    if (i > 0) acc[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    return acc
  }, {})

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const email = 'dev@comunitymanager.io'
const password = 'Dev2026Admin!'
const name = 'Developer Admin'

const { data: existing } = await supabase
  .from('cm_users')
  .select('id')
  .eq('email', email)
  .maybeSingle()

let result
if (existing) {
  result = await supabase
    .from('cm_users')
    .update({ password_hash: password, role: 'admin', plan: 'pro', name, updated_at: new Date().toISOString() })
    .eq('email', email)
    .select()
    .single()
} else {
  result = await supabase
    .from('cm_users')
    .insert({ email, password_hash: password, name, role: 'admin', plan: 'pro' })
    .select()
    .single()
}

if (result.error) {
  console.error('ERROR:', result.error.message)
  process.exit(1)
}

console.log('OK ->', { id: result.data.id, email: result.data.email, role: result.data.role, plan: result.data.plan })
console.log('Login:', email, '/', password)
