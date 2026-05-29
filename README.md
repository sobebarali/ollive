# Ollive

Ollive is a multi-turn LLM chatbot with a **near-real-time inference logging and ingestion
pipeline**. Every model call is wrapped by a lightweight SDK that captures rich metadata — model,
provider, latency, token usage, status, conversation IDs, and redacted input/output previews — and
emits it as a structured event. A separate worker validates, enriches, and stores those events for
analytics, so the chat path never waits on (or breaks because of) the logging path.

The deeper "why" lives in [`apps/docs`](apps/docs) (an Astro Starlight site). This README is the
fast path from clone to a working local system.

## Live demo

Deployed on Railway:

| Surface | URL |
|---|---|
| Web app (chat + dashboard) | <https://web-production-5b681.up.railway.app> |
| API (OpenAPI reference at `/api-reference`) | <https://ollive-production-99e4.up.railway.app> |
| Docs | <https://docs-production-368b.up.railway.app> |

Sign up, start a chat, then open `/dashboard` to watch latency, throughput, and error metrics
update within a second or two as the worker ingests each inference event.

## Architecture

```text
┌─────────────┐   chat (SSE stream)       ┌──────────────────────────┐
│   Web app   │ ─────────────────────────▶│  Chat API (Hono + oRPC)  │
│ (TanStack)  │ ◀──── tokens stream ──────│  wraps the LLM via SDK   │
└─────────────┘                           └────────────┬─────────────┘
      ▲                                                 │ emit inference event
      │ dashboards / history                            ▼
      │                                   ┌──────────────────────────┐
      │                                   │  Valkey Stream (buffer)  │
      │                                   └────────────┬─────────────┘
      │                                                │ consume in batches
      │                                   ┌──────────────────────────┐
      │                                   │  Ingestion worker        │
      │                                   │  validate → redact → map │
      │                                   └──────┬──────────┬────────┘
      │                  ┌───────────────────────▼──┐   ┌───▼─────────────────────┐
      └──────────────────│ PostgreSQL               │   │ ClickHouse              │
                         │ conversations, messages  │   │ inference_logs (OLAP)   │
                         └──────────────────────────┘   └─────────────────────────┘
```

The data path is: **chat → SDK wrapper → Valkey stream → ingestion worker → ClickHouse → dashboard.**

Two databases, on purpose:

- **PostgreSQL** stores conversations and messages. This OLTP data has clear relational boundaries
  (`users → conversations → messages`) and benefits from constraints, indexes, and joins.
- **ClickHouse** stores inference logs. The dashboards are time-bucketed aggregations
  (`count()`, `avg`/`p50`/`p95` latency, errors by type) over a high-volume, append-only table —
  exactly what a columnar OLAP engine is built for.

A Valkey stream sits between the chat path and storage so the chat request only does one cheap thing
(append to the buffer) and returns immediately. The worker drains the buffer at its own pace,
retries on failure, and scales independently. See
[Architecture overview](apps/docs/src/content/docs/explanation/architecture-overview.md).

## Prerequisites

