import type { ChatMessage, Sender } from "@spur/shared";
import type { Effect } from "effect";

export type FaqKnowledge = {
  question: string;
  answer: string;
};

export type ConversationRepository = {
  findConversation: (conversationId: string) => Effect.Effect<boolean, unknown>;
  createConversation: () => Effect.Effect<string, unknown>;
  touchConversation: (conversationId: string) => Effect.Effect<void, unknown>;
  addMessage: (
    conversationId: string,
    sender: Sender,
    text: string,
  ) => Effect.Effect<ChatMessage, unknown>;
  listMessages: (conversationId: string) => Effect.Effect<ChatMessage[], unknown>;
  listRecentMessages: (
    conversationId: string,
    limit: number,
  ) => Effect.Effect<ChatMessage[], unknown>;
};

export type FaqRepository = {
  listFaqs: () => Effect.Effect<FaqKnowledge[], unknown>;
};
