import type { ChatMessage, Sender } from "@spur/shared";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app.js";
import type { ChatServices } from "../src/services/chat-service.js";

type MemoryConversation = {
  id: string;
  messages: ChatMessage[];
};

function createMemoryServices(options?: {
  llmReply?: string;
  llmError?: boolean;
}) {
  let idCounter = 0;
  const conversations = new Map<string, MemoryConversation>();
  const llmCalls: Array<unknown> = [];

  const services: ChatServices = {
    conversations: {
      findConversation: (conversationId) =>
        Effect.sync(() => conversations.has(conversationId)),
      createConversation: () =>
        Effect.sync(() => {
          idCounter += 1;
          const id = `00000000-0000-4000-8000-${String(idCounter).padStart(
            12,
            "0",
          )}`;
          conversations.set(id, { id, messages: [] });
          return id;
        }),
      touchConversation: () => Effect.void,
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
    },
  };

  return { services, conversations, llmCalls };
}

describe("API app", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects empty messages", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: { WEB_ORIGIN: "http://localhost:3000" },
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
      config: { WEB_ORIGIN: "http://localhost:3000" },
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
      config: { WEB_ORIGIN: "http://localhost:3000" },
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

    const persisted = memory.conversations.get(body.sessionId)?.messages;
    expect(persisted?.map((message) => message.sender)).toEqual(["user", "ai"]);
  });

  it("passes history and FAQ knowledge to the LLM service", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: { WEB_ORIGIN: "http://localhost:3000" },
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
      config: { WEB_ORIGIN: "http://localhost:3000" },
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
      config: { WEB_ORIGIN: "http://localhost:3000" },
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
      config: { WEB_ORIGIN: "http://localhost:3000" },
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
    expect(body.messages.map((message: ChatMessage) => message.text)).toEqual([
      "first",
      "Returns are accepted.",
    ]);
  });

  it("returns 404 for stale sessions", async () => {
    const memory = createMemoryServices();
    const app = createApp({
      config: { WEB_ORIGIN: "http://localhost:3000" },
      services: memory.services,
    });

    const response = await app.request(
      "/chat/history/00000000-0000-4000-8000-000000000999",
    );

    expect(response.status).toBe(404);
  });
});
