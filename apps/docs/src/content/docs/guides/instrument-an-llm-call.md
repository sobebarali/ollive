---
title: Instrument an LLM call
description: Wrap an LLM call with the logging SDK so it emits an inference event.
---

This guide shows how to make an LLM call that is automatically logged. Use it when you are
adding a new code path that talks to a model. For the fields that get captured, see the
[Inference log schema](/reference/inference-log-schema/).

## Goal

Replace a raw provider call with the SDK wrapper so that latency, token usage, status, and
previews are captured and emitted to the ingestion pipeline — without you writing any logging
code at the call site.

## Steps

### 1. Import the wrapper

```ts
import { logged } from "@ollive/sdk";
```

The wrapper takes the LLM call and the identifiers needed to correlate the event with a chat
turn.

### 2. Wrap the call

```ts
const result = await logged(
  {
    conversationId,
    messageId,
    model: "anthropic/claude-sonnet",
  },
  (client) => client.chat({ messages }),
);
```

The wrapper:

- records start time and total latency,
- reads token usage from the provider response,
- sets `status` to `success` or `error`,
- builds [the inference event](/reference/inference-log-schema/), redacts previews, and emits it
  to the Valkey stream — all after returning your `result`, so the call site is not slowed.

### 3. For streaming responses

Streaming needs hooks into the stream lifecycle rather than a single return value, so use
`streamLogger`. It returns the `onChunk` / `onFinish` / `onAbort` / `onError` callbacks you wire into
the Vercel AI SDK `streamText` call; it captures *time to first token* on the first text delta, total
latency and usage on completion, and emits exactly one event:

```ts
import { streamLogger } from "@ollive/sdk";

const logger = streamLogger({ conversationId, messageId, model, stream: true });

const result = streamText({
  model: openrouter(model),
  messages,
  abortSignal,
  onChunk: logger.onChunk,
  onError: logger.onError,
  onAbort: logger.onAbort,
  onFinish: logger.onFinish,
});

return result.toUIMessageStreamResponse();
```

The event is emitted when the stream finishes, is aborted (`status: cancelled`), or errors. A
cancelled stream still produces an event — `onFinish` does not fire on abort, so persist any partial
output from `onAbort` if you need it.

## Verify it worked

After making a call, the event should land in ClickHouse within ~1 second:

```sql
SELECT gen_ai_request_model, status, latency_ms, input_tokens, output_tokens
FROM inference_logs
ORDER BY start_time DESC
LIMIT 5;
```

You should see your call as the top row. If nothing appears, check that the ingestion worker is
running and that `REDIS_URL` / `CLICKHOUSE_URL` are set — see [Configuration](/reference/configuration/).

## Notes

- You never write to the database from the call site. The wrapper only emits to the stream; the
  [ingestion worker](/explanation/logging-and-ingestion-flow/) does the persistence.
- If emitting fails (e.g. Valkey is down), the wrapper swallows the error so your LLM call still
  returns. Logging is best-effort by design.
