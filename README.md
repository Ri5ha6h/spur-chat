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
   LLM_MODEL=openai/gpt-5-mini
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
- `apps/api`: Hono API server. Routes validate input with shared Zod schemas and run use cases through Effect. The backend persists the user message, calls the LLM service, persists the AI response, and returns a typed JSON payload.
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

## Deployment

Recommended deployment:

- Vercel for `apps/web`.
- Render for `apps/api`.
- Neon or Supabase for PostgreSQL.

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
- No auth is included. Session IDs are opaque UUIDs stored in localStorage.

## If I Had More Time

- Add token usage logging and request IDs.
- Add streaming replies with TanStack AI SSE.
- Add a transcript/admin view for reviewing conversations.
- Add rate limiting per browser session or IP.
- Add CI with Postgres service containers.
