import { relations } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const senderEnum = pgEnum("sender", ["user", "ai"]);

export const chatUsers = pgTable(
  "chat_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ipAddress: text("ip_address").notNull(),
    minuteWindowStartedAt: timestamp("minute_window_started_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    minuteMessageCount: integer("minute_message_count").notNull().default(0),
    dailyTokenWindowStartedAt: timestamp("daily_token_window_started_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    dailyEstimatedTokens: integer("daily_estimated_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("chat_users_ip_address_idx").on(table.ipAddress)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatUserId: uuid("chat_user_id")
      .notNull()
      .references(() => chatUsers.id, { onDelete: "cascade" }),
    conversationName: text("conversation_name").notNull(),
    conversationNameGeneratedAt: timestamp("conversation_name_generated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversations_user_name_idx").on(
      table.chatUserId,
      table.conversationName,
    ),
  ],
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  sender: senderEnum("sender").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const faqs = pgTable(
  "faqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("faqs_key_idx").on(table.key)],
);

export const chatUsersRelations = relations(chatUsers, ({ many }) => ({
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  chatUser: one(chatUsers, {
    fields: [conversations.chatUserId],
    references: [chatUsers.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export type ChatUserRow = typeof chatUsers.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type FaqRow = typeof faqs.$inferSelect;
