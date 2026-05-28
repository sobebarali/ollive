---
title: Logging & Ingestion Flow
description: The end-to-end life of an inference event, and the logging strategy behind it.
---

This page traces one LLM call from the moment a user hits *send* to the moment its metrics
appear on a dashboard, and explains the logging strategy that shapes it.

## Life of an inference event

1. **Capture starts.** The chat handler calls the LLM through the SDK wrapper. The wrapper
   records a start timestamp and the request metadata (model, provider, conversation id,
   message id, input preview).
2. **The model responds.** For streaming responses the wrapper measures *time to first token*
   separately from total latency, and accumulates token usage as the stream completes.
3. **The event is built.** On completion (or error) the wrapper assembles one structured
   record — a single "wide event" containing everything known about the call. See the
   [Inference log schema](/reference/inference-log-schema/).
4. **PII is redacted.** Input/output previews pass through a redaction step *before they leave
   the process*, so raw secrets never touch the wire or storage. See
   [Enable PII redaction](/guides/enable-pii-redaction/).
5. **The event is emitted.** The wrapper appends the event to a Valkey stream and returns. This
   is a sub-millisecond, non-blocking operation; the chat response is already on its way to the
   user.
6. **The worker consumes.** A separate ingestion worker reads from the stream in batches,
   validates each payload against the schema (rejecting malformed events to a dead-letter
   stream), and extracts derived metadata (e.g. cost from token counts, success/error class).
7. **The event is stored.** The worker writes the inference log to ClickHouse. If the event
   relates to a chat turn, the corresponding message row in PostgreSQL is linked by id.
8. **Dashboards read.** The metrics API runs time-bucketed aggregations over ClickHouse to
   serve latency, throughput, and error-rate panels.

## Logging strategy: wide events, not log lines

We log **one structured event per inference**, not scattered `console.log` lines. Each event
carries the full context of the call in a flat, queryable shape. This "wide event" approach
means:

- **One row answers most questions.** "What was the p95 latency for `claude-sonnet` yesterday
  when the request errored?" is a single filter+aggregate, no log correlation needed.
- **The schema is the contract.** Because every event has the same shape, the ingestion worker
  can validate strictly and the dashboards can rely on every field being present.
- **It maps to a standard.** The event shape follows the OpenTelemetry GenAI semantic
  conventions, so it could be exported to any OTel-compatible backend later without reshaping.

## Near-real-time, not real-time

The brief asks for logs "in near real time." We deliberately choose *near* real time:

- The chat path **emits** synchronously (fast, local) but **persists** asynchronously (via the
  worker). End-to-end visibility lag is typically well under a second under normal load.
- This is the right tradeoff because the value of an inference log is analytical, not
  transactional — a dashboard that is one second behind is fine; a chat that is one second
  slower because storage is busy is not.

## Why not log inline?

Writing straight to the database from the chat handler would be simpler, but it couples the
user's latency and availability to the logging store. The stream-and-worker split is what lets
us make strong [scaling and failure-handling](/explanation/scaling-and-failure-handling/)
guarantees about the chat path.
