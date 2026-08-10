// Supabase en memoria para las pruebas E2E de QA.
// ---------------------------------------------------------------------------
// Reproduce el subconjunto del query-builder de supabase-js que usan los
// módulos bajo prueba (checkBillingFeature, brand-scope, billing-lifecycle,
// public-plans): from().select()/insert()/update()/delete() con filtros
// encadenados (eq/neq/in/gte/lte/contains/overlaps), maybeSingle()/single(),
// conteos { count, head } y await directo del builder.
//
// NO toca red ni la base real: es un almacén de objetos en memoria. Se usa
// mockeando "@/lib/supabase/admin" y "@/lib/supabase/server" desde cada spec.

export type Rows = Record<string, unknown>[];
export interface Seed {
  tables?: Record<string, Rows>;
  currentUserId?: string;
  /**
   * Índices únicos a emular, por tabla: cada entrada es la tupla de columnas.
   * Un INSERT que los viole devuelve `{ code: "23505" }` igual que PostgREST,
   * que es la señal en la que se apoya la deduplicación de webhooks.
   */
  uniqueIndexes?: Record<string, string[][]>;
  /**
   * Implementaciones de RPC. Sin handler, `rpc()` sólo registra la llamada y
   * devuelve null (comportamiento histórico). Con handler se puede emular el
   * efecto de una función SQL sobre el store para probar los guardas de la ruta.
   */
  rpcHandlers?: Record<string, (args: unknown, store: Record<string, Rows>) => unknown>;
  /**
   * Errores inyectados por tabla y operación, para probar los caminos de fallo
   * de escritura que en producción provoca la base (permisos, deadlock, etc.).
   *
   * `skip` deja pasar las primeras N llamadas antes de empezar a fallar (útil
   * cuando la operación bajo prueba comparte tabla con un paso previo, como el
   * claim del lease). `times` limita cuántas veces falla; sin él, falla siempre.
   */
  errorOn?: Record<
    string,
    Partial<
      Record<
        "insert" | "update" | "delete" | "select",
        { code: string; message: string; times?: number; skip?: number }
      >
    >
  >;
}

type Filter = (row: Record<string, unknown>) => boolean;

export interface FakeSupabase {
  store: Record<string, Rows>;
  admin: (schema?: string) => FakeClient;
  // El cliente de servidor expone `from` además de `auth` porque algunas rutas
  // (p. ej. /api/admin/subscriptions) leen tablas con la sesión del usuario.
  server: {
    auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
    from: (table: string) => FakeQuery;
  };
  // Registro de llamadas a rpc() para poder aseverar el RPC de activación.
  rpcCalls: Array<{ name: string; args: unknown }>;
}

interface FakeClient {
  from: (table: string) => FakeQuery;
  rpc: (
    name: string,
    args?: unknown,
  ) => Promise<{ data: unknown; error: { code: string; message: string } | null }>;
  storage: { from: () => { remove: () => Promise<{ error: null }> } };
}

// Builder mínimo pero fiel. Cada método de filtro devuelve el mismo builder.
interface FakeQuery {
  select: (cols?: string, opts?: { count?: string; head?: boolean }) => FakeQuery;
  insert: (payload: unknown) => FakeQuery;
  update: (payload: Record<string, unknown>) => FakeQuery;
  delete: () => FakeQuery;
  eq: (c: string, v: unknown) => FakeQuery;
  is: (c: string, v: unknown) => FakeQuery;
  or: (expression: string) => FakeQuery;
  neq: (c: string, v: unknown) => FakeQuery;
  in: (c: string, v: unknown[]) => FakeQuery;
  gt: (c: string, v: unknown) => FakeQuery;
  gte: (c: string, v: unknown) => FakeQuery;
  lt: (c: string, v: unknown) => FakeQuery;
  lte: (c: string, v: unknown) => FakeQuery;
  contains: (c: string, v: unknown[]) => FakeQuery;
  overlaps: (c: string, v: unknown[]) => FakeQuery;
  order: () => FakeQuery;
  limit: (n: number) => FakeQuery;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
}

