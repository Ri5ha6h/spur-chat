import { config } from "dotenv";
import { Effect } from "effect";
import { z } from "zod";

config({ path: new URL("../../../.env", import.meta.url) });

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    RATE_LIMIT_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(8),
    DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().default(15_000),
    LLM_PROVIDER: z.enum(["openrouter", "openai"]).default("openrouter"),
    LLM_MODEL: z.string().min(1).default("google/gemini-3.1-flash-lite"),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === "openrouter" && !env.OPENROUTER_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENROUTER_API_KEY"],
        message: "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter.",
      });
    }

    if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when LLM_PROVIDER=openai.",
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return Effect.sync(() => envSchema.parse(env));
}
