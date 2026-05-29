---
title: Configuration
description: Environment variables and services required to run the system.
---

All configuration is via environment variables, validated at boot in `packages/env` (server
vars) using `@t3-oss/env-core` + Zod — a missing or malformed value fails fast at startup
rather than at first use.

## Server environment variables

| Variable | Required | Example | Used by |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://postgres:postgres@localhost:5432/ollive` | PostgreSQL (conversations, messages, auth). |
| `CLICKHOUSE_URL` | yes | `http://localhost:8123` | Inference log storage + dashboards. |
| `REDIS_URL` | yes | `redis://localhost:6379` | Valkey event stream (buffer). |
| `OPENROUTER_API_KEY` | yes | `sk-or-…` | Multi-provider LLM access via OpenRouter. |
| `BETTER_AUTH_SECRET` | yes | 32+ char secret | Session signing. |
| `BETTER_AUTH_URL` | yes | `http://localhost:3000` | Auth base URL. |
| `CORS_ORIGIN` | yes | `http://localhost:5173` | Allowed web origin. |
| `PII_REDACTION` | no | `on` (default) | Toggle preview redaction. See the [how-to](/guides/enable-pii-redaction/). |
| `LOG_PREVIEW_CHARS` | no | `200` | Max characters kept in input/output previews. |
| `INGESTION_BATCH_SIZE` | no | `500` | Max events the worker drains per ClickHouse insert. |
| `INGESTION_FLUSH_MS` | no | `5000` | Worker blocking read window; flushes a partial batch after this many ms. |
| `NODE_ENV` | no | `development` | Runtime mode. |

## Services

| Service | Default port | Provided by |
|---|---|---|
| Web app (TanStack Router) | 5173 | `apps/web` |
| API + chat (Hono / oRPC) | 3000 | `apps/server` |
| Ingestion worker | n/a (no inbound port) | `apps/server` (worker entry) |
| PostgreSQL | 5432 | Docker Compose |
| ClickHouse | 8123 (HTTP), 9000 (native) | Docker Compose |
| Valkey | 6379 | Docker Compose |

All services come up together with one command — see
[Run the system locally](/tutorials/run-the-system-locally/).

## Ports of note

- The web app proxies API calls to `:3000`; if you change the API port, update `CORS_ORIGIN`
  and the web client base URL together.
- ClickHouse speaks HTTP on `8123` (used by the worker and metrics API) and the native protocol
  on `9000`.
