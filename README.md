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

Prerequisites:

- Node.js 24 or newer
- pnpm 11 or newer
- PostgreSQL 14 or newer
- An OpenRouter API key or OpenAI API key

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Copy env values:

   ```sh
   cp .env.example .env
   ```

3. Start PostgreSQL and create a database named `spur_chat`. The default local URL in `.env.example` is:

   ```sh
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/spur_chat
   ```

4. Run migrations and seed FAQ knowledge:

   ```sh
   pnpm db:migrate
   pnpm db:seed
   ```

   `pnpm db:generate` is only needed after changing the Drizzle schema. The checked-in migrations are what reviewers should run locally.

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

7. Sanity check the app:

   - Open `http://localhost:3000`.
   - Send `What is your return policy?`.
   - Refresh the browser and confirm the conversation is restored.

## Environment Variables

| Variable | App | Required | Notes |
| --- | --- | --- | --- |
| `PORT` | API | No | Defaults to `4000`. |
| `DATABASE_URL` | API/DB | Yes | PostgreSQL connection string used by Drizzle migrations and the API. |
| `WEB_ORIGIN` | API | No | Allowed browser origin for CORS. Use the deployed web URL in production. |
| `TRUST_PROXY` | API | No | Set to `true` only behind a trusted proxy so rate-limit fallback IPs can use forwarding headers. |
| `RATE_LIMIT_MESSAGES_PER_MINUTE` | API | No | Defaults to `8`. |
| `DAILY_TOKEN_LIMIT` | API | No | Estimated per-browser/IP daily LLM token budget. Defaults to `15000`. |
| `LLM_PROVIDER` | API | Yes | `openrouter` or `openai`. |
| `LLM_MODEL` | API | Yes | Example: `google/gemini-3.1-flash-lite` for OpenRouter or `gpt-5-mini` for OpenAI. |
| `LLM_TIMEOUT_MS` | API | No | Abort timeout for LLM calls. Defaults to `15000`. |
| `OPENROUTER_API_KEY` | API | Provider-dependent | Required when `LLM_PROVIDER=openrouter`. |
| `OPENAI_API_KEY` | API | Provider-dependent | Required when `LLM_PROVIDER=openai`. |
| `VITE_API_BASE_URL` | Web | Yes | Browser-facing API base URL, for example `http://localhost:4000`. |

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

- `apps/web`: TanStack Start app with a single live chat surface. It keeps a browser client ID and active session in localStorage, fetches history on reload, lists recent conversations, handles validation/API errors, and disables input while a reply is pending.
- `apps/api`: Hono API server. Routes validate input with shared Zod schemas and run use cases through Effect. The backend enforces per-browser limits when the web client ID is present, persists the user message, calls the LLM service, persists the AI response, and returns a typed JSON payload.
- `packages/shared`: API schemas, DTO types, and error codes shared by web and API.
- `packages/db`: Drizzle schema, checked-in migrations, migration runner, and FAQ seed script.

The backend is split into route, service, LLM, and repository layers:

- `apps/api/src/http/app.ts` owns HTTP routing, CORS, request validation, requester identity, and JSON error mapping.
- `apps/api/src/services/chat-service.ts` owns the chat use cases: conversation creation, history lookup, quota checks, persistence order, LLM fallback, and title generation.
- `apps/api/src/llm/*` keeps provider-specific TanStack AI adapter setup behind the `LlmService` interface.
- `apps/api/src/repositories/*` hides Drizzle queries behind repository interfaces so the service layer does not depend on SQL details.

The schema models browser/IP-scoped chat users, conversations, messages, and FAQ knowledge. Conversations belong to one chat user, messages belong to one conversation, and FAQs are independent seeded support knowledge.

More channels can plug in at the API boundary by creating or resolving the same `requesterKey` from a channel identity instead of the browser header. More AI tools can plug in behind `LlmService`, and richer retrieval can replace `FaqRepository` without changing the web contract.

## Design Decisions

- User and AI messages are persisted as separate rows so refresh, recent-chat selection, and future admin transcript views all use the same source of truth.
- The browser sends `X-Spur-Client-Id` so local testing and NAT/shared networks do not collapse everyone into the same IP-based conversation history.
- Rate limiting and daily estimated token budgets are server-side guardrails. The frontend displays remaining quota, but the API remains authoritative.
- LLM failures still produce and persist a support-safe fallback response. If the seeded FAQ clearly matches the message, that FAQ answer is used as the fallback.
- Conversation titles start as `Chat 1`, `Chat 2`, etc. After three user messages, the LLM generates a short title and the service de-duplicates it per user.

## LLM Notes

`LlmService` wraps TanStack AI. It supports:

- `LLM_PROVIDER=openrouter` through `@tanstack/ai-openrouter`.
- `LLM_PROVIDER=openai` through `@tanstack/ai-openai`.

The prompt includes:

- A concise ecommerce support-agent system instruction: answer clearly, use FAQ/policy context, admit uncertainty when context is missing, and do not invent order-specific facts.
- Seeded FAQ/domain knowledge from the database.
- The latest 12 conversation messages.
- The current user message.

The backend has no automatic retry to avoid surprise duplicate cost. If the provider fails or times out, the API returns a friendly fallback message and persists it as the AI response.

The title prompt is separate and asks for a plain title of 50 characters or fewer.

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
- Token accounting is estimated from text length instead of provider usage metadata so it works across OpenRouter and OpenAI with one simple quota path.

## If I Had More Time

- Add token usage logging and request IDs.
- Add streaming replies with TanStack AI SSE.
- Add a transcript/admin view for reviewing conversations.
- Add authenticated customer identity and handoff to a human support inbox.
- Add CI with Postgres service containers.
