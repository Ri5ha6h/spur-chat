import { createDb, createPool } from "@spur/db";
import { Effect } from "effect";
import { loadConfig } from "./config.js";
import { createTanStackLlmService } from "./llm/tanstack.js";
import {
  createConversationRepository,
  createFaqRepository,
} from "./repositories/drizzle.js";

export async function createRuntime() {
  const config = await Effect.runPromise(loadConfig());

  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);

  return {
    config,
    pool,
    services: {
      conversations: createConversationRepository(db),
      faqs: createFaqRepository(db),
      llm: createTanStackLlmService(config),
    },
  };
}