- [Bun](https://bun.sh)
- [Docker](https://www.docker.com) running (for PostgreSQL, ClickHouse, and Valkey)
- An [OpenRouter](https://openrouter.ai) API key

## Setup

Local development is **two commands**: `docker compose up` for the backing services and
`bun run dev` for the apps. Full steps:

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp apps/server/.env.example apps/server/.env
# then set OPENROUTER_API_KEY in apps/server/.env
# (the Postgres, ClickHouse, and Valkey URLs already point at the Docker services)

# 3. Start the backing services
#    Postgres :5432, ClickHouse :8123/:9000, Valkey :6379.
#    ClickHouse auto-runs infra/clickhouse/001_inference_logs.sql on first boot.
docker compose up

# 4. Apply the database schema (creates auth + conversations/messages tables)
#    Required on first run; re-run only after a schema change.
bun run db:push

# 5. Start the web app, API, and ingestion worker together
bun run dev
```

Then open <http://localhost:5173>, sign up, and start chatting. The API runs at
<http://localhost:3000> (OpenAPI reference at <http://localhost:3000/api-reference>).

For a guided walkthrough that traces a single message all the way to the dashboard, see
[Run the system locally](apps/docs/src/content/docs/tutorials/run-the-system-locally.md).

## Using it

- **Chat** — multi-turn conversations with streaming responses. A sidebar lists your conversations
  (newest first); pick a model, start a new chat, resume an older one, or cancel an in-flight
  response (cancellation is logged with `status = cancelled`).
- **Dashboard** — visit `/dashboard` for throughput, latency (avg / p50 / p95), and error panels
  over your inference logs, with `15m` / `1h` / `24h` / `7d` time ranges. Numbers appear within
  about a second of a chat message, once the worker ingests the event.

To see a raw event in ClickHouse:

```bash
docker compose exec clickhouse clickhouse-client --query \
  "SELECT gen_ai_request_model, status, latency_ms, input_tokens, output_tokens \
   FROM inference_logs ORDER BY start_time DESC LIMIT 1"
```

## Schema design & tradeoffs

The system has two data shapes with opposite access patterns, so it uses two stores:

| | Conversational data | Inference logs |
|---|---|---|
| Write pattern | low volume, updated in place | high volume, append-only |
| Read pattern | fetch a thread by id | aggregate over time ranges |
| Best fit | PostgreSQL (OLTP) | ClickHouse (columnar OLAP) |

The inference event mirrors the **OpenTelemetry GenAI semantic conventions**
(`gen_ai.request.model`, `gen_ai.usage.input_tokens`, …) at the event boundary, then maps to
ClickHouse column names in the worker — interoperable and self-documenting. We store truncated,
**PII-redacted previews** plus token counts rather than full prompt/response bodies, to bound
storage growth and shrink the PII surface.

Accepted tradeoffs: two engines to operate (mitigated by Docker Compose bundling both), and eventual
consistency between the two stores — a message in PostgreSQL and its log in ClickHouse are written at
slightly different times, linked by message id once the log lands. Full detail in
[Schema design & tradeoffs](apps/docs/src/content/docs/explanation/schema-design-and-tradeoffs.md).

## Failure handling

Every failure decision follows one rule: **a failure in logging or storage must never degrade the
user's chat.**

- **Emit to buffer fails** (Valkey unreachable): the SDK swallows the error — logging is
  best-effort — so the chat still returns.
- **Worker crashes mid-batch**: the `ingestion` consumer group only `XACK`s a batch after its rows
  are stored, so unacked events stay in the pending list and are redelivered on restart.
- **Malformed event**: routed to a validation dead-letter stream (`inference:events:dead`) rather
  than dropped.
- **ClickHouse write fails**: the worker retries with exponential backoff and does not ack until the
  insert succeeds; batches that exhaust retries are parked in a separate write-failure stream
  (`inference:events:dead:write`) so a stuck write never blocks the rest.
- **Cancellation**: produces an explicit `status = cancelled` event rather than looking like
  success.

See [Scaling & failure handling](apps/docs/src/content/docs/explanation/scaling-and-failure-handling.md).

## What we'd improve with more time

- Fully idempotent inserts (dedupe on `event_id`) so even a deliberate full stream replay cannot
  create duplicate rows — today's re-run safety comes from the consumer-group cursor.
- TTL-based retention and a materialized view for the hottest dashboard rollups.
- Autoscaling the worker on stream lag; broader multi-provider coverage and richer dashboards.
- Kubernetes deployment (the deferred bonus in `IMPLEMENTATION.md` Step 11).

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and on pull
requests: `bun install`, `check-types`, `build`, and the infra-free unit tests
(`packages/sdk`, `apps/server/src`, and the mocked `packages/api` model tests). Lint (`bun run
check`) runs as a non-blocking step that surfaces existing scaffold issues without failing the
build. Integration tests that need PostgreSQL, ClickHouse, Valkey, and live OpenRouter are not run
in CI — run them locally with `docker compose up` and `bun run test:integration`.

## Deployment (Railway)

The API server deploys to Railway from this repo. Build and start are defined in
[`railway.json`](railway.json): Railpack installs with Bun, builds the server with
`bun run build --filter=server`, and starts it with `node apps/server/dist/index.mjs`. The server
binds to Railway's injected `PORT` (falling back to `3000` locally).

The service needs backing data stores and these environment variables set in Railway (never commit
real values):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL — add a Railway Postgres service and reference its URL |
| `CLICKHOUSE_URL` | ClickHouse HTTP endpoint for inference analytics |
| `REDIS_URL` | Valkey/Redis stream buffer (`redis://` or `rediss://`) |
| `OPENROUTER_API_KEY` | OpenRouter API key for model calls |
| `BETTER_AUTH_SECRET` | Auth signing secret, at least 32 characters |
| `BETTER_AUTH_URL` | Public URL of the deployed server |
| `CORS_ORIGIN` | Public URL of the web app |

The server validates env at startup, so it crashes loudly if any required variable is missing. Run
the schema once against the production database, overriding `DATABASE_URL` (use the Postgres
service's public URL, since `*.railway.internal` is only reachable from inside Railway):

```bash
DATABASE_URL="<Postgres DATABASE_PUBLIC_URL>" bun run db:push
```

`turbo.json` lists `DATABASE_URL` in the `db:push` task `env` so the override reaches drizzle-kit;
without it Turbo's strict env mode drops the override and the push silently hits your local DB.

The full stack runs as separate Railway services from this one repo, each pointing at its own
config file:

| Service | Config | Build | Start |
|---|---|---|---|
| API | [`railway.json`](railway.json) | `bun run build --filter=server` | `node apps/server/dist/index.mjs` |
| Worker | [`railway.worker.json`](railway.worker.json) | `bun run build --filter=server` | `node apps/server/dist/worker.mjs` |
| Web | [`railway.web.json`](railway.web.json) | `bun run build --filter=web` | `bun run --filter=web serve` (Vite preview on `PORT`) |

PostgreSQL, ClickHouse, and Valkey are managed Railway services; the app services reference their
URLs. The worker and API share the same env schema, so both need the database, Redis, and
OpenRouter variables. The web service needs `VITE_SERVER_URL` (the API's public URL) at build time,
since Vite bakes it into the bundle.

## Repo structure

```text
ollive/
├── apps/
│   ├── web/         # React + TanStack Router chat UI and dashboard
│   ├── server/      # Hono API (oRPC, auth, streaming chat) + ingestion worker
│   └── docs/        # Astro Starlight documentation site
├── packages/
│   ├── api/         # oRPC routers (conversation, model, metrics) + ClickHouse client
│   ├── sdk/         # inference logging SDK: event schema, redaction, emit, logged()/streamLogger
│   ├── auth/        # Better Auth configuration and Drizzle adapter
│   ├── db/          # Drizzle + PostgreSQL schema (conversations, messages, auth)
│   ├── env/         # @t3-oss/env-core + Zod environment validation
│   ├── ui/          # shared shadcn/ui primitives
│   └── config/      # shared TypeScript config
└── infra/
    └── clickhouse/  # inference_logs table init SQL (mounted into the ClickHouse container)
```

## Scripts

Run from the repo root.

| Script | What it does |
|---|---|
| `bun run dev` | Start web (:5173), API (:3000), and the ingestion worker together |
| `bun run dev:web` / `dev:server` / `dev:worker` | Start a single app |
| `bun run db:push` | Apply the Drizzle schema to PostgreSQL (run once after first `docker compose up`) |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run build` | Build all apps and packages |
| `bun run check-types` | Type-check across the monorepo |
| `bun run check` / `bun run fix` | Lint/format with Ultracite |
| `bun run test` | Run unit tests |
| `cd apps/docs && bun run dev` | Run the documentation site |

## Documentation

The [`apps/docs`](apps/docs) site is the architecture and contract reference:

- [Run the system locally](apps/docs/src/content/docs/tutorials/run-the-system-locally.md)
- [Instrument an LLM call](apps/docs/src/content/docs/guides/instrument-an-llm-call.md)
- [Configuration (env vars & ports)](apps/docs/src/content/docs/reference/configuration.md)
- [Inference log schema](apps/docs/src/content/docs/reference/inference-log-schema.md)
- Explanation: [architecture](apps/docs/src/content/docs/explanation/architecture-overview.md) ·
  [logging & ingestion flow](apps/docs/src/content/docs/explanation/logging-and-ingestion-flow.md) ·
  [schema design & tradeoffs](apps/docs/src/content/docs/explanation/schema-design-and-tradeoffs.md) ·
  [scaling & failure handling](apps/docs/src/content/docs/explanation/scaling-and-failure-handling.md)
</content>
</invoke>
