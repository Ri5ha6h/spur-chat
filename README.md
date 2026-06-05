# Spur AI Live Chat Agent

Mini AI support agent for a live chat widget. It uses a TanStack Start React frontend, a Hono + Effect backend, PostgreSQL with Drizzle, and TanStack AI adapters for OpenRouter or OpenAI.

## Stack

- Node.js 24, pnpm 11
- TanStack Start, React 19, Tailwind v4, shadcn-style local UI components
- Hono, Effect, Zod
- PostgreSQL, Drizzle ORM
- TanStack AI with OpenRouter and OpenAI adapters
- Vitest

## Local Setup

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Copy env values:

   ```sh
   cp .env.example .env
   ```

3. Start PostgreSQL and create a database named `spur_chat`.

4. Run migrations and seed FAQ knowledge:

   ```sh
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```

5. Set either `OPENROUTER_API_KEY` or `OPENAI_API_KEY` in `.env`, and set:

   ```sh
   LLM_PROVIDER=openrouter
   LLM_MODEL=google/gemini-3.1-flash-lite
   ```

   For OpenAI directly:

   ```sh
   LLM_PROVIDER=openai
   LLM_MODEL=gpt-5-mini
   ```

6. Run both apps:

   ```sh
   pnpm dev
   ```

   Web: `http://localhost:3000`

   API: `http://localhost:4000`

## Scripts

```sh
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm build
pnpm typecheck
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Architecture

The repo is a pnpm monorepo:

- `apps/web`: TanStack Start app with a single live chat surface. It keeps the current session in localStorage, fetches history on reload, handles validation/API errors, and disables input while a reply is pending.
- `apps/api`: Hono API server. Routes validate input with shared Zod schemas and run use cases through Effect. The backend enforces per-browser limits when the web client ID is present, persists the user message, calls the LLM service, persists the AI response, and returns a typed JSON payload.
- `packages/shared`: API schemas, DTO types, and error codes shared by web and API.
- `packages/db`: Drizzle schema, migration config, and FAQ seed script.

## LLM Notes

`LlmService` wraps TanStack AI. It supports:

- `LLM_PROVIDER=openrouter` through `@tanstack/ai-openrouter`.
- `LLM_PROVIDER=openai` through `@tanstack/ai-openai`.

The prompt includes:

- A concise ecommerce support-agent system instruction.
- Seeded FAQ/domain knowledge from the database.
- The latest 12 conversation messages.

The backend has no automatic retry to avoid surprise duplicate cost. If the provider fails or times out, the API returns a friendly fallback message and persists it as the AI response.

## Limits

The web app stores a browser-local client ID and sends it with chat requests so recent chats and history stay scoped to that browser instead of a shared IP address. If the header is absent, the API falls back to requester IP for lightweight dev-phase guardrails. By default it enforces 8 messages per minute and 15,000 estimated support-reply tokens per day per browser/IP. Set `TRUST_PROXY=true` only when the API is deployed behind a trusted proxy so `X-Forwarded-For` can be used safely.

## Deployment

Recommended deployment:

- Vercel for `apps/web`.
- Render for `apps/api`.
- Neon or Supabase for PostgreSQL.

Railway settings:

Use separate Railway services for the API and web app. Keep the Railway root
directory as the repository root so pnpm workspace links resolve correctly, then
set each service's config file path:

```sh
API Config File: /railway.api.json
Web Config File: /railway.web.json
```

Do not include `pnpm install` in a Railway build command. Railpack already runs
the install step before the configured build command; adding it again causes
extra work and worsens cache behavior. The checked-in Railway configs also set
watch patterns so web-only changes do not redeploy the API and API-only changes
do not redeploy the web app.

The web app builds in TanStack Start SPA mode and should be served from static
files. Set this variable on the Railway web service:

```sh
RAILPACK_SPA_OUTPUT_DIR=.output/public
```

For smaller Railway runtime images, set these service variables after verifying
the next deploy:

```sh
RAILPACK_PRUNE_DEPS=true
RAILPACK_NODE_PRUNE_CMD=pnpm prune --prod --ignore-scripts
```

This removes dev dependencies from the final image. If a deploy fails after
enabling pruning, remove those variables and use the checked-in build/start
commands only.

Render API settings:

```sh
Build Command: pnpm install --frozen-lockfile && pnpm db:migrate && pnpm db:seed && pnpm build
Start Command: pnpm --filter api start
```

Vercel web settings:

```sh
Root Directory: repo root
Build Command: pnpm --filter @spur/shared build && pnpm --filter web build
Environment: VITE_API_BASE_URL=https://your-render-api.example.com
```

Set `WEB_ORIGIN` on Render to the deployed Vercel URL.

## Tradeoffs

- Replies are non-streaming for v1. This keeps the contract simple and robust for a weekend take-home.
- FAQ retrieval is a deterministic DB seed, not vector search. That is enough for the assignment and easier to inspect.
- No auth is included. Session IDs are opaque UUIDs stored in localStorage with the active conversation name.

## If I Had More Time

- Add token usage logging and request IDs.
- Add streaming replies with TanStack AI SSE.
- Add a transcript/admin view for reviewing conversations.
- Add rate limiting per browser session or IP.
- Add CI with Postgres service containers.
