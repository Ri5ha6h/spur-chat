import type { ChatMessage, Sender } from "@spur/shared";
import type { Db } from "@spur/db";
import { chatUsers, conversations, faqs, messages } from "@spur/db";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import type {
  ChatUserRepository,
  ConversationRecord,
  ConversationRepository,
  FaqRepository,
} from "./types.js";

function toChatMessage(row: {
  id: string;
  sender: Sender;
  text: string;
  createdAt: Date;
}): ChatMessage {
  return {
    id: row.id,
    sender: row.sender,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

function toConversationRecord(row: {
  id: string;
  chatUserId: string;
  conversationName: string;
  conversationNameGeneratedAt: Date | null;
}): ConversationRecord {
  return {
    sessionId: row.id,
    chatUserId: row.chatUserId,
    conversationName: row.conversationName,
    conversationNameGeneratedAt: row.conversationNameGeneratedAt,
  };
}

export function createChatUserRepository(db: Db): ChatUserRepository {
  return {
    findOrCreateByIpAddress: (ipAddress) =>
      Effect.tryPromise({
        try: async () => {
          const existing = await db.query.chatUsers.findFirst({
            where: eq(chatUsers.ipAddress, ipAddress),
          });

          if (existing) {
            return existing;
          }

          const [created] = await db
            .insert(chatUsers)
            .values({ ipAddress })
            .onConflictDoNothing({ target: chatUsers.ipAddress })
            .returning();

          if (created) {
            return created;
          }

          const raced = await db.query.chatUsers.findFirst({
            where: eq(chatUsers.ipAddress, ipAddress),
          });

          if (!raced) {
            throw new Error("Failed to create chat user.");
          }

          return raced;
        },
        catch: (error) => error,
      }),

    updateMessageWindow: (chatUserId, windowStartedAt, messageCount) =>
      Effect.tryPromise({
        try: async () => {
          await db
            .update(chatUsers)
            .set({
              minuteWindowStartedAt: windowStartedAt,
              minuteMessageCount: messageCount,
              updatedAt: new Date(),
            })
            .where(eq(chatUsers.id, chatUserId));
        },
        catch: (error) => error,
      }),

    addEstimatedTokens: (chatUserId, windowStartedAt, tokens) =>
      Effect.tryPromise({
        try: async () => {
          const current = await db.query.chatUsers.findFirst({
            where: eq(chatUsers.id, chatUserId),
          });

          if (!current) {
            throw new Error("Chat user not found.");
          }

          const now = new Date();
          const sameWindow =
            current.dailyTokenWindowStartedAt.getTime() ===
            windowStartedAt.getTime();

          await db
            .update(chatUsers)
            .set({
              dailyTokenWindowStartedAt: sameWindow ? windowStartedAt : now,
              dailyEstimatedTokens: sameWindow
                ? current.dailyEstimatedTokens + tokens
                : tokens,
              updatedAt: now,
            })
            .where(eq(chatUsers.id, chatUserId));
        },
        catch: (error) => error,
      }),
  };
}

export function createConversationRepository(
  db: Db,
): ConversationRepository {
  return {
    findConversation: (conversationId) =>
      Effect.tryPromise({
        try: async () => {
          const conversation = await db.query.conversations.findFirst({
            where: eq(conversations.id, conversationId),
          });
          return conversation ? toConversationRecord(conversation) : undefined;
        },
        catch: (error) => error,
      }),

    createConversation: (chatUserId, conversationName) =>
      Effect.tryPromise({
        try: async () => {
          const [conversation] = await db
            .insert(conversations)
            .values({ chatUserId, conversationName })
            .returning();
          if (!conversation) {
            throw new Error("Failed to create conversation.");
          }
          return toConversationRecord(conversation);
        },
        catch: (error) => error,
      }),

    countConversationsForUser: (chatUserId) =>
      Effect.tryPromise({
        try: async () => {
          const [row] = await db
            .select({ value: count() })
            .from(conversations)
            .where(eq(conversations.chatUserId, chatUserId));
          return row?.value ?? 0;
        },
        catch: (error) => error,
      }),

    conversationNameExists: (chatUserId, conversationName) =>
      Effect.tryPromise({
        try: async () => {
          const conversation = await db.query.conversations.findFirst({
            where: and(
              eq(conversations.chatUserId, chatUserId),
              eq(conversations.conversationName, conversationName),
            ),
          });
          return Boolean(conversation);
        },
        catch: (error) => error,
      }),

    renameConversation: (conversationId, conversationName) =>
      Effect.tryPromise({
        try: async () => {
          await db
            .update(conversations)
            .set({
              conversationName,
              conversationNameGeneratedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversationId));
        },
        catch: (error) => error,
      }),

    touchConversation: (conversationId) =>
      Effect.tryPromise({
        try: async () => {
          await db
            .update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, conversationId));
        },
        catch: (error) => error,
      }),

    addMessage: (conversationId, sender, text) =>
      Effect.tryPromise({
        try: async () => {
          const [message] = await db
            .insert(messages)
            .values({ conversationId, sender, text })
            .returning();

          if (!message) {
            throw new Error("Failed to persist message.");
          }

          return toChatMessage(message);
        },
        catch: (error) => error,
      }),

    listMessages: (conversationId) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await db.query.messages.findMany({
            where: eq(messages.conversationId, conversationId),
            orderBy: asc(messages.createdAt),
          });
          return rows.map(toChatMessage);
        },
        catch: (error) => error,
      }),

    listRecentMessages: (conversationId, limit) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await db.query.messages.findMany({
            where: eq(messages.conversationId, conversationId),
            orderBy: desc(messages.createdAt),
            limit,
          });

          return rows.reverse().map(toChatMessage);
        },
        catch: (error) => error,
      }),

    countUserMessages: (conversationId) =>
      Effect.tryPromise({
        try: async () => {
          const [row] = await db
            .select({ value: count() })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                eq(messages.sender, "user"),
              ),
            );
          return row?.value ?? 0;
        },
        catch: (error) => error,
      }),

    listRecentConversations: (chatUserId, limit) =>
      Effect.tryPromise({
        try: async () => {
          const rows = await db.query.conversations.findMany({
            where: eq(conversations.chatUserId, chatUserId),
            orderBy: desc(conversations.updatedAt),
            limit,
          });

          return rows.map((conversation) => ({
            sessionId: conversation.id,
            conversationName: conversation.conversationName,
            updatedAt: conversation.updatedAt.toISOString(),
          }));
        },
        catch: (error) => error,
      }),
  };
}

export function createFaqRepository(db: Db): FaqRepository {
  return {
    listFaqs: () =>
      Effect.tryPromise({
        try: async () => {
          const rows = await db.query.faqs.findMany({
            orderBy: asc(faqs.sortOrder),
          });

          return rows.map((faq) => ({
            question: faq.question,
            answer: faq.answer,
          }));
        },
        catch: (error) => error,
      }),
  };
}
