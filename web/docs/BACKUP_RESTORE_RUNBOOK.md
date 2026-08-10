# Runbook de backup y restauración — base de billing

Procedimiento para respaldar y restaurar el esquema `smarttalk`, y para
verificar que un backup **sirve de verdad**. Complementa `docs/RUNBOOK.md §5`,
que describe el backup automático del servidor; esto añade el ensayo que faltaba
(H-06).

> **Un backup no verificado no es un backup.** El apartado §4 es el que cierra
> el pendiente: sin ejecutarlo, sólo hay un archivo del que nadie sabe si
> restaura.

---

## 1. Antes de empezar

| Requisito | Nota |
|---|---|
| `pg_dump` / `pg_restore` de la **misma versión mayor** que el servidor | Un `pg_dump` 16 no lee un servidor 17 |
| Espacio libre ≥ 3× el tamaño del dump | El restore descomprime e indexa |
| `TOKEN_ENCRYPTION_KEY` a salvo | **No está en el dump.** Sin ella, los tokens cifrados de `channels` y `cm_social_accounts` son irrecuperables aunque la base se restaure entera (`RUNBOOK.md:83`) |

---

## 2. Backup

```bash
PGHOST=<host> PGPORT=<puerto> PGUSER=<usuario> \
pg_dump -d <base> -Fc -f billing_$(date +%Y-%m-%d_%H%M).dump
```

`-Fc` (formato custom) es lo que permite restaurar selectivamente una tabla con
`pg_restore -t`, cosa que un `.sql` plano no ofrece.

**Registra siempre estos cinco datos** junto al archivo — sin ellos el backup no
es auditable:

| Dato | Ejemplo |
|---|---|
| Fecha y hora (UTC) | 2026-08-10T22:40Z |
| Base y host de origen | `qatest` @ 127.0.0.1:55432 |
| Tamaño del archivo | 383 KB |
| Duración | 1 s |
| Responsable | quien lo ejecutó |

---

## 3. Restauración

**Nunca sobre la base de origen.** Se restaura en una base nueva y, si hace
falta, se promueve después.

```bash
createdb -h <host> -p <puerto> -U <usuario> <base_restaurada>
pg_restore -h <host> -p <puerto> -U <usuario> -d <base_restaurada> <archivo>.dump
```

Restauración **parcial** de una sola tabla:

```bash
pg_restore -h <host> -p <puerto> -U <usuario> -d <base> \
  -t subscriptions --data-only <archivo>.dump
```

> **Aviso de `RUNBOOK.md:124`:** un restore completo **borra el estado posterior
> al backup** (mensajes, conversaciones, pagos). Si sólo se perdió una tabla,
> usa el restore parcial.

---

## 4. Verificación — el paso que no se puede saltar

Compara origen y restaurada. Los seis números deben coincidir:

```sql
-- Ejecutar en AMBAS bases y comparar
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='smarttalk') AS tablas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='smarttalk')                                                  AS funciones,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='smarttalk' AND c.relrowsecurity)                             AS con_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='smarttalk')                 AS policies;
```

Y comprueba que el **contenido** viajó, no sólo el esquema:

```sql
SELECT count(*) FROM smarttalk.subscriptions;
SELECT count(*) FROM smarttalk.payments;
```

Verificación funcional mínima —que las funciones de dinero estén completas—:

```sql
SELECT pg_get_functiondef(p.oid) ~ 'plan_downgrade_scheduled' AS migracion_035
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='smarttalk' AND p.proname='finalize_epayco_approved_payment';
```

---

## 5. Ensayo ejecutado — 2026-08-10 ✅

Ensayo completo sobre la base desechable de §46.7 (PostgreSQL 16.14). **No se
tocó ninguna base real.**

| Paso | Resultado |
|---|---|
| Origen | `qatest`, 45 migraciones aplicadas + un plan testigo `qa-backup-testigo` |
| `pg_dump -Fc` | **383 KB en 1 s**, sin errores |
| `createdb qarestore` + `pg_restore` | **0 errores**, 1 s |

Comparación origen / restaurada:

| Métrica | Origen | Restaurada |
|---|---:|---:|
| Tablas en `smarttalk` | 52 | **52** |
| Funciones en `smarttalk` | 60 | **60** |
| Tablas con RLS | 51 | **51** |
| Policies | 68 | **68** |
| Plan testigo presente | 1 | **1** |
| Migración 035 en la función | sí | **sí** |

**Conclusión:** el procedimiento restaura esquema, funciones, RLS, policies y
datos de forma íntegra. El ensayo es reproducible con los comandos de arriba.

**Lo que este ensayo NO cubre:**

- Es un dump de **una base**, no del proyecto Supabase completo (falta el
  esquema `auth` real, Storage y la configuración del proyecto).
- No mide el tiempo sobre un volumen de producción: 383 KB no dice nada sobre
  cuánto tarda restaurar decenas de GB.
- No prueba la recuperación del `TOKEN_ENCRYPTION_KEY`, que vive fuera de la
  base y es la única pieza cuya pérdida es irreversible.

---

## 6. Pendiente para cerrar H-06 del todo

Repetir §2-§4 **contra un backup real de producción**, restaurándolo en una base
desechable, y anotar los cinco datos de §2 más los seis números de §4. Mientras
eso no exista, lo demostrado es que *el procedimiento funciona*, no que *el
backup de producción sea restaurable*.
