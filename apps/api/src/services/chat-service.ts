import type { ChatMessage, SendMessageRequest } from "@spur/shared";
import { Effect } from "effect";
import { AppError } from "../errors.js";
import type {
  ChatUser,
  ChatUserRepository,
  FaqKnowledge,
  ConversationRepository,
  FaqRepository,
} from "../repositories/types.js";
import type { LlmService } from "../llm/types.js";

const HISTORY_LIMIT = 12;
const RECENT_CONVERSATION_LIMIT = 3;
const TITLE_USER_MESSAGE_THRESHOLD = 3;
const TITLE_MAX_LENGTH = 50;
const MAX_REPLY_TOKENS = 350;
const FRIENDLY_LLM_FALLBACK =
  "I’m having trouble reaching the AI service right now. Please try again in a moment or contact support during business hours.";

export type ChatLimits = {
  dailyTokenLimit: number;
  messagesPerMinute: number;
};

export type ChatRequestContext = {
  ipAddress: string;
  limits: ChatLimits;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}

function estimateMessagesTokens(messages: ChatMessage[]) {
  return messages.reduce(
    (total, message) => total + estimateTokens(message.text),
    0,
  );
}

function estimateFaqTokens(faqs: FaqKnowledge[]) {
  return faqs.reduce(
    (total, faq) => total + estimateTokens(`${faq.question}\n${faq.answer}`),
    0,
  );
}

function hasElapsed(date: Date, durationMs: number) {
  return Date.now() - date.getTime() >= durationMs;
}

function currentDailyTokenState(chatUser: ChatUser) {
  if (hasElapsed(chatUser.dailyTokenWindowStartedAt, 24 * 60 * 60 * 1000)) {
    return { windowStartedAt: new Date(), usedTokens: 0 };
  }

  return {
    windowStartedAt: chatUser.dailyTokenWindowStartedAt,
    usedTokens: chatUser.dailyEstimatedTokens,
  };
}

function currentMessageWindowState(chatUser: ChatUser) {
  if (hasElapsed(chatUser.minuteWindowStartedAt, 60 * 1000)) {
    return { windowStartedAt: new Date(), messageCount: 0 };
  }

  return {
    windowStartedAt: chatUser.minuteWindowStartedAt,
    messageCount: chatUser.minuteMessageCount,
  };
}

function quotaStatus(chatUser: ChatUser, limits: ChatLimits) {
  const messageState = currentMessageWindowState(chatUser);
  const tokenState = currentDailyTokenState(chatUser);

  return {
    messagesRemaining: Math.max(
      limits.messagesPerMinute - messageState.messageCount,
      0,
    ),
    messagesPerMinute: limits.messagesPerMinute,
    dailyTokensRemaining: Math.max(
      limits.dailyTokenLimit - tokenState.usedTokens,
      0,
    ),
    dailyTokenLimit: limits.dailyTokenLimit,
  };
}

function retrySeconds(windowStartedAt: Date) {
  const seconds = Math.ceil((60 * 1000 - (Date.now() - windowStartedAt.getTime())) / 1000);
  return Math.max(seconds, 1);
}