export function createFakeSupabase(seed: Seed = {}): FakeSupabase {
  const store: Record<string, Rows> = {};
  for (const [name, rows] of Object.entries(seed.tables || {})) {
    store[name] = rows.map((r) => ({ ...r }));
  }
  const currentUserId = seed.currentUserId ?? "user-default";
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  let idSeq = 0;

  function from(table: string): FakeQuery {
    if (!store[table]) store[table] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let opts: { count?: string; head?: boolean } = {};
    let payload: unknown = null;
    let limitN: number | null = null;
    const filters: Filter[] = [];

    const match = () => store[table].filter((row) => filters.every((f) => f(row)));

    async function terminate(mode: "await" | "maybeSingle" | "single") {
      const injected = seed.errorOn?.[table]?.[op];
      if (injected) {
        if (injected.skip !== undefined && injected.skip > 0) {
          injected.skip -= 1;
        } else if (injected.times === undefined || injected.times > 0) {
          if (injected.times !== undefined) injected.times -= 1;
          return { data: null, error: { code: injected.code, message: injected.message } };
        }
      }
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload];
        const indexes = seed.uniqueIndexes?.[table] || [];
        for (const candidate of list as Record<string, unknown>[]) {
          for (const columns of indexes) {
            const clash = store[table].some((row) =>
              columns.every((column) => row[column] === candidate[column]),
            );
            if (clash) {
              return {
                data: null,
                error: {
                  code: "23505",
                  message: `duplicate key value violates unique constraint on (${columns.join(", ")})`,
                },
              };
            }
          }
        }
        const inserted = list.map((r) => {
          const copy = { ...(r as Record<string, unknown>) };
          // Genera un id sintético cuando la fila no lo trae (INSERT ... RETURNING id).
          if (copy.id === undefined) copy.id = `${table}-${++idSeq}`;
          return copy;
        });
        store[table].push(...inserted);
        if (mode === "single" || mode === "maybeSingle") {
          return { data: inserted[0] ?? null, error: null };
        }
        return { data: inserted, error: null };
      }
      if (op === "update") {
        const matched = match();
        for (const row of matched) Object.assign(row, payload as Record<string, unknown>);
        return { data: matched, error: null, count: matched.length };
      }
      if (op === "delete") {
        const keep = store[table].filter((row) => !filters.every((f) => f(row)));
        const removed = store[table].length - keep.length;
        store[table] = keep;
        return { data: null, error: null, count: removed };
      }
      // select
      let rows = match();
      if (limitN != null) rows = rows.slice(0, limitN);
      if (opts.head) return { data: null, error: null, count: rows.length };
      if (mode === "maybeSingle") return { data: rows[0] ?? null, error: null };
      if (mode === "single") {
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "no rows", code: "PGRST116" } };
      }
      return { data: rows, error: null, count: rows.length };
    }

    const builder: FakeQuery = {
      select(_cols, o) {
        // `select()` encadenado sobre insert/update/delete es la forma de
        // supabase-js de pedir RETURNING; no convierte la operación en lectura.
        // Sólo registra las opciones (count/head) para el terminador.
        opts = o || {};
        return builder;
      },
      insert(p) { op = "insert"; payload = p; return builder; },
      update(p) { op = "update"; payload = p; return builder; },
      delete() { op = "delete"; return builder; },
      eq(c, v) { filters.push((r) => r[c] === v); return builder; },
      // PostgREST usa `is` para NULL/booleanos; `undefined` y `null` se tratan
      // igual porque una columna ausente en el fake equivale a NULL.
      is(c, v) {
        filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
        return builder;
      },
      // Subconjunto de la sintaxis de PostgREST: "col.op.valor,col2.op.valor".
      // Cubre is.null, eq, lt, lte, gt y gte, que es lo que usa el claim del
      // worker de recuperación.
      or(expression) {
        const clauses = expression.split(",").map((clause) => {
          const [column, op, ...rest] = clause.split(".");
          const raw = rest.join(".");
          return (row: Record<string, unknown>) => {
            const value = row[column];
            switch (op) {
              case "is":
                return raw === "null" ? value === null || value === undefined : String(value) === raw;
              case "eq":
                return String(value) === raw;
              case "lt":
                return value != null && String(value) < raw;
              case "lte":
                return value != null && String(value) <= raw;
              case "gt":
                return value != null && String(value) > raw;
              case "gte":
                return value != null && String(value) >= raw;
              default:
                return false;
            }
          };
        });
        filters.push((r) => clauses.some((clause) => clause(r)));
        return builder;
      },
      neq(c, v) { filters.push((r) => r[c] !== v); return builder; },
      in(c, v) { filters.push((r) => v.includes(r[c])); return builder; },
      gt(c, v) { filters.push((r) => (r[c] as number) > (v as number)); return builder; },
      gte(c, v) { filters.push((r) => (r[c] as number) >= (v as number)); return builder; },
      lt(c, v) { filters.push((r) => (r[c] as number) < (v as number)); return builder; },
      lte(c, v) { filters.push((r) => (r[c] as number) <= (v as number)); return builder; },
      contains(c, v) {
        filters.push((r) => Array.isArray(r[c]) && v.every((x) => (r[c] as unknown[]).includes(x)));
        return builder;
      },
      overlaps(c, v) {
        filters.push((r) => Array.isArray(r[c]) && v.some((x) => (r[c] as unknown[]).includes(x)));
        return builder;
      },
      order() { return builder; },
      limit(n) { limitN = n; return builder; },
      maybeSingle: () => terminate("maybeSingle"),
      single: () => terminate("single"),
      then: (res, rej) => Promise.resolve(terminate("await")).then(res, rej),
    };
    return builder;
  }

  const client: FakeClient = {
    from,
    rpc: async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      const handler = seed.rpcHandlers?.[name];
      if (!handler) return { data: null, error: null };
      try {
        return { data: handler(args, store) ?? null, error: null };
      } catch (error) {
        // supabase-js no lanza: los errores de una función SQL vuelven en
        // `error`. Un handler que lanza emula una EXCEPTION de plpgsql.
        const message = error instanceof Error ? error.message : String(error);
        return { data: null, error: { code: "P0001", message } };
      }
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };

  return {
    store,
    admin: () => client,
    server: {
      auth: { getUser: async () => ({ data: { user: { id: currentUserId } } }) },
      from,
    },
    rpcCalls,
  };
}
