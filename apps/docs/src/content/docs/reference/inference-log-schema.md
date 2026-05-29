---
title: Inference Log Schema
description: The structured inference event, its fields, and the ClickHouse table definition.
---

The inference log is the single structured event emitted for every LLM call. Field names follow
the [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
where one exists. For the reasoning behind this shape, see
[Schema design & tradeoffs](/explanation/schema-design-and-tradeoffs/).

## Event fields

| Field | Type | Source | Notes |
|---|---|---|---|
| `event_id` | UUID | SDK | Unique per inference; used for dedupe. |
| `conversation_id` | UUID | caller | Links to the PostgreSQL conversation. |
| `message_id` | UUID | caller | Links to the assistant message this call produced. |
| `session_id` | string | caller | Optional client/session grouping. |
| `gen_ai.system` | string | SDK | Provider, e.g. `openai`, `anthropic`, `openrouter`. |
| `gen_ai.request.model` | string | caller | Requested model id. |
| `gen_ai.response.model` | string | provider | Model that actually served the request. |
| `gen_ai.usage.input_tokens` | uint32 | provider | Prompt tokens. |
| `gen_ai.usage.output_tokens` | uint32 | provider | Completion tokens. |
| `latency_ms` | uint32 | SDK | Total wall-clock duration of the call. |
| `time_to_first_token_ms` | uint32 | SDK | Streaming only; null otherwise. |
| `stream` | bool | SDK | Whether the response was streamed. |
| `status` | enum | SDK | `success` \| `error` \| `cancelled`. |
| `error.type` | string | SDK | Error class name when `status = error` (e.g. `AI_APICallError`, `RangeError`). |
| `error.message` | string | SDK | Provider error body/message when `status = error`. Truncated, **PII-redacted**. |
| `error.status_code` | uint32 | SDK | HTTP status from an AI SDK `APICallError`; drives error classification. |
| `input_preview` | string | SDK | Truncated, **PII-redacted** prompt preview. |
| `output_preview` | string | SDK | Truncated, **PII-redacted** completion preview. |
| `cost_usd` | float64 | worker | Derived from token counts × model price. |
| `start_time` | DateTime64 | SDK | UTC start timestamp. |
| `created_at` | DateTime64 | worker | UTC ingestion timestamp. |

:::note
`cost_usd` and the low-cardinality `error_type` class are *derived* by the ingestion worker, not
sent by the SDK. The worker prices each call from OpenRouter's per-token model pricing, and maps
the SDK's raw `error.type` / `error.status_code` / `error.message` to a stable class (HTTP status
wins: 429 → `rate_limit`, 401/403 → `auth`, …), so prices and error taxonomies can change without
shipping a new SDK. The redacted `error.message` is stored verbatim for drill-down.
:::

## ClickHouse table

```sql
CREATE TABLE inference_logs (
  event_id              UUID,
  conversation_id       UUID,
  message_id            UUID,
  session_id            String,
  gen_ai_system         LowCardinality(String),
  gen_ai_request_model  LowCardinality(String),
  gen_ai_response_model LowCardinality(String),
  input_tokens          UInt32,
  output_tokens         UInt32,
  latency_ms            UInt32,
  time_to_first_token_ms Nullable(UInt32),
  stream                Bool,
  status                LowCardinality(String),
  error_type            String DEFAULT '',
  error_message         String DEFAULT '',
  error_status          UInt16 DEFAULT 0,
  input_preview         String,
  output_preview        String,
  cost_usd              Float64 DEFAULT 0,
  start_time            DateTime64(3, 'UTC'),
  created_at            DateTime64(3, 'UTC') DEFAULT now64()
)
ENGINE = MergeTree
PARTITION BY toDate(start_time)
ORDER BY (gen_ai_system, gen_ai_request_model, start_time);
```

Locally this runs from `infra/clickhouse/001_inference_logs.sql`, mounted into the ClickHouse
container on first boot. On managed ClickHouse (e.g. Railway) there is no init mount, so the
ingestion worker also applies the same `CREATE TABLE IF NOT EXISTS` on startup. Keep the worker's
embedded DDL and this file in sync.

### Why these choices

- **`MergeTree` + `PARTITION BY toDate(start_time)`** — append-only, partitioned by day so
  retention windows can be dropped a partition at a time and dashboard scans skip irrelevant
  days.
- **`ORDER BY (system, model, start_time)`** — the primary index matches the most common
  dashboard filters (by provider, by model, over a time range).
- **`LowCardinality(String)`** for provider/model/status — these have few distinct values, so
  ClickHouse stores them as dictionaries for faster filtering and smaller storage.

## Example event (JSON on the wire)

```json
{
  "event_id": "0e3b...",
  "conversation_id": "a91c...",
  "message_id": "77f2...",
  "gen_ai.system": "openrouter",
  "gen_ai.request.model": "anthropic/claude-sonnet",
  "gen_ai.usage.input_tokens": 412,
  "gen_ai.usage.output_tokens": 188,
  "latency_ms": 2310,
  "time_to_first_token_ms": 540,
  "stream": true,
  "status": "success",
  "input_preview": "Summarise the attached report…",
  "output_preview": "The report covers three themes…",
  "start_time": "2026-05-27T18:04:11.220Z"
}
```

A failed call carries the error fields instead of an output. The SDK reads these straight off the
AI SDK's `APICallError`; the worker then classifies them into `error_type` (here `rate_limit`):

```json
{
  "status": "error",
  "error.type": "AI_APICallError",
  "error.status_code": 429,
  "error.message": "{\"error\":{\"message\":\"rate limit exceeded\"}}",
  "input_preview": "Summarise the attached report…",
  "output_preview": ""
}
```

## Where these fields surface

Every column above is exposed in the web app's **Logs** explorer (`/logs`), one row per call,
newest-first, scoped to the signed-in user's conversations. It is served by the `logs.list` oRPC
procedure, which reads `inference_logs` directly with a bounded `LIMIT`/`OFFSET` and the same
`conversation_id IN (...)` ownership filter the metrics dashboard uses — raw rows are never pulled
into JavaScript unfiltered. The aggregate [dashboard](/tutorials/run-the-system-locally/) consumes
the same table via `metrics.overview`.
