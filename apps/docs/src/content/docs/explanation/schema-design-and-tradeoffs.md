---
title: Schema Design & Tradeoffs
description: Why conversational data lives in PostgreSQL and inference logs live in ClickHouse.
---

This page explains the data-modelling decisions and the tradeoffs we accepted. For the concrete
field lists, see [Data models](/reference/data-models/) and
[Inference log schema](/reference/inference-log-schema/).

## The two workloads

The system has two data shapes with opposite access patterns:

| | Conversational data | Inference logs |
|---|---|---|
| Examples | conversations, messages | one record per LLM call |
| Write pattern | low volume, updated in place | high volume, append-only |
| Read pattern | fetch a thread by id | aggregate over time ranges |
| Shape | nested, variable | flat, uniform |
| Best fit | document store | columnar OLAP |

Trying to serve both from one engine means accepting a poor fit for one of them. We split them.

## Why PostgreSQL for conversations and messages

- Conversations and messages have stable relational boundaries (`users -> conversations ->
  messages`), and SQL joins plus indexes make these reads predictable as data grows.
- Strong constraints (foreign keys, cascades, uniqueness) protect integrity for chat history and
  auth-related data.
- The stack is scaffolded with Drizzle on PostgreSQL, so operationally this keeps OLTP concerns in
  one well-supported relational store.

## Why ClickHouse for inference logs

- The dashboards are time-bucketed aggregations (`avg(latency)` per minute, `count()` by
  status, throughput per hour) over a table that grows with every single LLM call. Columnar
  storage reads only the columns an aggregate touches, so these stay fast as the table grows
  into the millions of rows.
- Logs are append-only and never updated — a perfect match for ClickHouse's `MergeTree` engine.
- A row-store OLTP database is the wrong tool here: the same filtered time-series query that a
  columnar/time-series engine answers quickly becomes expensive in PostgreSQL at larger analytic
  volumes.

## Modelling the log on a standard

Rather than invent field names, the inference log mirrors the **OpenTelemetry GenAI semantic
conventions** (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, etc.). Benefits:

- It is interoperable — the same events could be shipped to any OTel backend later.
- It signals industry awareness and avoids bikeshedding field names.
- The convention already enumerates exactly the metadata the brief lists (model, provider,
  tokens, latency, status), so the schema almost writes itself.

## Tradeoffs we accepted

- **Two databases instead of one.** More moving parts to run and back up, in exchange for each
  workload running on the right engine and dashboards staying fast. Mitigated by Docker Compose
  bundling both.
- **Two engines to operate.** PostgreSQL and ClickHouse each need migrations, backups, and
  monitoring. We accept this complexity because each workload runs on the right storage shape.
- **Eventual consistency between stores.** A message in PostgreSQL and its inference log in
  ClickHouse are written at slightly different times via the worker. We accept a brief window
  where a message exists but its log has not landed yet — fine for analytics, and the message id
  links the two once it does.
- **Previews, not full payloads.** We store truncated input/output previews plus token counts,
  not full prompt/response bodies, to bound storage growth and shrink the PII surface.

## What we would change with more scale

Partition/TTL the ClickHouse table by day for cheap retention windows, add S3 (or compatible)
blob storage for full payloads referenced by id, and introduce a materialized view for the
hottest dashboard rollups. See [Scaling & failure handling](/explanation/scaling-and-failure-handling/).
