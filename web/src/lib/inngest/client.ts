import { Inngest } from "inngest";

/**
 * Inngest client singleton for the community-manager app.
 * Event ingestion + worker signing are configured via environment:
 *   - INNGEST_EVENT_KEY   (required in production)
 *   - INNGEST_SIGNING_KEY (required in production)
 * In local dev they are optional — the `inngest-cli dev` server bridges events.
 */
export const inngest = new Inngest({
  id: "community-manager",
});

/**
 * Canonical event names emitted by the app. Keep string-literal to avoid
 * drift between producer/consumer typos.
 */
export const INNGEST_EVENTS = {
  POST_SCHEDULE_REQUESTED: "cm/post.schedule.requested",
} as const;

export type InngestEventName =
  (typeof INNGEST_EVENTS)[keyof typeof INNGEST_EVENTS];
