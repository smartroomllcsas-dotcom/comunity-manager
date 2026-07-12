// Fixtures reales de payloads Meta (con IDs redactados).
// Sirven para validar el parser frente a cambios de shape entre versiones.

import type { MetaWebhookPayload } from "@/lib/smarttalk/meta-parser";

export const messengerTextMessage: MetaWebhookPayload = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID_ABC",
      time: 1720803301234,
      messaging: [
        {
          sender: { id: "USER_PSID_1" },
          recipient: { id: "PAGE_ID_ABC" },
          timestamp: 1720803301234,
          message: {
            mid: "m_msg_abc123",
            text: "Hola, quiero información",
          },
        },
      ],
    },
  ],
};

export const messengerEchoMessage: MetaWebhookPayload = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID_ABC",
      time: 1720803302000,
      messaging: [
        {
          sender: { id: "PAGE_ID_ABC" },
          recipient: { id: "USER_PSID_1" },
          timestamp: 1720803302000,
          message: {
            mid: "m_echo_xyz",
            text: "Claro, con gusto te ayudo",
            is_echo: true,
          },
        },
      ],
    },
  ],
};

export const messengerPostback: MetaWebhookPayload = {
  object: "page",
  entry: [
    {
      id: "PAGE_ID_ABC",
      time: 1720803303000,
      messaging: [
        {
          sender: { id: "USER_PSID_2" },
          recipient: { id: "PAGE_ID_ABC" },
          timestamp: 1720803303000,
          postback: {
            title: "Empezar",
            payload: "GET_STARTED",
          },
        },
      ],
    },
  ],
};

export const instagramTextMessage: MetaWebhookPayload = {
  object: "instagram",
  entry: [
    {
      id: "IG_ACCOUNT_ID_1",
      time: 1720803304000,
      messaging: [
        {
          sender: { id: "IG_USER_ID_1" },
          recipient: { id: "IG_ACCOUNT_ID_1" },
          timestamp: 1720803304000,
          message: {
            mid: "ig_msg_def456",
            text: "Hi! interested in the promo",
          },
        },
      ],
    },
  ],
};

export const instagramSticker: MetaWebhookPayload = {
  object: "instagram",
  entry: [
    {
      id: "IG_ACCOUNT_ID_1",
      time: 1720803305000,
      messaging: [
        {
          sender: { id: "IG_USER_ID_2" },
          recipient: { id: "IG_ACCOUNT_ID_1" },
          timestamp: 1720803305000,
          message: {
            mid: "ig_msg_sticker_789",
            attachments: [
              {
                type: "sticker",
                payload: { url: "https://scontent.cdninstagram.com/sticker.png" },
              },
            ],
          },
        },
      ],
    },
  ],
};

export const instagramImageAttachment: MetaWebhookPayload = {
  object: "instagram",
  entry: [
    {
      id: "IG_ACCOUNT_ID_1",
      time: 1720803306000,
      messaging: [
        {
          sender: { id: "IG_USER_ID_3" },
          recipient: { id: "IG_ACCOUNT_ID_1" },
          timestamp: 1720803306000,
          message: {
            mid: "ig_msg_img_101",
            attachments: [
              {
                type: "image",
                payload: { url: "https://scontent.cdninstagram.com/photo.jpg" },
              },
            ],
          },
        },
      ],
    },
  ],
};

export const whatsappStyleChanges: MetaWebhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID_1",
      time: 1720803307000,
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              phone_number_id: "PHONE_NUM_ID_1",
            },
            contacts: [
              { wa_id: "573001234567", profile: { name: "Ana Test" } },
            ],
            messages: [
              {
                id: "wamid.HBg...",
                from: "573001234567",
                text: { body: "Hola" },
              },
            ],
          },
        },
      ],
    },
  ],
};

export const sampleTestPayload: MetaWebhookPayload = {
  object: "page",
  sample: {
    field: "messages",
    value: {
      sender: { id: "TEST_SENDER" },
      recipient: { id: "TEST_RECIPIENT" },
      message: { mid: "test_mid", text: "sample" },
    },
  },
};
