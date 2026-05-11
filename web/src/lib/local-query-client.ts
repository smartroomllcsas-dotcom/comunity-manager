type Filter = { column: string; value: unknown }
type Order = { column: string; ascending: boolean }

type LocalDbPayload = {
  table: string
  action: 'select' | 'insert' | 'update' | 'delete'
  select?: string
  filters?: Filter[]
  order?: Order[]
  limit?: number
  mode?: 'single' | 'maybeSingle'
  values?: Record<string, unknown> | Record<string, unknown>[]
}

class LocalQueryBuilder {
  private payload: LocalDbPayload

  constructor(table: string) {
    this.payload = { table, action: 'select', filters: [], order: [] }
  }

  select(columns = '*') {
    this.payload.select = columns
    return this
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.payload.action = 'insert'
    this.payload.values = values
    return this
  }

  update(values: Record<string, unknown>) {
    this.payload.action = 'update'
    this.payload.values = values
    return this
  }

  delete() {
    this.payload.action = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.payload.filters?.push({ column, value })
    return this
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.payload.order?.push({ column, ascending: options.ascending !== false })
    return this
  }

  limit(value: number) {
    this.payload.limit = value
    return this
  }

  single() {
    this.payload.mode = 'single'
    return this.execute()
  }

  maybeSingle() {
    this.payload.mode = 'maybeSingle'
    return this.execute()
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute() {
    const baseUrl =
      typeof window === 'undefined'
        ? process.env.INTERNAL_APP_URL || 'http://localhost:3000'
        : ''

    const res = await fetch(`${baseUrl}/api/local-db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.payload),
    })

    return res.json()
  }
}

export const localQueryClient = {
  from(table: string) {
    return new LocalQueryBuilder(table)
  },
}
