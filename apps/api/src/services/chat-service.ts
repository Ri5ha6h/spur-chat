import type { SendMessageRequest } from "@spur/shared";
import { Effect } from "effect";
import { AppError } from "../errors.js";
import type {
  FaqKnowledge,
  ConversationRepository,
  FaqRepository,
} from "../repositories/types.js";
import type { LlmService } from "../llm/types.js";

const HISTORY_LIMIT = 12;
const FRIENDLY_LLM_FALLBACK =
  "I’m having trouble reaching the AI service right now. Please try again in a moment or contact support during business hours.";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function answerFromFaq(userMessage: string, faqs: FaqKnowledge[]) {
  const normalizedMessage = normalizeText(userMessage);
  const messageTokens = new Set(
    normalizedMessage
      .split(" ")
      .filter((token) => token.length > 2 && token !== "your"),
  );

  let bestMatch: { answer: string; score: number } | undefined;

  for (const faq of faqs) {
    const normalizedQuestion = normalizeText(faq.question);
    const questionTokens = normalizedQuestion
      .split(" ")
      .filter((token) => token.length > 2 && token !== "your");
    const overlap = questionTokens.filter((token) =>
      messageTokens.has(token),
    ).length;
    const phraseBonus =
      normalizedMessage.includes(normalizedQuestion) ||
      normalizedQuestion.includes(normalizedMessage)
        ? 3
        : 0;
    const score = overlap + phraseBonus;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { answer: faq.answer, score };
    }
  }

  return bestMatch && bestMatch.score >= 2 ? bestMatch.answer : undefined;
}

export type ChatServices = {
  conversations: ConversationRepository;
  faqs: FaqRepository;
  llm: LlmService;
};

export function sendMessage(
  services: ChatServices,
  input: SendMessageRequest,
) {
  return Effect.gen(function* () {
    const existingConversation = input.sessionId
      ? yield* services.conversations.findConversation(input.sessionId)
      : false;

    const sessionId =
      existingConversation && input.sessionId
        ? input.sessionId
        : yield* services.conversations.createConversation();

    yield* services.conversations.addMessage(sessionId, "user", input.message);

    const historyWithCurrentMessage = yield* services.conversations.listRecentMessages(
      sessionId,
      HISTORY_LIMIT,
    );
    const faqs = yield* services.faqs.listFaqs();
    const history = historyWithCurrentMessage.slice(0, -1);

    const reply = yield* services.llm
      .generateReply({ history, faqs, userMessage: input.message })
      .pipe(
        Effect.catchAll(() =>
          Effect.succeed(
            answerFromFaq(input.message, faqs) ?? FRIENDLY_LLM_FALLBACK,
          ),
        ),
      );

    yield* services.conversations.addMessage(sessionId, "ai", reply);
    yield* services.conversations.touchConversation(sessionId);

    return { reply, sessionId };
  });
}

export function getHistory(services: ChatServices, sessionId: string) {
  return Effect.gen(function* () {
    const exists = yield* services.conversations.findConversation(sessionId);

    if (!exists) {
      return yield* Effect.fail(
        new AppError(
          "not_found",
          "Conversation not found. Start a new chat to continue.",
          404,
        ),
      );
    }

    const messages = yield* services.conversations.listMessages(sessionId);
    return { sessionId, messages };
  });
}