function cleanTitle(value: string) {
  const cleaned = value
    .replace(/^["'`]+|["'`.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Support chat";

  return cleaned.length > TITLE_MAX_LENGTH
    ? cleaned.slice(0, TITLE_MAX_LENGTH).trim()
    : cleaned;
}

function withNameSuffix(baseName: string, suffix: number) {
  const suffixText = ` (${suffix})`;
  const availableLength = TITLE_MAX_LENGTH - suffixText.length;
  return `${baseName.slice(0, availableLength).trim()}${suffixText}`;
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
  chatUsers: ChatUserRepository;
  conversations: ConversationRepository;
  faqs: FaqRepository;
  llm: LlmService;
};

function ensureUniqueConversationName(
  services: ChatServices,
  chatUserId: string,
  baseName: string,
) {
  return Effect.gen(function* () {
    const cleanedBaseName = cleanTitle(baseName);
    let candidate = cleanedBaseName;
    let suffix = 2;

    while (yield* services.conversations.conversationNameExists(chatUserId, candidate)) {
      candidate = withNameSuffix(cleanedBaseName, suffix);
      suffix += 1;
    }

    return candidate;
  });
}

function createSequentialConversationName(
  services: ChatServices,
  chatUserId: string,
) {
  return Effect.gen(function* () {
    const count = yield* services.conversations.countConversationsForUser(
      chatUserId,
    );
    return yield* ensureUniqueConversationName(
      services,
      chatUserId,
      `Chat ${count + 1}`,
    );
  });
}

function maybeGenerateConversationTitle(
  services: ChatServices,
  conversationId: string,
) {
  return Effect.gen(function* () {
    const conversation = yield* services.conversations.findConversation(
      conversationId,
    );

    if (!conversation || conversation.conversationNameGeneratedAt) {
      return conversation?.conversationName;
    }

    const userMessageCount = yield* services.conversations.countUserMessages(
      conversationId,
    );

    if (userMessageCount < TITLE_USER_MESSAGE_THRESHOLD) {
      return conversation.conversationName;
    }

    const messages = yield* services.conversations.listMessages(conversationId);
    const title = yield* services.llm
      .generateConversationTitle({ messages })
      .pipe(Effect.catchAll(() => Effect.succeed(conversation.conversationName)));
    const uniqueTitle = yield* ensureUniqueConversationName(
      services,
      conversation.chatUserId,
      title,
    );

    yield* services.conversations.renameConversation(
      conversationId,
      uniqueTitle,
    );

    return uniqueTitle;
  });
}

function enforceMessageRate(
  services: ChatServices,
  chatUser: ChatUser,
  limits: ChatLimits,
) {
  return Effect.gen(function* () {
    const state = currentMessageWindowState(chatUser);

    if (state.messageCount >= limits.messagesPerMinute) {
      return yield* Effect.fail(
        new AppError(
          "rate_limited",
          `Message limit reached. Try again in ${retrySeconds(
            state.windowStartedAt,
          )} seconds.`,
          429,
        ),
      );
    }

    yield* services.chatUsers.updateMessageWindow(
      chatUser.id,
      state.windowStartedAt,
      state.messageCount + 1,
    );
  });
}

function enforceTokenBudget(
  chatUser: ChatUser,
  limits: ChatLimits,
  estimatedRequestTokens: number,
) {
  return Effect.gen(function* () {
    const state = currentDailyTokenState(chatUser);
    const reservedTokens = estimatedRequestTokens + MAX_REPLY_TOKENS;

    if (state.usedTokens + reservedTokens > limits.dailyTokenLimit) {
      return yield* Effect.fail(
        new AppError(
          "rate_limited",
          "Daily token limit reached. Try again tomorrow.",
          429,
        ),
      );
    }

    return state.windowStartedAt;
  });
}

export function sendMessage(
  services: ChatServices,
  input: SendMessageRequest,
  context: ChatRequestContext,
) {
  return Effect.gen(function* () {
    const chatUser = yield* services.chatUsers.findOrCreateByIpAddress(
      context.ipAddress,
    );
    yield* enforceMessageRate(services, chatUser, context.limits);

    const existingConversation = input.sessionId
      ? yield* services.conversations.findConversation(input.sessionId)
      : undefined;

    const conversation = existingConversation
      ? existingConversation
      : yield* services.conversations.createConversation(
          chatUser.id,
          yield* createSequentialConversationName(services, chatUser.id),
        );
    const sessionId = conversation.sessionId;
    const history = yield* services.conversations.listRecentMessages(
      sessionId,
      HISTORY_LIMIT,
    );
    const faqs = yield* services.faqs.listFaqs();
    const dailyWindowStartedAt = yield* enforceTokenBudget(
      chatUser,
      context.limits,
      estimateMessagesTokens(history) +
        estimateFaqTokens(faqs) +
        estimateTokens(input.message),
    );

    yield* services.conversations.addMessage(sessionId, "user", input.message);

    const historyWithCurrentMessage = yield* services.conversations.listRecentMessages(
      sessionId,
      HISTORY_LIMIT,
    );
    const priorHistory = historyWithCurrentMessage.slice(0, -1);

    const reply = yield* services.llm
      .generateReply({ history: priorHistory, faqs, userMessage: input.message })
      .pipe(
        Effect.catchAll(() =>
          Effect.succeed(
            answerFromFaq(input.message, faqs) ?? FRIENDLY_LLM_FALLBACK,
          ),
        ),
      );

    yield* services.conversations.addMessage(sessionId, "ai", reply);
    yield* services.conversations.touchConversation(sessionId);
    yield* services.chatUsers.addEstimatedTokens(
      chatUser.id,
      dailyWindowStartedAt,
      estimateMessagesTokens(priorHistory) +
        estimateFaqTokens(faqs) +
        estimateTokens(input.message) +
        estimateTokens(reply),
    );
    const conversationName = yield* maybeGenerateConversationTitle(
      services,
      sessionId,
    );

    return {
      reply,
      sessionId,
      conversationName: conversationName ?? conversation.conversationName,
    };
  });
}

export function getHistory(services: ChatServices, sessionId: string) {
  return Effect.gen(function* () {
    const conversation = yield* services.conversations.findConversation(sessionId);

    if (!conversation) {
      return yield* Effect.fail(
        new AppError(
          "not_found",
          "Conversation not found. Start a new chat to continue.",
          404,
        ),
      );
    }

    const messages = yield* services.conversations.listMessages(sessionId);
    return {
      sessionId,
      conversationName: conversation.conversationName,
      messages,
    };
  });
}

export function getRecentConversations(
  services: ChatServices,
  ipAddress: string,
) {
  return Effect.gen(function* () {
    const chatUser = yield* services.chatUsers.findOrCreateByIpAddress(ipAddress);
    const conversations = yield* services.conversations.listRecentConversations(
      chatUser.id,
      RECENT_CONVERSATION_LIMIT,
    );

    return { conversations };
  });
}

export function getChatQuota(services: ChatServices, context: ChatRequestContext) {
  return Effect.gen(function* () {
    const chatUser = yield* services.chatUsers.findOrCreateByIpAddress(
      context.ipAddress,
    );

    return quotaStatus(chatUser, context.limits);
  });
}
