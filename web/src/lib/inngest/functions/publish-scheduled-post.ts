import { createClient } from "@supabase/supabase-js";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { decryptToken } from "@/lib/crypto";
import { publishToInstagram, publishToFacebook } from "@/lib/meta";
import { publishTikTokVideo, publishTikTokPhoto } from "@/lib/social/tiktok";
import { publishLinkedInPost } from "@/lib/social/linkedin";
import {
  createThreadsContainer,
  publishThreadsContainer,
} from "@/lib/social/threads";

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

type PublishOutcome = {
  ok: boolean;
  platform_post_id?: string;
  platform_post_url?: string;
  error?: string;
  retryable?: boolean;
};

/**
 * Sprint 24 — Publishes a scheduled post to the target social channel.
 *
 * Flow:
 *   1. Wait until `event.data.scheduled_at`.
 *   2. Load the post + its social account.
 *   3. Decrypt the access token and dispatch to the platform-specific
 *      publisher (facebook / instagram / tiktok / linkedin / threads).
 *   4. Persist status = 'published' + platform_post_id (+ url) on success.
 *      On failure, status = 'failed', last_error set, retry_count++.
 *
 * Idempotency: concurrency is keyed by `event.data.post_id` so duplicate
 * events never fire two publishes for the same post. We also short-circuit
 * if `status` is already 'published' at load time.
 */
