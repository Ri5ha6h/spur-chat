import type { ChatMessage } from "@spur/shared";
import type { Effect } from "effect";
import type { FaqKnowledge } from "../repositories/types.js";

export type GenerateReplyInput = {
  history: ChatMessage[];
  faqs: FaqKnowledge[];
  userMessage: string;
};

export type LlmService = {
  generateReply: (input: GenerateReplyInput) => Effect.Effect<string, unknown>;
};
