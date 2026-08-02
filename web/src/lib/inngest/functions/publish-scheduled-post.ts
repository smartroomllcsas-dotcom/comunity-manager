import { createClient } from "@supabase/supabase-js";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";

/**
 * Server-only Supabase admin client that targets the `public` schema, where
 * `cm_scheduled_posts` and `cm_social_accounts` live (see migration
 * 20260509_meta_flow.sql and 008_fix_cm_social_accounts_tokens.sql).
 *
 * We avoid `@/lib/supabase/admin` here because that helper defaults to the
 * `smarttalk` schema; Inngest functions may run outside a request context
 * (no cookies) so we build a dedicated service-role client.
 */
function getPublicAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "publish-scheduled-post: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
}

type ScheduleRequestedPayload = {
  post_id: string;
  scheduled_at: string;
};

/**
 * STUB — publishes a scheduled post.
 *
 * Real Meta Graph API integration lands in the next sprint; for now this
 * function only:
 *   1. Waits until `event.data.scheduled_at`.
 *   2. Loads the post + its social account.
 *   3. Logs a payload preview and flips `status` to `published` / `failed`.
 *
 * Concurrency is keyed by `post_id` so an accidental duplicate event never
 * fires two publishes for the same post.
 */
export const publishScheduledPost = inngest.createFunction(
  {
    id: "publish-scheduled-post",
    name: "Publish scheduled post (stub)",
    retries: 3,
    concurrency: {
      limit: 5,
      key: "event.data.post_id",
    },
  },
  { event: INNGEST_EVENTS.POST_SCHEDULE_REQUESTED },
  async ({ event, step, logger }) => {
    const { post_id, scheduled_at } = event.data as ScheduleRequestedPayload;

    if (!post_id || !scheduled_at) {
      throw new Error(
        `publish-scheduled-post: invalid payload (post_id=${post_id}, scheduled_at=${scheduled_at})`,
      );
    }

    await step.sleepUntil("wait-until-scheduled", new Date(scheduled_at));

    const post = await step.run("load-post", async () => {
      const supabase = getPublicAdmin();
      const { data, error } = await supabase
        .from("cm_scheduled_posts")
        .select("*")
        .eq("id", post_id)
        .single();
      if (error) throw new Error(`load-post failed: ${error.message}`);
      if (!data) throw new Error(`load-post: post ${post_id} not found`);
      return data;
    });

    // Best-effort lookup; account may be missing during early rollout.
    const socialAccount = await step.run("load-social-account", async () => {
      const supabase = getPublicAdmin();
      const clientId = (post as { client_id?: string }).client_id ?? null;
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("cm_social_accounts")
        .select("*")
        .eq("client_id", clientId)
        .limit(1)
        .maybeSingle();
      if (error) {
        logger.warn(`load-social-account soft-fail: ${error.message}`);
        return null;
      }
      return data;
    });

    const result = await step.run("publish", async () => {
      const supabase = getPublicAdmin();

      // TODO(sprint-23): call Meta Graph API using
      //   `@/lib/meta` + `access_token_encrypted` decryption (agente 3).
      logger.info("publish-scheduled-post STUB", {
        post_id,
        scheduled_at,
        has_social_account: !!socialAccount,
      });

      const { error } = await supabase
        .from("cm_scheduled_posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", post_id);

      if (error) {
        const { error: failErr } = await supabase
          .from("cm_scheduled_posts")
          .update({
            status: "failed",
            last_error: error.message,
          })
          .eq("id", post_id);
        if (failErr) {
          logger.error(`failed to mark post failed: ${failErr.message}`);
        }
        throw new Error(`publish update failed: ${error.message}`);
      }

      return { post_id, status: "published" as const };
    });

    return result;
  },
);
