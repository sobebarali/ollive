# Ollive Project Guidance

These rules apply to every task in this project unless explicitly overridden. Bias: caution over
speed on non-trivial work.

## Project

Ollive is a lightweight inference logging and ingestion system for an LLM chat application.

Required surface from `GOAL.md`:

- Multi-turn chatbot with short conversational context and a simple UI.
- Lightweight SDK/wrapper around model calls that captures inference metadata.
- Near-real-time ingestion pipeline that validates, parses, enriches, and stores logs.
- Storage for chat messages, inference logs, and extracted metadata.
- README, architecture notes, and a demo-ready flow.
- Bonus scope: multi-provider support, streaming responses, latency/throughput/error dashboards,
  Docker Compose setup, event-based architecture, and PII redaction.

Build order lives in `IMPLEMENTATION.md`. Use it as the step-by-step execution plan.

## Stack

TypeScript monorepo using Turborepo and Bun workspaces with `catalog:` dependencies.

- `apps/web`: React 19, TanStack Router, TanStack Query, Tailwind v4, shadcn/ui via
  `packages/ui`, Better Auth client, AI SDK React chat UI.
- `apps/server`: Hono on Node, Better Auth at `/api/auth/*`, oRPC at `/rpc`, OpenAPI reference at
  `/api-reference`, CORS, evlog request logging, AI SDK streaming chat endpoint.
- `apps/docs`: Astro Starlight docs organized with Diataxis.
- `packages/api`: oRPC routers and protected/public procedures.
- `packages/auth`: Better Auth configuration and Drizzle adapter.
- `packages/db`: Drizzle and PostgreSQL schema. Auth tables are owned by Better Auth.
- `packages/env`: `@t3-oss/env-core` and Zod environment validation.
- `packages/ui`: shared shadcn/ui primitives.
- `packages/config`: shared TypeScript config.
- Target additions from `IMPLEMENTATION.md`: `packages/sdk`, ClickHouse schema/init files, Valkey
  stream integration, and an ingestion worker.

Ports:

- Web: `5173`
- Server: `3000`
- OpenAPI reference: `3000/api-reference`
- PostgreSQL: `5432`
- ClickHouse: `8123` HTTP, `9000` native
- Valkey: `6379`

## Commands

Run from the repo root unless noted.

```bash
bun install
bun run dev
bun run dev:web
bun run dev:server
bun run build
bun run check-types
bun run check
bun run fix
bun run db:push
bun run db:generate
bun run db:migrate
bun run db:studio
cd apps/docs && bun run dev
cd apps/docs && bun run build
```

Planned commands as the implementation grows:

```bash
docker compose up
bun run dev:worker
```

## Current State

The repository started as a Better-T-Stack scaffold. Some docs describe the target architecture
rather than fully implemented behavior. When code and docs disagree, treat `GOAL.md`,
`IMPLEMENTATION.md`, and `apps/docs` together as the intended direction, then verify the current
code before editing.

Current notable code:

- `apps/web/src/routes/ai.tsx`: simple chat UI using `useChat`.
- `apps/server/src/index.ts`: Hono server with auth, oRPC, OpenAPI, evlog, and a basic `/ai`
  streaming route.
- `packages/db/src/schema/auth.ts`: Better Auth-owned tables.
- `packages/db/src/schema/todo.ts`: scaffold example; do not model new domain work around todos.

## Development Rules

### 1. Think Before Coding

State assumptions explicitly. Ask rather than guess. Push back when a simpler approach exists.
Stop when confused.

### 2. Simplicity First

Write the minimum code that solves the current step in `IMPLEMENTATION.md`. Avoid speculative
abstractions. Prefer clear names and small functions over cleverness.

### 3. Read Before You Write

Before adding code, read the relevant exports, immediate callers, schemas, and docs. For
non-trivial work, read the matching `apps/docs` page first.

### 4. Test-Driven Development

Drive behavior through Red -> Green -> Refactor:

1. Write the smallest failing test or executable smoke check for the next behavior.
2. Write the minimum code to pass.
3. Refactor only while tests stay green.

Use exact unit tests for pure logic such as event validation, redaction, pricing, error
classification, and preview truncation. Use integration tests or smoke checks for PostgreSQL,
Valkey, ClickHouse, oRPC procedures, and streaming behavior. Do not mock away the behavior being
validated.

### 5. Surgical Changes

Touch only what the task needs. Do not refactor adjacent scaffold code unless it blocks the current
step. If stale scaffold code is in the way, replace it deliberately and update the docs that mention
it.

### 6. Fail Loud

"Done" means implemented and verified. If tests, docs builds, Docker services, or manual UI checks
were not run, say so. Do not silently skip validation.

### 7. Track Multi-Step Work

For work with three or more meaningful steps, use the available todo tool. Mark one task
`in_progress` before starting it and mark it `completed` as soon as it ships.

### 8. Use Existing Patterns

Follow the repo's TypeScript, Hono, oRPC, Drizzle, TanStack Router, TanStack Query, AI SDK, shadcn,
and Ultracite patterns. Prefer local helpers and package boundaries over new abstractions.

### 9. Plan Before Large Changes

Plan first for work that spans more than two files, changes `packages/db`, adds a package, changes a
public oRPC surface, changes auth/session behavior, or alters the ingestion architecture.

### 10. Comments Must Earn Their Place

