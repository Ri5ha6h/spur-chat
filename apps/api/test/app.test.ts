import {
  CHAT_CLIENT_ID_HEADER,
  type ChatMessage,
  type Sender,
} from "@spur/shared";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app.js";
import type { ChatServices } from "../src/services/chat-service.js";

type MemoryConversation = {
  id: string;
  chatUserId: string;
  conversationName: string;
  conversationNameGeneratedAt: Date | null;
  updatedAt: Date;
  messages: ChatMessage[];
};

type MemoryChatUser = {
  id: string;
  ipAddress: string;
  minuteWindowStartedAt: Date;
  minuteMessageCount: number;
  dailyTokenWindowStartedAt: Date;
  dailyEstimatedTokens: number;
};

const TEST_CONFIG = {
  DAILY_TOKEN_LIMIT: 15_000,
  RATE_LIMIT_MESSAGES_PER_MINUTE: 8,
  TRUST_PROXY: false,
  WEB_ORIGIN: "http://localhost:3000",
};

function chatClientHeaders(clientId: string) {
  return {
    "Content-Type": "application/json",
    [CHAT_CLIENT_ID_HEADER]: clientId,
  };
}

function createMemoryServices(options?: {
  llmReply?: string;
  llmError?: boolean;
  title?: string;
}) {
  let idCounter = 0;
  let touchCounter = 0;
  let userCounter = 0;
  const conversations = new Map<string, MemoryConversation>();
  const chatUsers = new Map<string, MemoryChatUser>();
  const llmCalls: Array<unknown> = [];
  const titleCalls: Array<unknown> = [];

  function ensureUser(ipAddress: string) {
    const existing = [...chatUsers.values()].find(
      (user) => user.ipAddress === ipAddress,
    );

    if (existing) return existing;

    userCounter += 1;
    const user: MemoryChatUser = {
      id: `00000000-0000-4000-9000-${String(userCounter).padStart(12, "0")}`,
      ipAddress,
      minuteWindowStartedAt: new Date(Date.UTC(2026, 0, 1)),
      minuteMessageCount: 0,
      dailyTokenWindowStartedAt: new Date(Date.UTC(2026, 0, 1)),
      dailyEstimatedTokens: 0,
    };
    chatUsers.set(user.id, user);
    return user;
  }

  const services: ChatServices = {
    chatUsers: {
      findOrCreateByIpAddress: (ipAddress) =>
        Effect.sync(() => ensureUser(ipAddress)),
      updateMessageWindow: (chatUserId, windowStartedAt, messageCount) =>
        Effect.sync(() => {
          const user = chatUsers.get(chatUserId);
          if (!user) throw new Error("missing user");
          user.minuteWindowStartedAt = windowStartedAt;
          user.minuteMessageCount = messageCount;
        }),
      addEstimatedTokens: (chatUserId, windowStartedAt, tokens) =>
        Effect.sync(() => {
          const user = chatUsers.get(chatUserId);
          if (!user) throw new Error("missing user");
          user.dailyTokenWindowStartedAt = windowStartedAt;
          user.dailyEstimatedTokens += tokens;
        }),
    },
    conversations: {
      findConversation: (conversationId) =>
        Effect.sync(() => {
          const conversation = conversations.get(conversationId);
          return conversation
            ? {
                sessionId: conversation.id,
                chatUserId: conversation.chatUserId,
                conversationName: conversation.conversationName,
                conversationNameGeneratedAt:
                  conversation.conversationNameGeneratedAt,
              }
            : undefined;
        }),
      createConversation: (chatUserId, conversationName) =>
        Effect.sync(() => {
          idCounter += 1;
          const id = `00000000-0000-4000-8000-${String(idCounter).padStart(
            12,
            "0",
          )}`;
          const conversation = {
            id,
            chatUserId,
            conversationName,
            conversationNameGeneratedAt: null,
            updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, idCounter)),
            messages: [],
          };
          conversations.set(id, conversation);
          return {
            sessionId: conversation.id,
            chatUserId: conversation.chatUserId,
            conversationName: conversation.conversationName,
            conversationNameGeneratedAt: null,
          };
        }),
      countConversationsForUser: (chatUserId) =>
        Effect.sync(
          () =>
            [...conversations.values()].filter(
              (conversation) => conversation.chatUserId === chatUserId,
            ).length,
        ),
      conversationNameExists: (chatUserId, conversationName) =>
        Effect.sync(() =>
          [...conversations.values()].some(
            (conversation) =>
              conversation.chatUserId === chatUserId &&
              conversation.conversationName === conversationName,
          ),
        ),
      renameConversation: (conversationId, conversationName) =>
        Effect.sync(() => {
          const conversation = conversations.get(conversationId);
          if (!conversation) throw new Error("missing conversation");
          conversation.conversationName = conversationName;
          conversation.conversationNameGeneratedAt = new Date(
            Date.UTC(2026, 0, 1, 0, 1),
          );
        }),
      touchConversation: (conversationId) =>
        Effect.sync(() => {
          const conversation = conversations.get(conversationId);
          if (conversation) {
            touchCounter += 1;
            conversation.updatedAt = new Date(
              Date.UTC(2026, 0, 1, 0, 10, touchCounter),
            );
          }
        }),
      addMessage: (conversationId, sender: Sender, text) =>
        Effect.sync(() => {
          const conversation = conversations.get(conversationId);
          if (!conversation) {
            throw new Error("missing conversation");
          }

          const message: ChatMessage = {
            id: crypto.randomUUID(),
            sender,
            text,
            createdAt: new Date(
              Date.UTC(2026, 0, 1, 0, 0, conversation.messages.length),
            ).toISOString(),
          };
          conversation.messages.push(message);
          return message;
        }),
      listMessages: (conversationId) =>
        Effect.sync(() => conversations.get(conversationId)?.messages ?? []),
      listRecentMessages: (conversationId, limit) =>
        Effect.sync(() =>
          (conversations.get(conversationId)?.messages ?? []).slice(-limit),
        ),
      countUserMessages: (conversationId) =>
        Effect.sync(
          () =>
            conversations
              .get(conversationId)
              ?.messages.filter((message) => message.sender === "user").length ??
            0,
        ),
      listRecentConversations: (chatUserId, limit) =>
        Effect.sync(() =>
          [...conversations.values()]
            .filter((conversation) => conversation.chatUserId === chatUserId)
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
            .slice(0, limit)
            .map((conversation) => ({
              sessionId: conversation.id,
              conversationName: conversation.conversationName,
              updatedAt: conversation.updatedAt.toISOString(),
            })),
        ),
    },
    faqs: {
      listFaqs: () =>
        Effect.succeed([
          {
            question: "What is your return policy?",
            answer: "Returns are accepted for 30 days.",
          },
        ]),
    },
    llm: {
      generateReply: (input) => {
        llmCalls.push(input);
        if (options?.llmError) {
          return Effect.fail(new Error("llm down"));
        }
        return Effect.succeed(options?.llmReply ?? "Returns are accepted.");
      },
      generateConversationTitle: (input) => {
        titleCalls.push(input);
        return Effect.succeed(options?.title ?? "Return Policy");
      },
    },
  };

  return { services, chatUsers, conversations, llmCalls, titleCalls };
}

