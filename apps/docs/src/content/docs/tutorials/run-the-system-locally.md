---
title: Run the system locally
description: From clone to chatting and watching your first inference log appear on a dashboard.
---

By the end of this tutorial you will have the whole system running locally, you will have sent a
message to the chatbot, and you will have watched that call appear as an inference log on a
dashboard. This is a learning-oriented walkthrough — for the *why* behind each piece, follow the
links into the [Explanation](/explanation/architecture-overview/) section.

:::note
This documents the target local-dev workflow. Some commands assume the build steps described in
the docs are in place.
:::

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

## 4. Start the apps and the ingestion worker

In separate terminals:

```bash
bun run dev          # web app (:5173) + API (:3000)
bun run dev:worker   # ingestion worker: drains Valkey → ClickHouse
```

The worker is a separate process so the chat path never depends on ClickHouse being available. It
prints the stream and consumer group it is draining when it starts.

## 5. Open the chatbot and send a message

Open [http://localhost:5173](http://localhost:5173), start a new conversation, pick a model, and
send a message. You should see the response stream in token by token.

Send a couple more messages so the model has multi-turn context to work with.

## 6. Watch your call become an inference log

Open the dashboard route in the web app. Within about a second of your message, you should see:

- the **throughput** panel tick up by one call,
- the **latency** panel show your call's duration,
- the **errors** panel stay flat (assuming success).

To see the raw event, query ClickHouse directly:

```bash
docker compose exec clickhouse clickhouse-client --query \
  "SELECT gen_ai_request_model, status, latency_ms, input_tokens, output_tokens \
   FROM inference_logs ORDER BY start_time DESC LIMIT 1"
```

You just observed the full path: **chat → SDK wrapper → Valkey stream → ingestion worker →
ClickHouse → dashboard.** That is the
[logging and ingestion flow](/explanation/logging-and-ingestion-flow/) end to end.

## 7. Try the conversation controls

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
