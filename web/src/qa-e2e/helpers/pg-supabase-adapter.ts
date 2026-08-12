/**
 * Adaptador mínimo con la superficie de supabase-js que usa el worker de
 * recuperación, respaldado por `pg` contra PostgreSQL real.
 *
 * Existe para poder ejecutar el WORKER REAL (`recoverFailedWebhookEvents`)
 * contra una base de verdad. El doble en memoria no vale para eso: no tiene
 * constraints, ni transacciones, ni tipos.
 *
 * NO es un cliente Supabase completo: implementa exactamente los métodos que el
 * worker y sus dependencias invocan. Si el worker usa algo nuevo, esto falla
 * ruidosamente en vez de devolver un resultado silenciosamente incorrecto.
 */
import pg from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const q = (ident: Any): string => `"${String(ident).replace(/"/g, '""')}"`;

export function createPgSupabaseAdapter(connectionString: string, schema = "smarttalk") {
  const pool = new pg.Pool({ connectionString });

  function from(table: string): Any {
    const state: {
      op: "select" | "insert" | "update" | "delete";
      columns: string;
      payload: Any;
      filters: string[];
      orderBy: string | null;
      limit: number | null;
      returning: string | null;
    } = {
      op: "select",
      columns: "*",
      payload: null,
      filters: [],
      orderBy: null,
      limit: null,
      returning: null,
    };
    let paramIndex = 0;
    const values: Any[] = [];
    const bind = (value: Any) => {
      values.push(value);
      return `$${++paramIndex}`;
    };

    const builder = {
      select(columns?: string) {
        if (state.op === "select") state.columns = columns && columns !== "*" ? columns : "*";
        else state.returning = columns || "*";
        return builder;
      },
      insert(payload: Any) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Any) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(column: string, value: Any) {
        state.filters.push(`${q(column)} = ${bind(value)}`);
        return builder;
      },
      neq(column: string, value: Any) {
        state.filters.push(`${q(column)} <> ${bind(value)}`);
        return builder;
      },
      lt(column: string, value: Any) {
        state.filters.push(`${q(column)} < ${bind(value)}`);
        return builder;
      },
      lte(column: string, value: Any) {
        state.filters.push(`${q(column)} <= ${bind(value)}`);
        return builder;
      },
      gt(column: string, value: Any) {
        state.filters.push(`${q(column)} > ${bind(value)}`);
        return builder;
      },
      gte(column: string, value: Any) {
        state.filters.push(`${q(column)} >= ${bind(value)}`);
        return builder;
      },
      is(column: string, value: Any) {
        state.filters.push(value === null ? `${q(column)} IS NULL` : `${q(column)} IS ${value}`);
        return builder;
      },
      in(column: string, list: Any[]) {
        state.filters.push(`${q(column)} = ANY(${bind(list)})`);
        return builder;
      },
      /** Subconjunto de PostgREST: "col.op.valor,col2.op.valor" */
      or(expression: string) {
        const parts = expression.split(",").map((clause: string) => {
          const [column, op, ...rest] = clause.split(".");
          const raw = rest.join(".");
          if (op === "is") return raw === "null" ? `${q(column)} IS NULL` : `${q(column)} IS ${raw}`;
          const sqlOp = { eq: "=", lt: "<", lte: "<=", gt: ">", gte: ">=" }[op];
          if (!sqlOp) throw new Error(`adaptador: operador no soportado en or(): ${op}`);
          return `${q(column)} ${sqlOp} ${bind(raw)}`;
        });
        state.filters.push(`(${parts.join(" OR ")})`);
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        state.orderBy = `${q(column)} ${options?.ascending === false ? "DESC" : "ASC"}`;
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      maybeSingle: () => run("maybeSingle"),
      single: () => run("single"),
      then: (resolve: Any, reject: Any) => run("many").then(resolve, reject),
    };

    async function run(mode: "many" | "single" | "maybeSingle") {
      const where = state.filters.length ? ` WHERE ${state.filters.join(" AND ")}` : "";
      let sql;

      if (state.op === "insert") {
        const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
        const columns = Object.keys(rows[0] as Any);
        const tuples = rows
          .map((row: Any) => `(${columns.map((c) => bind(row[c])).join(", ")})`)
          .join(", ");
        sql = `INSERT INTO ${q(schema)}.${q(table)} (${columns.map(q).join(", ")}) VALUES ${tuples}`;
        if (state.returning) sql += ` RETURNING ${state.returning}`;
      } else if (state.op === "update") {
        const columns = Object.keys(state.payload);
        const sets = columns.map((c) => `${q(c)} = ${bind(state.payload[c])}`).join(", ");
        sql = `UPDATE ${q(schema)}.${q(table)} SET ${sets}${where}`;
        if (state.returning) sql += ` RETURNING ${state.returning}`;
      } else if (state.op === "delete") {
        sql = `DELETE FROM ${q(schema)}.${q(table)}${where}`;
        if (state.returning) sql += ` RETURNING ${state.returning}`;
      } else {
        sql = `SELECT ${state.columns} FROM ${q(schema)}.${q(table)}${where}`;
        if (state.orderBy) sql += ` ORDER BY ${state.orderBy}`;
        if (state.limit != null) sql += ` LIMIT ${Number(state.limit)}`;
      }

      try {
        const result = await pool.query(sql, values);
        const rows = result.rows || [];
        if (mode === "maybeSingle") return { data: rows[0] ?? null, error: null };
        if (mode === "single") {
          return rows[0]
            ? { data: rows[0], error: null }
            : { data: null, error: { code: "PGRST116", message: "no rows" } };
        }
        // update/insert/delete sin RETURNING devuelven data null, como supabase-js
        if (state.op !== "select" && !state.returning) return { data: null, error: null };
        return { data: rows, error: null };
      } catch (error) {
        const e = error as Any;
        return { data: null, error: { code: e.code, message: e.message } };
      }
    }

    return builder;
  }

  return {
    client: {
      from,
      rpc: async (name: string, args?: Record<string, Any>) => {
        const keys = Object.keys(args || {});
        const params = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
        try {
          const result = await pool.query(
            `SELECT ${q(schema)}.${q(name)}(${params}) AS result`,
            keys.map((k) => (args as Record<string, Any>)[k]),
          );
          return { data: result.rows[0]?.result ?? null, error: null };
        } catch (error) {
          const e = error as Any;
          return { data: null, error: { code: e.code, message: e.message } };
        }
      },
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    },
    end: () => pool.end(),
  };
}
