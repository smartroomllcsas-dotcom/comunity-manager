import { describe, expect, it } from "vitest";
import { parseContactOverageMessage, type ContactOverageEvent } from "./contact-overage-release";

function event(
  source: ContactOverageEvent["source"],
  payload: Record<string, unknown>,
  messageType = "text",
): ContactOverageEvent {
  return {
    id: "overage-event",
    organization_id: "org",
    brand_id: "brand",
    channel_id: "channel",
    contact_id: "contact",
    source,
    provider_contact_id: "provider-contact",
    provider_message_id: "provider-message",
    event_key: "provider-message",
    message_type: messageType,
    contact_name: "Lead QA",
    payload,
    status: "processing",
    attempts: 1,
    last_error: null,
    created_at: "2026-08-05T00:00:00.000Z",
    claimed_by: "worker",
    claimed_at: "2026-08-05T00:00:00.000Z",
  };
}

describe("parseContactOverageMessage", () => {
  it("restores WhatsApp text payloads", () => {
    expect(parseContactOverageMessage(event("whatsapp", {
      type: "text",
      text: { body: "Hola desde WhatsApp" },
    }))).toEqual({
      type: "text",
      content: { type: "text", text: "Hola desde WhatsApp" },
    });
  });

  it("restores Instagram text payloads", () => {
    expect(parseContactOverageMessage(event("instagram", {
      id: "ig-message",
      message: "Hola desde Instagram",
    }))).toEqual({
      type: "text",
      content: { type: "text", text: "Hola desde Instagram" },
    });
  });

  it("restores Messenger attachments without exposing provider metadata", () => {
    expect(parseContactOverageMessage(event("messenger", {
      id: "fb-message",
      attachment: { type: "image", payload: { url: "https://example.test/image.jpg" } },
    }, "image"))).toEqual({
      type: "image",
      content: { type: "image", url: "https://example.test/image.jpg" },
    });
  });

  it("restores Instagram attachments from the data envelope", () => {
    expect(parseContactOverageMessage(event("instagram", {
      id: "ig-image",
      attachments: {
        data: [{ image_data: { url: "https://example.test/instagram.jpg" } }],
      },
    }, "image"))).toEqual({
      type: "image",
      content: { type: "image", url: "https://example.test/instagram.jpg" },
    });
  });

  it("keeps an unsupported provider payload replayable as text", () => {
    expect(parseContactOverageMessage(event("whatsapp", {
      type: "unsupported",
    }, "unsupported"))).toEqual({
      type: "text",
      content: { type: "text", text: "[Mensaje recuperado: unsupported]" },
    });
  });
});
