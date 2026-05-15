import { createClient } from '@supabase/supabase-js'
import { PostgrestClient } from '@supabase/postgrest-js'
import { localQueryClient } from './local-query-client'

const dbProvider = (process.env.NEXT_PUBLIC_DB_PROVIDER || process.env.DB_PROVIDER || 'supabase').toLowerCase()
const isProduction = process.env.NODE_ENV === 'production'

// Production: Supabase client.
// Local: PostgREST client against a standalone REST endpoint.
const isPostgrest = !isProduction && dbProvider === 'postgrest'
const isMysql = !isProduction && dbProvider === 'mysql'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_POSTGREST_URL ||
  'https://placeholder.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_POSTGREST_API_KEY ||
  'placeholder-anon-key'

export const supabase: any = isPostgrest
  ? new PostgrestClient(supabaseUrl, {
      headers: supabaseAnonKey
        ? {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          }
        : undefined,
    })
    : isMysql
    ? localQueryClient
    : createClient(supabaseUrl, supabaseAnonKey)
