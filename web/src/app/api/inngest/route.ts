import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { publishScheduledPost } from "@/lib/inngest/functions/publish-scheduled-post";
import { reapScheduledPosts } from "@/lib/inngest/functions/reap-scheduled-posts";

/**
 * Inngest webhook endpoint. Handles:
 *  - GET  → introspection (used by the local Inngest dev server + Inngest Cloud)
 *  - POST → function invocations
 *  - PUT  → function registration (called on deploys)
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [publishScheduledPost, reapScheduledPosts],
});
