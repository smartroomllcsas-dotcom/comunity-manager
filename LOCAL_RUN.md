# Local Run

Use MySQL locally and Supabase in production.

## Local env

Set these in `web/.env.local`:

```env
NEXT_PUBLIC_DB_PROVIDER=mysql
NEXT_PUBLIC_APP_URL=http://localhost:3000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=comunity_manager
NEXT_PUBLIC_META_APP_ID=
NEXT_PUBLIC_META_CONFIG_ID=
NEXT_PUBLIC_META_GRAPH_VERSION=v21.0
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v21.0
META_WEBHOOK_VERIFY_TOKEN=
```

If you want to use Supabase locally or in production instead, set:

```env
NEXT_PUBLIC_DB_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Local test user

Apply these SQL files in MySQL:

```bash
mysql -u root < web/mysql/schema.sql
mysql -u root < web/mysql/local_test_user.sql
```

Credentials:

```text
email: test@comunitymanager.io
password: Test2026!
```

## Commands

From the repo root:

```bash
cd web
npm install
npm run dev
```

Optional validation:

```bash
cd web
npm run build
```

## Notes

- Production stays on Supabase unless you explicitly set `NEXT_PUBLIC_DB_PROVIDER=mysql`.
- The Meta OAuth and WhatsApp flows continue to use the same app variables in both environments.