Default to no comments. Add a comment only for a non-obvious invariant, failure-mode decision, or
operational tradeoff. Do not narrate the current task in code comments.

## Docs To Read

Use `apps/docs` as the architecture and contract reference.

- `src/content/docs/tutorials/run-the-system-locally.md`: target local workflow.
- `src/content/docs/guides/instrument-an-llm-call.md`: how model calls should be wrapped.
- `src/content/docs/guides/add-an-llm-provider.md`: OpenRouter/model allow-list guidance.
- `src/content/docs/guides/enable-pii-redaction.md`: redaction expectations.
- `src/content/docs/reference/data-models.md`: PostgreSQL conversations and messages.
- `src/content/docs/reference/inference-log-schema.md`: inference event and ClickHouse schema.
- `src/content/docs/reference/configuration.md`: env vars and service ports.
- `src/content/docs/explanation/architecture-overview.md`: system shape.
- `src/content/docs/explanation/logging-and-ingestion-flow.md`: event lifecycle.
- `src/content/docs/explanation/schema-design-and-tradeoffs.md`: storage tradeoffs.
- `src/content/docs/explanation/scaling-and-failure-handling.md`: retry, buffering, and scale notes.

## Docs In Lockstep

Update docs in the same change as code when behavior changes.

- Change PostgreSQL conversation/message schema: update `reference/data-models.md`.
- Change inference event fields or ClickHouse schema: update `reference/inference-log-schema.md`.
- Change logging, buffering, worker behavior, retries, DLQ, or redaction: update the relevant guide
  or explanation page.
- Add/change env vars: update `reference/configuration.md`, `packages/env`, and `.env.example`.
- Add/change local setup or scripts: update `reference/configuration.md`, the tutorial, and README.
- Add/change chat UI flows: update `tutorials/run-the-system-locally.md` and any relevant guide.
- If implementation diverges from a target-doc statement, either bring code into alignment or update
  the docs honestly.

## Architecture Hard Rules

- `apps/web` imports only `AppRouter` types from `packages/api`; it must not import server logic.
- Use the oRPC client for domain APIs. Do not bypass it with ad hoc `fetch` for procedures.
- Keep auth on domain procedures. Conversation, message, metrics, and ingestion admin surfaces are
  protected unless explicitly public.
- `packages/db` is the PostgreSQL source of truth for conversations and messages. Do not hand-edit
  Better Auth tables beyond auth configuration/migrations generated by the chosen tools.
- Store chat history in PostgreSQL. Do not store growing message arrays on a single conversation row.
- Store inference analytics in ClickHouse. Do not compute dashboard aggregates by pulling all logs
  into JavaScript.
- Use Valkey streams as the event buffer between the chat path and the ingestion worker.
- The chat path must not depend on ClickHouse availability. Logging persistence is asynchronous.
- The SDK emits one structured event per model call. Avoid scattered `console.log` inference logs.
- Redact previews before events leave the process. Never store raw secrets, API keys, bearer tokens,
  or obvious PII in inference previews.
- Validate all boundaries with Zod or a typed schema: API inputs, env vars, SDK events, worker
  ingestion payloads.
- Keep OpenTelemetry GenAI-style field names at the event boundary where practical.
- Derive cost and stable error classes in the worker, not at UI call sites.
- Streaming responses must capture total latency and, where possible, time to first token.
- Cancellation must produce an explicit `cancelled` status rather than looking like success.
- Secrets never go in git, logs, docs examples with real values, or screenshots.

## Verification

After code changes, run the narrowest useful check first, then broader checks before handoff.

- TypeScript or API changes: `bun run check-types`.
- Formatting/linting: `bun run check`; use `bun run fix` when appropriate.
- DB schema changes: `bun run db:push` or migration command, then verify with a real local DB.
- Docs changes: `cd apps/docs && bun run build`.
- Docker/local infrastructure changes: `docker compose up` and verify service health.
- UI changes: run the app and manually exercise the affected route.
- Ingestion changes: emit a sample event, verify Valkey consumption, ClickHouse insert, and DLQ
  handling for invalid input.

## Skills And MCP

Use matching skills and MCP docs when the task calls for them:

- `hono` for Hono routes, middleware, and endpoint testing.
- `better-auth-best-practices` for auth/session changes.
- `turborepo` for task pipelines and workspace changes.
- `shadcn` for shared UI primitives or component composition.
- `ultracite` for lint/format issues and code quality.
- `vercel-react-best-practices` and `vercel-composition-patterns` for React/TanStack UI work.
- `review-logging-patterns` for evlog and structured request logging.
- `ai-sdk` for Vercel AI SDK model calls, streaming, tools, and provider integration.
- `context7` for current docs on React, TanStack, Hono, oRPC, Drizzle, Better Auth, Tailwind, Zod,
  Astro Starlight, and the AI SDK when library behavior matters.

Do not use MongoDB guidance for app code. This project uses PostgreSQL, ClickHouse, and Valkey.

## Commit Discipline

Only commit when the user asks. When committing, keep history in small TDD-sized steps:

- Failing test or smoke check for the behavior.
- Minimum implementation to pass.
- Refactor or cleanup with tests still green.

Use conventional, present-tense messages that name behavior, for example:

```text
test: validate inference event payloads
feat: emit inference events to valkey
refactor: isolate preview redaction
```

Never commit secrets, `.env` files, generated `dist/` output, or incidental `routeTree.gen.ts`
churn. Do not add AI/tool attribution to commit messages.
