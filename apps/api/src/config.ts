import { config } from "dotenv";
import { Effect } from "effect";
import { z } from "zod";

config({ path: new URL("../../../.env", import.meta.url) });

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
    LLM_PROVIDER: z.enum(["openrouter", "openai"]).default("openrouter"),
    LLM_MODEL: z.string().min(1).default("openai/gpt-5-mini"),
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
