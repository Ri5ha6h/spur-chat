import {
  historyResponseSchema,
  sendMessageResponseSchema,
  type ApiErrorResponse,
  type HistoryResponse,
  type SendMessageResponse,
} from "@spur/shared";
import { Effect } from "effect";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

async function parseJson<T>(response: Response, parse: (value: unknown) => T) {
  const json = (await response.json()) as unknown;

  if (!response.ok) {
    const apiError = json as ApiErrorResponse;
    throw new Error(
      apiError.error?.message ?? "The chat service returned an error.",
    );
  }

  return parse(json);
}

export function sendChatMessage(input: {
  message: string;
  sessionId?: string;
}): Effect.Effect<SendMessageResponse, Error> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${API_BASE_URL}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      return parseJson(response, (value) =>
        sendMessageResponseSchema.parse(value),
      );
    },
    catch: (error) =>
      error instanceof Error
        ? error
        : new Error("The chat service is unavailable."),
  });
}

export function fetchChatHistory(
  sessionId: string,
): Effect.Effect<HistoryResponse, Error> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${API_BASE_URL}/chat/history/${sessionId}`);
      return parseJson(response, (value) => historyResponseSchema.parse(value));
    },
    catch: (error) =>
      error instanceof Error
        ? error
        : new Error("Could not restore the conversation."),
  });
}