export const publishScheduledPost = inngest.createFunction(
  {
    id: "publish-scheduled-post",
    name: "Publish scheduled post",
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

    // Idempotency guard — never re-publish an already-published post.
    if ((post as { status?: string }).status === "published") {
      logger.info(`publish-scheduled-post: post ${post_id} already published, skipping`);
      return { post_id, status: "already_published" as const };
    }

    const outcome = await step.run("publish", async (): Promise<PublishOutcome> => {
      if (!socialAccount) {
        return {
          ok: false,
          error: "no social account linked to this post",
          retryable: false,
        };
      }

      const acc = socialAccount as {
        platform: string;
        account_id: string;
        access_token_ciphertext?: string | null;
        access_token_encrypted?: string | null;
        access_token?: string | null;
        page_id?: string | null;
        page_access_token_ciphertext?: string | null;
        page_access_token?: string | null;
        ig_user_id?: string | null;
        instagram_id?: string | null;
      };

      // Resolve token. Prefer new ciphertext column, fall back to legacy plain.
      let token: string;
      try {
        const cipher = acc.access_token_ciphertext ?? acc.access_token_encrypted;
        if (cipher) {
          token = decryptToken(cipher);
        } else if (acc.access_token) {
          token = acc.access_token;
        } else {
          return { ok: false, error: "no access token on account", retryable: false };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `token decrypt failed: ${msg}`, retryable: false };
      }

      const p = post as {
        caption?: string | null;
        text?: string | null;
        image_url?: string | null;
        video_url?: string | null;
        media_urls?: string[] | null;
        hashtags?: string[] | null;
      };
      const caption = (p.caption ?? p.text ?? "").toString();

      try {
        switch (acc.platform) {
          case "facebook": {
            const pageId = acc.page_id ?? acc.account_id;
            let pageToken = token;
            const pageCipher = acc.page_access_token_ciphertext;
            if (pageCipher) {
              try {
                pageToken = decryptToken(pageCipher);
              } catch {
                pageToken = acc.page_access_token ?? token;
              }
            } else if (acc.page_access_token) {
              pageToken = acc.page_access_token;
            }
            const res = await publishToFacebook(pageId, pageToken, {
              message: caption,
              imageUrl: p.image_url ?? undefined,
            });
            const fbId: string = (res as { id?: string }).id ?? "";
            return {
              ok: true,
              platform_post_id: fbId,
              platform_post_url: fbId
                ? `https://www.facebook.com/${fbId}`
                : undefined,
            };
          }

          case "instagram": {
            const igUserId = acc.ig_user_id ?? acc.instagram_id ?? acc.account_id;
            let pageToken = token;
            const pageCipher = acc.page_access_token_ciphertext;
            if (pageCipher) {
              try {
                pageToken = decryptToken(pageCipher);
              } catch {
                pageToken = acc.page_access_token ?? token;
              }
            } else if (acc.page_access_token) {
              pageToken = acc.page_access_token;
            }
            const res = await publishToInstagram(igUserId, pageToken, {
              caption,
              imageUrl: p.image_url ?? undefined,
              videoUrl: p.video_url ?? undefined,
            });
            const igId: string = (res as { id?: string }).id ?? "";
            return { ok: true, platform_post_id: igId };
          }

          case "tiktok": {
            if (p.video_url) {
              const res = await publishTikTokVideo({
                accessToken: token,
                openId: acc.account_id,
                videoUrl: p.video_url,
                caption,
                hashtags: p.hashtags ?? [],
              });
              if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
              return { ok: true, platform_post_id: res.publish_id };
            }
            const imageUrls = p.media_urls ?? (p.image_url ? [p.image_url] : []);
            if (imageUrls.length === 0) {
              return {
                ok: false,
                error: "tiktok requires video_url or media_urls",
                retryable: false,
              };
            }
            const res = await publishTikTokPhoto({
              accessToken: token,
              openId: acc.account_id,
              imageUrls,
              caption,
            });
            if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
            return { ok: true, platform_post_id: res.publish_id };
          }

          case "linkedin": {
            const res = await publishLinkedInPost({
              accessToken: token,
              authorUrn: acc.account_id, // stored as urn:li:person:xxx or urn:li:organization:xxx
              text: caption,
              // media/article omitted for the minimal path; UI will pass them later.
            });
            if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
            return {
              ok: true,
              platform_post_id: res.post_urn,
              platform_post_url: res.post_url,
            };
          }

          case "threads": {
            const mediaType = p.video_url
              ? "VIDEO"
              : p.image_url
                ? "IMAGE"
                : "TEXT";
            const containerId = await createThreadsContainer({
              accessToken: token,
              userId: acc.account_id,
              mediaType,
              text: caption,
              imageUrl: p.image_url ?? undefined,
              videoUrl: p.video_url ?? undefined,
            });
            // Meta recommends waiting for VIDEO/CAROUSEL; TEXT is instant.
            if (mediaType !== "TEXT") {
              await new Promise((r) => setTimeout(r, 5_000));
            }
            const published = await publishThreadsContainer(
              token,
              acc.account_id,
              containerId,
            );
            return {
              ok: true,
              platform_post_id: published.id,
              platform_post_url: published.permalink,
            };
          }

          default:
            return {
              ok: false,
              error: `Unsupported platform: ${acc.platform}`,
              retryable: false,
            };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = /\b5\d\d\b|timeout|ENOTFOUND|ECONNRESET|429/i.test(msg);
        return { ok: false, error: msg, retryable };
      }
    });

    // Persist outcome. Kept as its own step so retries don't re-hit the API.
    const finalStatus = await step.run("finalize", async () => {
      const supabase = getPublicAdmin();
      if (outcome.ok) {
        const { error } = await supabase
          .from("cm_scheduled_posts")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            platform_post_id: outcome.platform_post_id ?? null,
            platform_post_url: outcome.platform_post_url ?? null,
            last_error: null,
          })
          .eq("id", post_id);
        if (error) {
          logger.error(`finalize (published) failed: ${error.message}`);
          throw new Error(`finalize update failed: ${error.message}`);
        }
        return { post_id, status: "published" as const };
      }

      // Failure path: bump retry_count, set last_error. If retryable, throw so
      // Inngest schedules another attempt (up to `retries: 3`).
      const { error } = await supabase
        .from("cm_scheduled_posts")
        .update({
          status: "failed",
          last_error: outcome.error ?? "unknown",
          retry_count: ((post as { retry_count?: number }).retry_count ?? 0) + 1,
        })
        .eq("id", post_id);
      if (error) {
        logger.error(`finalize (failed) update error: ${error.message}`);
      }
      if (outcome.retryable) {
        throw new Error(`publish failed (retryable): ${outcome.error}`);
      }
      return { post_id, status: "failed" as const, error: outcome.error };
    });

    return finalStatus;
  },
);
