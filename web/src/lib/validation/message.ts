import { z } from "zod";

const url = z.string().url().max(2048);

const textContent = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(4096),
});

const imageContent = z.object({
  type: z.literal("image"),
  url,
  caption: z.string().max(1024).optional(),
});

const videoContent = z.object({
  type: z.literal("video"),
  url,
  caption: z.string().max(1024).optional(),
});

const audioContent = z.object({
  type: z.literal("audio"),
  url,
});

const documentContent = z.object({
  type: z.literal("document"),
  url,
  filename: z.string().min(1).max(255),
  caption: z.string().max(1024).optional(),
});

const templateContent = z.object({
  type: z.literal("template"),
  template_name: z.string().min(1).max(120),
  language: z.string().min(2).max(16),
  components: z.array(z.unknown()).max(20).optional().default([]),
});

const interactiveContent = z.object({
  type: z.literal("interactive"),
  interactive_type: z.enum(["button", "list"]),
  body: z.string().min(1).max(4096),
  buttons: z.array(z.object({ id: z.string(), title: z.string() })).max(10).optional(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        rows: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional() })).max(10),
      })
    )
    .max(10)
    .optional(),
});

const locationContent = z.object({
  type: z.literal("location"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(255).optional(),
});

const stickerContent = z.object({
  type: z.literal("sticker"),
  url,
});

export const messageContentSchema = z.discriminatedUnion("type", [
  textContent,
  imageContent,
  videoContent,
  audioContent,
  documentContent,
  templateContent,
  interactiveContent,
  locationContent,
  stickerContent,
]);

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum([
    "text",
    "image",
    "video",
    "audio",
    "document",
    "template",
    "interactive",
    "location",
    "sticker",
  ]),
  content: messageContentSchema,
});

export type SendMessageBody = z.infer<typeof sendMessageSchema>;
