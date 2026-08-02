import { NextRequest } from "next/server";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";

/**
 * Vercel Cron entrypoint for the scheduled-post reaper.
 *
 * Runs every 5 min (see `vercel.json`). We keep the sweep logic *here* (in
 * addition to the Inngest-native cron in `reap-scheduled-posts.ts`) so the
 * safety net works even if the Inngest worker registration lags behind a
 * deploy. Both entrypoints are idempotent — the `inngest_event_id IS NULL`
 * guard prevents duplicate emissions.
 */
function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "reap-scheduled cron: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getPublicAdmin();
    const horizon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("cm_scheduled_posts")
      .select("id, scheduled_date")
      .eq("status", "scheduled")
      .is("inngest_event_id", null)
      .lte("scheduled_date", horizon)
      .limit(500);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const posts = data ?? [];
    let emitted = 0;
    for (const post of posts as Array<{ id: string; scheduled_date: string }>) {
      const { ids } = await inngest.send({
        name: INNGEST_EVENTS.POST_SCHEDULE_REQUESTED,
        data: {
          post_id: post.id,
          scheduled_at: post.scheduled_date,
        },
      });
      const eventId = ids?.[0] ?? null;
      await supabase
        .from("cm_scheduled_posts")
        .update({ inngest_event_id: eventId })
        .eq("id", post.id)
        .is("inngest_event_id", null);
      emitted += 1;
    }

    return Response.json({
      success: true,
      swept: posts.length,
      emitted,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "reaper failed" },
      { status: 500 },
    );
  }
}
