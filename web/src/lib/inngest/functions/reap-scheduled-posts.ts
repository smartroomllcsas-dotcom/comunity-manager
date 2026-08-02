import { createClient } from "@supabase/supabase-js";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";

/**
 * Safety-net cron: every 5 minutes, sweep `cm_scheduled_posts` for rows that
 * are due to publish within the next 10 minutes AND have no Inngest event
 * emitted yet (`inngest_event_id IS NULL`). For each row we emit
 * `cm/post.schedule.requested` and stamp the returned event id back on the
 * row so future ticks skip it.
 *
 * This covers two failure modes:
 *   1. A post is inserted directly in the DB without going through the API.
 *   2. The API-side `inngest.send(...)` failed (dropped event).
 *
 * Triggered by Vercel Cron hitting `/api/cron/reap-scheduled` which internally
 * sends the reaper tick event, OR by Inngest's own cron schedule below.
 */
function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "reap-scheduled-posts: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

export const reapScheduledPosts = inngest.createFunction(
  {
    id: "reap-scheduled-posts",
    name: "Reap scheduled posts (safety net)",
    retries: 2,
  },
  // Inngest-native cron so this runs even if Vercel Cron is misconfigured.
  { cron: "*/5 * * * *" },
  async ({ step, logger }) => {
    const posts = await step.run("query-pending", async () => {
      const supabase = getPublicAdmin();
      const horizon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("cm_scheduled_posts")
        .select("id, scheduled_date")
        .eq("status", "scheduled")
        .is("inngest_event_id", null)
        .lte("scheduled_date", horizon)
        .limit(500);
      if (error) throw new Error(`reaper query failed: ${error.message}`);
      return data ?? [];
    });

    if (posts.length === 0) {
      return { swept: 0 };
    }

    let emitted = 0;
    for (const post of posts as Array<{
      id: string;
      scheduled_date: string;
    }>) {
      await step.run(`emit-${post.id}`, async () => {
        const { ids } = await inngest.send({
          name: INNGEST_EVENTS.POST_SCHEDULE_REQUESTED,
          data: {
            post_id: post.id,
            scheduled_at: post.scheduled_date,
          },
        });
        const eventId = ids?.[0] ?? null;

        const supabase = getPublicAdmin();
        const { error: updErr } = await supabase
          .from("cm_scheduled_posts")
          .update({ inngest_event_id: eventId })
          .eq("id", post.id)
          .is("inngest_event_id", null); // guard against races
        if (updErr) {
          logger.warn(
            `reaper: emitted event ${eventId} for ${post.id} but failed to persist id: ${updErr.message}`,
          );
        }
        emitted += 1;
      });
    }

    return { swept: posts.length, emitted };
  },
);
