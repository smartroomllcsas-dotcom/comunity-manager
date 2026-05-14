export type RespondIoChannelSource =
  | "whatsapp"
  | "whatsapp_business_api"
  | "facebook"
  | "messenger"
  | "instagram"
  | "telegram"
  | "line"
  | "viber"
  | "wechat"
  | "sms"
  | "email"
  | "webchat"
  | "custom";

export interface RespondIoConfig {
  apiToken: string;
  respondChannelId: string;
  respondChannelType: RespondIoChannelSource;
  workspaceId?: string;
  webhookSecret?: string;
  displayName?: string;
}

export interface RespondIoSendTextPayload {
  channelId?: string;
  message: { type: "text"; text: string };
}

export interface RespondIoSendAttachmentPayload {
  channelId?: string;
  message: {
    type: "attachment";
    attachment: {
      type: "image" | "video" | "audio" | "file";
      url: string;
      description?: string;
    };
  };
}

export interface RespondIoSendResponse {
  messageId?: string;
  contactId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface RespondIoWebhookEvent {
  event_type: "message.created" | "message.updated" | "contact.created" | "contact.updated" | string;
  contact?: {
    id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    profilePic?: string;
    custom_fields?: Record<string, unknown>;
  };
  message?: {
    messageId: string;
    channelId?: string;
    channelMessageId?: string;
    contactId: string;
    traffic?: "incoming" | "outgoing";
    message: {
      type: "text" | "attachment" | string;
      text?: string;
      attachment?: {
        type: string;
        url?: string;
        description?: string;
      };
    };
    timestamp?: number;
  };
  [key: string]: unknown;
}
