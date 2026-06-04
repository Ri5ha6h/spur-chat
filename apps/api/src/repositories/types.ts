import type { ChatMessage, Sender } from "@spur/shared";
import type { Effect } from "effect";

export type ChatUser = {
  id: string;
  ipAddress: string;
  minuteWindowStartedAt: Date;
  minuteMessageCount: number;
  dailyTokenWindowStartedAt: Date;
  dailyEstimatedTokens: number;
};

export type ConversationSummary = {
  sessionId: string;
  conversationName: string;
  updatedAt: string;
};

export type ConversationRecord = {
  sessionId: string;
  chatUserId: string;
  conversationName: string;
  conversationNameGeneratedAt: Date | null;
};

export type FaqKnowledge = {
  question: string;
  answer: string;
};

export type ChatUserRepository = {
  findOrCreateByIpAddress: (ipAddress: string) => Effect.Effect<ChatUser, unknown>;
  updateMessageWindow: (
    chatUserId: string,
    windowStartedAt: Date,
    messageCount: number,
  ) => Effect.Effect<void, unknown>;
  addEstimatedTokens: (
    chatUserId: string,
    windowStartedAt: Date,
    tokens: number,
  ) => Effect.Effect<void, unknown>;
};

export type ConversationRepository = {
  findConversation: (
    conversationId: string,
  ) => Effect.Effect<ConversationRecord | undefined, unknown>;
  createConversation: (
    chatUserId: string,
    conversationName: string,
  ) => Effect.Effect<ConversationRecord, unknown>;
  countConversationsForUser: (chatUserId: string) => Effect.Effect<number, unknown>;
  conversationNameExists: (
    chatUserId: string,
    conversationName: string,
  ) => Effect.Effect<boolean, unknown>;
  renameConversation: (
    conversationId: string,
    conversationName: string,
  ) => Effect.Effect<void, unknown>;
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
  countUserMessages: (conversationId: string) => Effect.Effect<number, unknown>;
  listRecentConversations: (
    chatUserId: string,
    limit: number,
  ) => Effect.Effect<ConversationSummary[], unknown>;
};

export type FaqRepository = {
  listFaqs: () => Effect.Effect<FaqKnowledge[], unknown>;
};
