import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./http/app.js";
import { createRuntime } from "./runtime.js";

const runtime = await createRuntime();
const app = createApp({
  config: runtime.config,
  services: runtime.services,
});

serve(
  {
    fetch: app.fetch,
    port: runtime.config.PORT,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);

process.on("SIGTERM", async () => {
  await runtime.pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await runtime.pool.end();
  process.exit(0);
});
