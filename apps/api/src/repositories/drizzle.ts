import type { ChatMessage, Sender } from "@spur/shared";
import type { Db } from "@spur/db";
import { conversations, faqs, messages } from "@spur/db";
import { asc, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { ConversationRepository, FaqRepository } from "./types.js";

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
          return Boolean(conversation);
        },
        catch: (error) => error,
      }),

    createConversation: () =>
      Effect.tryPromise({
        try: async () => {
          const [conversation] = await db
            .insert(conversations)
            .values({})
            .returning({ id: conversations.id });
          if (!conversation) {
            throw new Error("Failed to create conversation.");
          }
          return conversation.id;
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
