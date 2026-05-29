---
title: Run the system locally
description: From clone to chatting and watching your first inference log appear on a dashboard.
---

By the end of this tutorial you will have the whole system running locally, you will have sent a
message to the chatbot, and you will have watched that call appear as an inference log on a
dashboard. This is a learning-oriented walkthrough — for the *why* behind each piece, follow the
links into the [Explanation](/explanation/architecture-overview/) section.

## Prerequisites

- [Bun](https://bun.sh) installed
- [Docker](https://www.docker.com) running (for PostgreSQL, ClickHouse, and Valkey)
- An [OpenRouter](https://openrouter.ai) API key

## 1. Install dependencies

```bash
bun install
```

## 2. Configure environment

Copy the example env and fill in your key:

```bash
cp apps/server/.env.example apps/server/.env
```

Set at least `OPENROUTER_API_KEY`. The database, ClickHouse, and Valkey URLs already point at the
Docker services. See [Configuration](/reference/configuration/) for the full list.

## 3. Start the backing services

```bash
docker compose up
```

This brings up PostgreSQL, ClickHouse, and Valkey. ClickHouse runs the init SQL on first boot, so
the `inference_logs` table is ready. Wait until the health checks pass.

## 4. Apply the database schema

```bash
bun run db:push
```

This creates the auth, `conversations`, and `messages` tables in PostgreSQL. Run it once after the
first `docker compose up`; you only need to re-run it after a schema change. (ClickHouse's
`inference_logs` table is created automatically by the init SQL in the previous step.)

## 5. Start the apps and the ingestion worker

```bash
bun run dev   # web app (:5173) + API (:3000) + ingestion worker
```

`bun run dev` starts the web app, the API, and the ingestion worker together. To run just the
worker on its own, use `bun run dev:worker`.

The worker is a separate process so the chat path never depends on ClickHouse being available. It
prints the stream and consumer group it is draining when it starts.

## 6. Open the chatbot and send a message

Open [http://localhost:5173](http://localhost:5173), start a new conversation, pick a model, and
send a message. You should see the response stream in token by token.

Send a couple more messages so the model has multi-turn context to work with.

## 7. Watch your call become an inference log

Open the **Dashboard** link in the header (the `/dashboard` route). Metrics are scoped to your own
conversations and read from ClickHouse, so they appear within about a second of your message — once
the ingestion worker has processed it. Use the time-range selector (15m / 1h / 24h / 7d) to change
the window. You should see:

- the **throughput** panel tick up by one call (total plus a bar chart over time),
- the **latency** panel show avg / p50 / p95 for your successful calls,
- the **errors** panel (by status and by error type) stay flat (assuming success).

If you have not sent any messages yet, the dashboard shows an empty state instead of panels.

To see the raw event, query ClickHouse directly:

```bash
docker compose exec clickhouse clickhouse-client --query \
  "SELECT gen_ai_request_model, status, latency_ms, input_tokens, output_tokens \
   FROM inference_logs ORDER BY start_time DESC LIMIT 1"
```

You just observed the full path: **chat → SDK wrapper → Valkey stream → ingestion worker →
ClickHouse → dashboard.** That is the
[logging and ingestion flow](/explanation/logging-and-ingestion-flow/) end to end.

Prefer the per-call detail to the aggregates? Open the **Logs** link in the sidebar (the `/logs`
route). It lists individual inference events newest-first — one row per model call — instead of
querying ClickHouse by hand. Each row shows the model, status, latency, time to first token, input
and output tokens, and derived cost; click a row to expand the full redacted input/output previews
and identifiers. Filter by time range and status, and page through with Previous / Next. Like the
dashboard, logs are scoped to your own conversations and refresh every few seconds, so a new call
appears once the ingestion worker has flushed it (within `INGESTION_FLUSH_MS`, ~5s by default).

The chat page itself also carries a live **Inference logs** panel on the right (on wide screens):
it polls the same `logs.list` procedure for the open conversation and refreshes every few seconds,
so each reply's call — latency, tokens, cost, status, and previews — shows up beside the thread a
moment after the worker ingests it.

## 8. Try the conversation controls

Back in the UI:

- **List** — your conversations appear in the sidebar, newest first.
- **Resume** — click an earlier conversation to reload its history and keep chatting.
- **Cancel** — cancel an in-flight response; the call is logged with `status = cancelled`.

## What you learned

You ran the chatbot, the logging SDK, the event buffer, the ingestion worker, and both databases
together, and you traced a single inference from keystroke to dashboard. Next:

- **Do a specific task** → [How-to guides](/guides/instrument-an-llm-call/)
- **Look up a field or env var** → [Reference](/reference/inference-log-schema/)
- **Understand the design** → [Explanation](/explanation/architecture-overview/)
