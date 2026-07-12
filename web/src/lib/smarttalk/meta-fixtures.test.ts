// Ejercita el parser con fixtures de payloads Meta reales.
// Si Meta cambia el shape entre versiones, alguno de estos casos rompe.

import { describe, expect, it } from "vitest";
import {
  extractContactId,
  getMessageDirection,
  parseMetaMessage,
  pickChannelCandidates,
  type MetaMessagePayload,
  type MetaMessagingEvent,
} from "./meta-parser";
import {
  instagramImageAttachment,
  instagramSticker,
  instagramTextMessage,
  messengerEchoMessage,
  messengerPostback,
  messengerTextMessage,
  sampleTestPayload,
  whatsappStyleChanges,
} from "./__fixtures__/meta-payloads";

describe("Messenger fixtures", () => {
  it("inbound text: sender es el contacto y direction inbound", () => {
    const entry = messengerTextMessage.entry![0];
    const event = entry.messaging![0];
    expect(extractContactId(event)).toBe("USER_PSID_1");
    expect(getMessageDirection(event, event.message)).toBe("inbound");
    const parsed = parseMetaMessage(event.message as MetaMessagePayload);
    expect(parsed.type).toBe("text");
    expect(parsed.content).toEqual({ type: "text", text: "Hola, quiero información" });
  });

  it("echo: recipient es el contacto y direction outbound", () => {
    const entry = messengerEchoMessage.entry![0];
    const event = entry.messaging![0];
    expect(extractContactId(event)).toBe("USER_PSID_1"); // recipient, no sender
    expect(getMessageDirection(event, event.message)).toBe("outbound");
    const parsed = parseMetaMessage(event.message as MetaMessagePayload);
    expect(parsed.type).toBe("text");
  });

  it("postback: cae a document con url del mid (el caller wrappea mid+postback)", () => {
    const entry = messengerPostback.entry![0];
    const event = entry.messaging![0];
    expect(extractContactId(event)).toBe("USER_PSID_2");
    // El caller (persistMessengerLikeWebhook) simula el message:
    const wrapped: MetaMessagePayload = {
      mid: "mid_wrapped_1",
      from: event.sender?.id,
      postback: event.postback,
    };
    const parsed = parseMetaMessage(wrapped);
    expect(parsed.type).toBe("document"); // sin text/attachment/quick_reply cae a document
    expect(parsed.content).toMatchObject({ type: "document", url: "mid_wrapped_1" });
  });

  it("candidatos de canal: entry.id se usa cuando no hay changes", () => {
    const entry = messengerTextMessage.entry![0];
    expect(pickChannelCandidates(entry)).toEqual(["PAGE_ID_ABC"]);
  });
});

describe("Instagram fixtures", () => {
  it("mensaje de texto", () => {
    const entry = instagramTextMessage.entry![0];
    const event = entry.messaging![0];
    expect(extractContactId(event)).toBe("IG_USER_ID_1");
    expect(getMessageDirection(event, event.message)).toBe("inbound");
    const parsed = parseMetaMessage(event.message as MetaMessagePayload);
    expect(parsed).toMatchObject({ type: "text", content: { text: "Hi! interested in the promo" } });
  });

  it("sticker attachment", () => {
    const entry = instagramSticker.entry![0];
    const event = entry.messaging![0];
    const parsed = parseMetaMessage(event.message as MetaMessagePayload);
    expect(parsed.type).toBe("sticker");
    expect(parsed.content).toEqual({
      type: "sticker",
      url: "https://scontent.cdninstagram.com/sticker.png",
    });
  });

  it("image attachment", () => {
    const entry = instagramImageAttachment.entry![0];
    const event = entry.messaging![0];
    const parsed = parseMetaMessage(event.message as MetaMessagePayload);
    expect(parsed.type).toBe("image");
    expect(parsed.content).toMatchObject({
      type: "image",
      url: "https://scontent.cdninstagram.com/photo.jpg",
    });
  });
});

describe("WhatsApp-style changes[] fixture", () => {
  it("candidatos incluyen phone_number_id de metadata", () => {
    const entry = whatsappStyleChanges.entry![0];
    const change = entry.changes![0];
    const value = change.value;
    expect(pickChannelCandidates(entry, value).sort()).toEqual(
      ["WABA_ID_1", "PHONE_NUM_ID_1"].sort()
    );
  });

  it("contact id se toma de wa_id si sender está ausente", () => {
    const entry = whatsappStyleChanges.entry![0];
    const change = entry.changes![0];
    const value = change.value!;
    const message = value.messages![0];
    // El caller construye un event sintético sender:{id:message.from} — probamos:
    const synthetic: MetaMessagingEvent = { sender: { id: message.from }, recipient: { id: entry.id }, message };
    expect(extractContactId(synthetic, value)).toBe("573001234567");
    const parsed = parseMetaMessage(message);
    expect(parsed).toMatchObject({ type: "text", content: { text: "Hola" } });
  });
});

describe("Sample test payload (Meta dashboard 'Send to Yourself')", () => {
  it("payload.sample está presente y no revienta ninguna función pura", () => {
    expect(sampleTestPayload.sample?.field).toBe("messages");
    // extractContactId sobre el sample.value sin caller wrap:
    expect(extractContactId(sampleTestPayload.sample!.value!)).toBe("TEST_SENDER");
  });
});
