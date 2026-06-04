import { chat, type AnyTextAdapter } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { Effect } from "effect";
import type { AppConfig } from "../config.js";
import type { LlmService } from "./types.js";

const SYSTEM_PROMPT = [
  "You are a helpful support agent for a small ecommerce store.",
  "Answer clearly and concisely.",
  "Use the store FAQ/policy context when it answers the question.",
  "If the policy context does not contain the answer, say you are not sure and suggest contacting support.",
  "Do not invent order status, tracking numbers, discounts, or account-specific information.",
].join(" ");

const TITLE_SYSTEM_PROMPT = [
  "Create a concise title for this support conversation.",
  "Return only the title.",
  "Use 50 characters or fewer.",
  "Do not include quotes or punctuation at the end.",
].join(" ");

function faqPrompt(faqs: { question: string; answer: string }[]) {
  return [
    "Store FAQ and policy context:",
    ...faqs.map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`),
  ].join("\n\n");
}

function createAdapter(config: AppConfig): AnyTextAdapter {
  if (config.LLM_PROVIDER === "openrouter") {
    return createOpenRouterText(
      config.LLM_MODEL as never,
      config.OPENROUTER_API_KEY ?? "",
      {
        appTitle: "Spur AI Live Chat",
        httpReferer: config.WEB_ORIGIN,
      },
    ) as unknown as AnyTextAdapter;
  }

  return createOpenaiChat(
    config.LLM_MODEL as never,
    config.OPENAI_API_KEY ?? "",
  ) as unknown as AnyTextAdapter;
}

export function createTanStackLlmService(config: AppConfig): LlmService {
  return {
    generateReply: ({ history, faqs, userMessage }) =>
      Effect.tryPromise({
        try: async () => {
          const abortController = new AbortController();
          const timeout = setTimeout(
            () => abortController.abort(),
            config.LLM_TIMEOUT_MS,
          );

          try {
            const result = await chat({
              adapter: createAdapter(config),
              systemPrompts: [SYSTEM_PROMPT, faqPrompt(faqs)],
              messages: [
                ...history.map((message) => ({
                  role:
                    message.sender === "user"
                      ? ("user" as const)
                      : ("assistant" as const),
                  content: message.text,
                })),
                { role: "user" as const, content: userMessage },
              ],
              stream: false,
              abortController,
              temperature: 0.2,
              maxTokens: 350,
            });

            if (typeof result === "string" && result.trim()) {
              return result.trim();
            }

            throw new Error("LLM returned an empty response.");
          } finally {
          clearTimeout(timeout);
        }
      },
      catch: (error) => error,
      }),

    generateConversationTitle: ({ messages }) =>
      Effect.tryPromise({
        try: async () => {
          const abortController = new AbortController();
          const timeout = setTimeout(
            () => abortController.abort(),
            config.LLM_TIMEOUT_MS,
          );

          try {
            const transcript = messages
              .map((message) => `${message.sender}: ${message.text}`)
              .join("\n");
            const result = await chat({
              adapter: createAdapter(config),
              systemPrompts: [TITLE_SYSTEM_PROMPT],
              messages: [{ role: "user" as const, content: transcript }],
              stream: false,
              abortController,
              temperature: 0.1,
              maxTokens: 24,
            });

            if (typeof result === "string" && result.trim()) {
              return result.trim();
            }

            throw new Error("LLM returned an empty title.");
          } finally {
            clearTimeout(timeout);
          }
        },
        catch: (error) => error,
      }),
  };
}
