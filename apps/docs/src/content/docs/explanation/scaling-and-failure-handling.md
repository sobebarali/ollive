---
title: Scaling & Failure Handling
description: Scaling considerations and the failure assumptions the system is built on.
---

This page states the scaling levers and the failure assumptions behind the design. It is the
"scaling considerations" and "failure handling assumptions" section of the Architecture Notes.

## Guiding principle: the chat path must not depend on the logging path

Every failure decision flows from one rule: **a failure in logging or storage must never degrade
the user's chat.** The [event buffer](/explanation/logging-and-ingestion-flow/) exists to make
this true.

## Failure handling by stage

| Stage | If it fails | Behaviour |
|---|---|---|
| LLM provider call | timeout / 5xx / rate limit | Surfaced to the user as a chat error **and** logged as an inference event with `error.type` set. Optional provider fallback (see below). |
| Emit to buffer | Valkey unreachable | The SDK swallows the error (logging is best-effort) so the chat still returns; the emit failure is counted in a local metric, not raised to the user. |
| Ingestion worker | worker crashes mid-batch | The `ingestion` consumer group tracks acknowledgements; a batch is only `XACK`ed after its rows are stored, so unacked events stay in the pending list and are redelivered when the worker restarts. The advancing group cursor is also what makes re-running the worker safe today: already-acked events are never re-read, so no duplicate rows. |
| Validation | payload malformed | The event is routed to the validation dead-letter stream `inference:events:dead` (with the parse error attached) rather than dropped, so bad data is inspectable and never blocks good data. |
| ClickHouse write | DB down / slow | Worker retries with exponential backoff and does **not** ack until the insert succeeds, so events stay replayable in the stream while ClickHouse is unavailable. A batch that exhausts its retries is parked in a separate write-failure stream `inference:events:dead:write` (distinct from the validation DLQ) and acked, so a stuck write never blocks the rest of the stream. The chat path is unaffected because it already returned. |

## Scaling considerations

- **Stateless chat + worker tiers.** Both the API and the worker hold no local state, so they
  scale horizontally behind the buffer. Add workers to drain a deeper stream faster.
- **The buffer absorbs bursts.** Traffic spikes become a longer queue, not dropped logs or
  user-facing latency. Backpressure is visible as stream lag — a clean scaling signal.
- **ClickHouse is the analytics workhorse.** It ingests high-volume appends and serves
  aggregations with sub-second latency at high concurrency; partitioning by day keeps scans and
  retention cheap.
- **Read/write separation.** Writes go to ClickHouse via the worker; dashboard reads hit
  ClickHouse aggregations — no contention with the OLTP PostgreSQL store that serves chat history.
- **Batching.** The worker reads and inserts in batches, trading a little latency for far higher
  insert throughput (ClickHouse strongly prefers batched inserts).

## Assumptions

- **Logs are best-effort, chats are not.** We would rather drop or delay a log than slow a chat.
  For this workload that is the correct priority; a billing-grade audit log would need at-least-
  once delivery end to end, which the dead-letter + replay design already approximates.
- **Single-region, single-tenant.** No cross-region replication or per-tenant isolation is
  assumed; both are natural extensions.
- **Bounded payloads.** Previews are truncated, so a single pathological prompt cannot blow up
  storage or the event size.

## What we would add with more time

Fully idempotent inserts (dedupe on `event_id` so even a deliberate full stream replay cannot
create duplicate rows — today's re-run safety comes from the consumer-group cursor, not from
insert-time dedupe), autoscaling the worker on stream lag, a materialized view for hot dashboard
rollups, TTL-based retention on the log table, and Kubernetes deployment (the deferred bonus) with
health/readiness probes on each tier.
