import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { publishScheduledPost } from "@/lib/inngest/functions/publish-scheduled-post";
import { reapScheduledPosts } from "@/lib/inngest/functions/reap-scheduled-posts";
import { fetchMetrics } from "@/lib/inngest/functions/fetch-metrics";
import { fetchMentions } from "@/lib/inngest/functions/fetch-mentions";
import { computeBrandHealth } from "@/lib/inngest/functions/compute-brand-health";

/**
 * Inngest webhook endpoint. Handles:
 *  - GET  → introspection (used by the local Inngest dev server + Inngest Cloud)
 *  - POST → function invocations
 *  - PUT  → function registration (called on deploys)
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    publishScheduledPost,
    reapScheduledPosts,
    fetchMetrics,
    fetchMentions,
    computeBrandHealth,
  ],
});
