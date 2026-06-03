import { z } from "zod";

export const senderSchema = z.enum(["user", "ai"]);
export type Sender = z.infer<typeof senderSchema>;

export const chatMessageSchema = z.object({
  id: z.uuid(),
  sender: senderSchema,
  text: z.string(),
  createdAt: z.iso.datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sendMessageRequestSchema = z.object({
  message: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Message cannot be empty.")
        .max(2000, "Message must be 2000 characters or fewer."),
    ),
  sessionId: z.uuid().optional(),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const sendMessageResponseSchema = z.object({
  reply: z.string(),
  sessionId: z.uuid(),
});
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

export const historyResponseSchema = z.object({
  sessionId: z.uuid(),
  messages: z.array(chatMessageSchema),
});
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorCodeSchema = z.enum([
  "bad_request",
  "not_found",
  "validation_error",
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const MAX_MESSAGE_LENGTH = 2000;
export const CHAT_SESSION_STORAGE_KEY = "spur.chat.sessionId";
