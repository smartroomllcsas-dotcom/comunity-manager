import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'comunity_manager',
  waitForConnections: true,
  connectionLimit: 10,
})

const allowedTables = new Set([
  'cm_users',
  'cm_clients',
  'cm_content_pillars',
  'cm_scheduled_posts',
  'cm_agents',
  'cm_activity_log',
  'cm_chat_history',
  'cm_oauth_states',
  'cm_social_accounts',
  'cm_whatsapp_accounts',
])

export function assertTable(table: string) {
  if (!allowedTables.has(table)) {
    throw new Error(`Tabla no permitida: ${table}`)
  }
}

export function quoteId(identifier: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error(`Identificador invalido: ${identifier}`)
  }
  return `\`${identifier}\``
}

export async function mysqlQuery<T = any>(sql: string, params: unknown[] = []) {
  const [rows] = await pool.execute(sql, params as any[])
  return rows as T
}
