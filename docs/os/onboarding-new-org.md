# Onboarding a New Org to Community OS

This guide walks through every step needed to give a new organization access to the Community OS shell.

---

## Prerequisites

- You have Supabase service-role access (or access to the Supabase Studio UI).
- The user's email already has a CM account (`cm_users` row exists).
- You know the org's UUID (`cm_client_id` column in `cm_users`).

---

## Step 1 — Add the email to `os_cohorts`

### Option A: via the UI (preferred)

1. Log in to the platform as an admin.
2. Navigate to `/es/os/settings/cohorts`.
3. Click **Add email**, enter the user's email, select the org, and save.

### Option B: via SQL

```sql
-- Check if a cohort row exists for this org
SELECT * FROM os_cohorts WHERE org_id = '<org-uuid>';

-- If it exists, append the email
UPDATE os_cohorts
SET emails = array_append(emails, 'user@example.com')
WHERE org_id = '<org-uuid>';

-- If it does NOT exist, insert a new row
INSERT INTO os_cohorts (org_id, emails)
VALUES ('<org-uuid>', ARRAY['user@example.com']);
```

---

## Step 2 — Confirm `cm_users.cm_client_id` is set

The org UUID in the JWT claim is derived from this column. If it is NULL, the RLS policies will reject all queries.

```sql
SELECT id, email, cm_client_id
FROM cm_users
WHERE email = 'user@example.com';
```

If `cm_client_id` is NULL, set it:

```sql
UPDATE cm_users
SET cm_client_id = '<org-uuid>'
WHERE email = 'user@example.com';
```

---

## Step 3 — Verify RLS visibility

Use a JWT scoped to the org to confirm the user can see the org's data. With the Supabase CLI or Studio SQL editor (using **anon key** + simulated JWT):

```sql
-- Run as the anon role with the org's JWT claim set
SET LOCAL request.jwt.claims = '{"org_id": "<org-uuid>", "role": "authenticated"}';

SELECT * FROM os_agents WHERE org_id = '<org-uuid>';
```

A successful result (even empty) means RLS is passing. A permission denied error means `os_current_org()` is not returning the expected UUID — check the JWT claim mapping in middleware.

---

## Step 4 — Seed demo data (dev / staging only)

If this is a new org with no existing data, populate it with sample rows so the console does not appear empty:

```bash
# Replace <token> with a valid session token for a user in the org
curl -X POST https://<host>/api/os/dev/seed \
  -H "Authorization: Bearer <token>"
```

This endpoint is blocked in production (returns 404 unless `NODE_ENV=development`). It creates:
- 1 sample agent with a constitution
- 1 standing goal
- 1 skill definition
- 1 connector record
- 3 activity entries

---

## Step 5 — Verify the console renders

Ask the user to navigate to `/es/os` (or `/en/os` for English). They should see the OS dashboard shell with the sidebar and the agents list.

If the page redirects to `/es/dashboard`:
- Re-check Step 1: the email must match exactly (case-sensitive in array lookup).
- Re-check that the `community-os` flag `identify` function is deployed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Redirect to dashboard | Email not in `os_cohorts` | Step 1 |
| Empty agents/goals lists but no error | `cm_client_id` is NULL | Step 2 |
| 403 from API routes | JWT claim missing `org_id` | Check middleware / Supabase JWT secret |
| Seed returns 404 | Running in production | Use staging or local dev |
| Seed returns 401 | Invalid session token | Re-authenticate and retry |
