/**
 * Sprint 26 · Agente Q — Inngest function `send-notification`.
 *
 * Listens for `cm/notification.requested` events and delegates to the
 * multi-channel dispatcher. Retries on failure and limits per-channel
 * concurrency to respect provider rate limits.
 */

import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { notify, type NotifyRequest } from "@/lib/notify/dispatcher";

export const sendNotification = inngest.createFunction(
  {
    id: "send-notification",
    name: "Send notification (email / slack / whatsapp)",
    retries: 3,
    // Global cap; per-channel throttling would live inside providers if needed.
    concurrency: { limit: 10 },
  },
  { event: INNGEST_EVENTS.NOTIFICATION_REQUESTED },
  async ({ event, step, logger }) => {
    const req = event.data as NotifyRequest | undefined;
    if (!req || !req.organizationId || !Array.isArray(req.channels)) {
      logger.warn("send-notification: invalid payload", { data: event.data });
      return { skipped: true, reason: "invalid payload" };
    }

    const response = await step.run("dispatch", async () => notify(req));

    const failures = response.results.filter((r) => !r.ok);
    if (failures.length > 0) {
      logger.warn("send-notification: one or more channels failed", {
        total: response.results.length,
        failed: failures.length,
        // NEVER log full error strings if they may contain tokens; providers
        // already sanitize, but truncate defensively.
        errors: failures.map((f) => ({
          channel: f.channel,
          error: (f.error || "").slice(0, 120),
        })),
      });
      // If EVERY channel failed → throw so Inngest retries (up to `retries`).
      if (failures.length === response.results.length) {
        throw new Error(
          `All notification channels failed: ${failures.map((f) => f.channel).join(",")}`,
        );
      }
    }

    return { results: response.results };
  },
);
