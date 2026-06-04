import { zValidator } from "@hono/zod-validator";
import { sendMessageRequestSchema } from "@spur/shared";
import { getConnInfo } from "@hono/node-server/conninfo";
import { cors } from "hono/cors";
import { Hono, type Context } from "hono";
import { Cause, Effect, Exit, Option } from "effect";
import type { AppConfig } from "../config.js";
import { apiError, toAppError } from "../errors.js";
import {
  getChatQuota,
  getRecentConversations,
  getHistory,
  sendMessage,
  type ChatServices,
} from "../services/chat-service.js";

type CreateAppInput = {
  config: Pick<
    AppConfig,
    | "DAILY_TOKEN_LIMIT"
    | "RATE_LIMIT_MESSAGES_PER_MINUTE"
    | "TRUST_PROXY"
    | "WEB_ORIGIN"
  >;
  services: ChatServices;
};

async function runJson<T>(
  program: Effect.Effect<T, unknown>,
  c: { json: Function },
) {
  const exit = await Effect.runPromiseExit(program);

  if (Exit.isSuccess(exit)) {
    return c.json(exit.value);
  }

  const failure = Cause.failureOption(exit.cause);
  const appError = toAppError(
    Option.isSome(failure) ? failure.value : undefined,
  );
  return c.json(apiError(appError.code, appError.message), appError.status);
}

function forwardedIp(value: string | undefined) {
  return value
    ?.split(",")
    .map((part) => part.trim())
    .find(Boolean);
}

function requestIp(c: Context, config: CreateAppInput["config"]) {
  if (config.TRUST_PROXY) {
    const ip =
      forwardedIp(c.req.header("x-forwarded-for")) ??
      c.req.header("x-real-ip");

    if (ip) return ip;
  }

  try {
  return getConnInfo(c).remote.address ?? "local-dev";
  } catch {
    return "local-dev";
  }
}

function chatRequestContext(c: Context, config: CreateAppInput["config"]) {
  return {
    ipAddress: requestIp(c, config),
    limits: {
      dailyTokenLimit: config.DAILY_TOKEN_LIMIT,
      messagesPerMinute: config.RATE_LIMIT_MESSAGES_PER_MINUTE,
    },
  };
}

export function createApp({ config, services }: CreateAppInput) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: [config.WEB_ORIGIN, "http://localhost:3000"],
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: false,
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.post(
    "/chat/message",
    zValidator("json", sendMessageRequestSchema, (result, c) => {
      if (!result.success) {
        const message =
          result.error.issues[0]?.message ?? "Please enter a valid message.";
        return c.json(apiError("validation_error", message), 400);
      }
    }),
    async (c) => {
      const input = c.req.valid("json");
      return runJson(
        sendMessage(services, input, chatRequestContext(c, config)),
        c,
      );
    },
  );

  app.get("/chat/quota", async (c) =>
    runJson(getChatQuota(services, chatRequestContext(c, config)), c),
  );

  app.get("/chat/recent", async (c) =>
    runJson(getRecentConversations(services, requestIp(c, config)), c),
  );

  app.get("/chat/history/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");

    if (!sessionId) {
      return c.json(apiError("bad_request", "Session ID is required."), 400);
    }

    return runJson(getHistory(services, sessionId), c);
  });

  app.notFound((c) =>
    c.json(apiError("not_found", "The requested route was not found."), 404),
  );

  app.onError((error, c) => {
    console.error(error);
    return c.json(
      apiError("internal_error", "Something went wrong. Please try again."),
      500,
    );
  });

  return app;
}
