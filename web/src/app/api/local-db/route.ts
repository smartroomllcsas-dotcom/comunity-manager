import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { assertTable, mysqlQuery, quoteId } from '@/lib/mysql'

type Filter = { column: string; value: unknown }
type Order = { column: string; ascending: boolean }

type LocalDbPayload = {
  table?: string
  action?: 'select' | 'insert' | 'update' | 'delete'
  select?: string
  filters?: Filter[]
  order?: Order[]
  limit?: number
  mode?: 'single' | 'maybeSingle'
  values?: Record<string, unknown> | Record<string, unknown>[]
}

function normalizeValue(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 19).replace('T', ' ')
    }
  }
  return value
}

function normalizeRow(row: Record<string, unknown>) {
  const normalized = { ...row }
  for (const key of ['platforms', 'scopes']) {
    if (typeof normalized[key] === 'string') {
      try {
        normalized[key] = JSON.parse(normalized[key] as string)
      } catch {
        normalized[key] = []
      }
    }
  }
  return normalized
}

function buildWhere(filters: Filter[] = []) {
  if (filters.length === 0) return { sql: '', params: [] as unknown[] }
  const clauses = filters.map((filter) => `${quoteId(filter.column)} = ?`)
  return {
    sql: ` WHERE ${clauses.join(' AND ')}`,
    params: filters.map((filter) => normalizeValue(filter.value)),
  }
}

function buildSelectColumns(select = '*') {
  if (select === '*') return '*'
  return select
    .split(',')
    .map((column) => quoteId(column.trim()))
    .join(', ')
}

export async function POST(request: NextRequest) {
  let body: LocalDbPayload = {}

  try {
    const raw = await request.text()
    if (raw.trim()) {
      body = JSON.parse(raw) as LocalDbPayload
    }
  } catch {
    return NextResponse.json({ data: null, error: { message: 'JSON invalido' } }, { status: 400 })
  }

  const table = body.table || ''
  const action = body.action || 'select'

  try {
    assertTable(table)
    const quotedTable = quoteId(table)

    if (action === 'select') {
      const where = buildWhere(body.filters)
      const orderSql = (body.order || [])
        .map((order) => `${quoteId(order.column)} ${order.ascending ? 'ASC' : 'DESC'}`)
        .join(', ')
      const limitSql = body.limit ? ` LIMIT ${Number(body.limit)}` : ''
      const sql = `SELECT ${buildSelectColumns(body.select)} FROM ${quotedTable}${where.sql}${
        orderSql ? ` ORDER BY ${orderSql}` : ''
      }${limitSql}`
      const rows = await mysqlQuery<Record<string, unknown>[]>(sql, where.params)
      const normalizedRows = rows.map(normalizeRow)
      if (body.mode === 'single') {
        return NextResponse.json({
          data: normalizedRows[0] ?? null,
          error: normalizedRows[0] ? null : { message: 'No rows found' },
        })
      }
      if (body.mode === 'maybeSingle') {
        return NextResponse.json({ data: normalizedRows[0] ?? null, error: null })
      }
      return NextResponse.json({ data: normalizedRows, error: null })
    }

    if (action === 'insert') {
      const values = Array.isArray(body.values) ? body.values : [body.values || {}]
      if (values.length === 0) return NextResponse.json({ data: null, error: null })

      const insertedRows: Record<string, unknown>[] = []
      for (const rawRow of values) {
        const row = { ...rawRow }
        if (!row.id && table !== 'cm_oauth_states') row.id = randomUUID()
        const columns = Object.keys(row)
        const params = columns.map((column) => normalizeValue(row[column]))
        const placeholders = columns.map(() => '?').join(', ')
        await mysqlQuery(
          `INSERT INTO ${quotedTable} (${columns.map(quoteId).join(', ')}) VALUES (${placeholders})`,
          params
        )
        insertedRows.push(normalizeRow(row))
      }

      const data = body.mode === 'single' ? insertedRows[0] : Array.isArray(body.values) ? insertedRows : insertedRows[0]
      return NextResponse.json({ data, error: null })
    }

    if (action === 'update') {
      const values = (body.values || {}) as Record<string, unknown>
      const columns = Object.keys(values)
      const where = buildWhere(body.filters)
      await mysqlQuery(
        `UPDATE ${quotedTable} SET ${columns.map((column) => `${quoteId(column)} = ?`).join(', ')}${where.sql}`,
        [...columns.map((column) => normalizeValue(values[column])), ...where.params]
      )
      return NextResponse.json({ data: values, error: null })
    }

    if (action === 'delete') {
      const where = buildWhere(body.filters)
      await mysqlQuery(`DELETE FROM ${quotedTable}${where.sql}`, where.params)
      return NextResponse.json({ data: null, error: null })
    }

    return NextResponse.json({ data: null, error: { message: 'Accion no soportada' } }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[local-db]', message)
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