describe("API app", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects empty messages", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("rejects over-limit messages", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(2001) }),
    });

    expect(response.status).toBe(400);
  });

  it("creates a new conversation and persists user and AI messages", async () => {
    const memory = createMemoryServices({ llmReply: "Yes, we ship to the USA." });
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Do you ship to USA?" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reply).toBe("Yes, we ship to the USA.");
    expect(body.sessionId).toMatch(
      /^00000000-0000-4000-8000-\d{12}$/,
    );
    expect(body.conversationName).toBe("Chat 1");

    const persisted = memory.conversations.get(body.sessionId)?.messages;
    expect(persisted?.map((message) => message.sender)).toEqual(["user", "ai"]);
  });

  it("passes history and FAQ knowledge to the LLM service", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What is your return policy?" }),
    });

    expect(memory.llmCalls[0]).toMatchObject({
      userMessage: "What is your return policy?",
      faqs: [{ answer: "Returns are accepted for 30 days." }],
    });
  });

  it("uses FAQ fallback when the LLM fails on a matching question", async () => {
    const memory = createMemoryServices({ llmError: true });
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What is your return policy?" }),
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply).toBe("Returns are accepted for 30 days.");
    expect(
      memory.conversations
        .get(body.sessionId)
        ?.messages.some((message) => message.text === body.reply),
    ).toBe(true);
  });

  it("uses generic fallback when the LLM fails without a matching FAQ", async () => {
    const memory = createMemoryServices({ llmError: true });
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Can you check order 123?" }),
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reply).toContain("AI service");
  });

  it("fetches history in chronological order", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const send = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "first" }),
    });
    const { sessionId } = await send.json();

    const history = await app.request(`/chat/history/${sessionId}`);
    const body = await history.json();

    expect(history.status).toBe(200);
    expect(body.conversationName).toBe("Chat 1");
    expect(body.messages.map((message: ChatMessage) => message.text)).toEqual([
      "first",
      "Returns are accepted.",
    ]);
  });

  it("returns 404 for stale sessions", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const response = await app.request(
      "/chat/history/00000000-0000-4000-8000-000000000999",
    );

    expect(response.status).toBe(404);
  });

  it("returns recent conversations for the requester IP", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "first" }),
    });
    await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "second" }),
    });

    const response = await app.request("/chat/recent");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversations.map((conversation: { conversationName: string }) => conversation.conversationName)).toEqual([
      "Chat 2",
      "Chat 1",
    ]);
  });

  it("does not share recent conversations across browser client IDs", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    await app.request("/chat/message", {
      method: "POST",
      headers: chatClientHeaders("client-a"),
      body: JSON.stringify({ message: "from client a" }),
    });
    await app.request("/chat/message", {
      method: "POST",
      headers: chatClientHeaders("client-b"),
      body: JSON.stringify({ message: "from client b" }),
    });

    const response = await app.request("/chat/recent", {
      headers: { [CHAT_CLIENT_ID_HEADER]: "client-a" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.conversations.map(
        (conversation: { conversationName: string }) =>
          conversation.conversationName,
      ),
    ).toEqual(["Chat 1"]);
    expect(memory.chatUsers.size).toBe(2);
  });

  it("does not allow one browser client to read another client's history", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const send = await app.request("/chat/message", {
      method: "POST",
      headers: chatClientHeaders("client-a"),
      body: JSON.stringify({ message: "private message" }),
    });
    const { sessionId } = await send.json();

    const response = await app.request(`/chat/history/${sessionId}`, {
      headers: { [CHAT_CLIENT_ID_HEADER]: "client-b" },
    });

    expect(response.status).toBe(404);
  });

  it("does not allow one browser client to append to another client's session", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const send = await app.request("/chat/message", {
      method: "POST",
      headers: chatClientHeaders("client-a"),
      body: JSON.stringify({ message: "private message" }),
    });
    const { sessionId } = await send.json();

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: chatClientHeaders("client-b"),
      body: JSON.stringify({ sessionId, message: "hijack attempt" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns current quota for the requester IP", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "first" }),
    });

    const response = await app.request("/chat/quota");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      messagesPerMinute: 8,
      messagesRemaining: 7,
      dailyTokenLimit: 15_000,
    });
    expect(body.dailyTokensRemaining).toBeLessThan(15_000);
  });

  it("generates a unique title after the third user message", async () => {
    const memory = createMemoryServices({ title: "Shipping timeline" });
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    const first = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "When will my order ship?" }),
    });
    const { sessionId } = await first.json();

    await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: "Can it arrive faster?" }),
    });
    const third = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: "I need it this week." }),
    });
    const body = await third.json();

    expect(third.status).toBe(200);
    expect(body.conversationName).toBe("Shipping timeline");
    expect(memory.titleCalls).toHaveLength(1);
  });

  it("suffixes duplicate generated titles per IP", async () => {
    const memory = createMemoryServices({ title: "Shipping timeline" });
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    async function titledConversation() {
      const first = await app.request("/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "one" }),
      });
      const { sessionId } = await first.json();
      await app.request("/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: "two" }),
      });
      const third = await app.request("/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: "three" }),
      });
      return third.json();
    }

    const first = await titledConversation();
    const second = await titledConversation();

    expect(first.conversationName).toBe("Shipping timeline");
    expect(second.conversationName).toBe("Shipping timeline (2)");
  });

  it("rate limits the ninth message in a minute", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: TEST_CONFIG,
      services: memory.services,
    });

    for (let index = 0; index < 8; index += 1) {
      const response = await app.request("/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `message ${index}` }),
      });
      expect(response.status).toBe(200);
    }

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "message 9" }),
    });
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({ code: "rate_limited" });
  });

  it("rate limits when the estimated daily token budget is exhausted", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: { ...TEST_CONFIG, DAILY_TOKEN_LIMIT: 360 },
      services: memory.services,
    });

    const response = await app.request("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(80) }),
    });
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({ code: "rate_limited" });
  });
});
