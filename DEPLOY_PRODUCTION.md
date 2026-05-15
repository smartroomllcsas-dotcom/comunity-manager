# Deploy Production

Use Supabase in production. Do not deploy local MySQL or PostgREST settings in the final environment.

## 1) Environment variables

Create `web/.env.production` from `web/.env.production.example` and fill in:

```env
NEXT_PUBLIC_APP_URL=https://tu-dominio-final.com
NEXT_PUBLIC_DB_PROVIDER=supabase

NEXT_PUBLIC_META_APP_ID=...
NEXT_PUBLIC_META_CONFIG_ID=...
NEXT_PUBLIC_META_GRAPH_VERSION=v21.0
META_APP_ID=...
META_APP_SECRET=...
META_GRAPH_VERSION=v21.0
META_WEBHOOK_VERIFY_TOKEN=...

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_INSTAGRAM_LOGIN_URL=...
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...

ANTHROPIC_API_KEY=...
```

Optional aliases if you already use them:

```env
NEXT_PUBLIC_FACEBOOK_APP_ID=...
NEXT_PUBLIC_WHATSAPP_CONFIG_ID=...
```

Do not set these in production if you are using Supabase:

```env
MYSQL_HOST
MYSQL_PORT
MYSQL_USER
MYSQL_PASSWORD
MYSQL_DATABASE
NEXT_PUBLIC_POSTGREST_URL
NEXT_PUBLIC_POSTGREST_API_KEY
```

## 2) Meta developer settings

After you switch to the final domain, update Meta with the same public URLs:

- OAuth redirect URI:
  `https://tu-dominio-final.com/api/auth/meta/callback`
- Instagram redirect URI:
  `https://tu-dominio-final.com/`
- WhatsApp webhook URL:
  `https://tu-dominio-final.com/api/webhook/whatsapp`
- Verify token:
  must match `META_WEBHOOK_VERIFY_TOKEN`

If the domain changes, update `NEXT_PUBLIC_APP_URL` and the Meta app settings together.

## 3) Build and run

From the repo root:

```bash
cd web
npm install
npm run build
npm run start
```

If you deploy on a platform like Vercel, Render, Railway, or a custom Node host, set the same production variables there and point the app to the final public domain.

## 4) Verify after deploy

Check these flows:

1. Login works.
2. `Clients` loads.
3. `Conectar WhatsApp` opens Embedded Signup.
4. `Conectar Facebook + Instagram + Ads` redirects correctly.
5. `/api/webhook/whatsapp` responds to Meta verification.
6. WhatsApp messages and Meta connections persist in Supabase.

If login fails with a database permission error, run the Supabase SQL migrations in `web/supabase/`,
especially the public grants for `cm_users`. The app reads that table from the browser using the
public anon key, so missing table privileges will block sign-in even when the URL and anon key are correct.

## 5) Notes

- Production should use Supabase only.
- Local MySQL remains for local testing only.
- Keep the final domain stable; Meta callback URLs must match exactly.
