---
title: Architecture Overview
description: How the chatbot, logging SDK, ingestion pipeline, and storage fit together.
---

This page explains the shape of the system and *why* it is split the way it is. It is
understanding-oriented: for step-by-step setup see the
[Run the system locally](/tutorials/run-the-system-locally/) tutorial, and for exact field
names see the [Inference log schema](/reference/inference-log-schema/).

## The problem

We need to run a multi-turn chatbot *and* capture rich inference metadata (model, provider,
latency, token usage, status, conversation id, input/output previews) for every LLM call —
without the logging path ever slowing down or breaking the user's chat.

That single sentence forces the central design decision: **logging must be decoupled from the
request path**. The chat response and the durable log are produced by two different timelines.

## The four parts

```text
┌─────────────┐   1. chat (SSE stream)    ┌──────────────────────────┐
│   Web app   │ ─────────────────────────▶│  Chat API (Hono + oRPC)  │
│ (TanStack)  │ ◀──── tokens stream ──────│  wraps the LLM via SDK   │
└─────────────┘                           └────────────┬─────────────┘
      ▲                                                 │ 2. emit inference event
      │ 5. dashboards / history                         ▼
      │                                   ┌──────────────────────────┐
      │                                   │  Valkey Stream (buffer)  │
      │                                   └────────────┬─────────────┘
      │                                                │ 3. consume
      │                                   ┌──────────────────────────┐
      │                                   │  Ingestion worker        │
      │                                   │  validate → redact → map │
      │                                   └──────┬──────────┬────────┘
      │                                          │          │ 4. store
      │                  ┌───────────────────────▼──┐   ┌───▼─────────────────────┐
      └──────────────────│ PostgreSQL               │   │ ClickHouse              │
                         │ conversations, messages  │   │ inference_logs (OLAP)   │
                         └──────────────────────────┘   └─────────────────────────┘
```

1. **Chatbot application** — React + TanStack Router talking to a Hono/oRPC endpoint that
   streams tokens back over Server-Sent Events.
2. **Logging SDK** (`packages/sdk`) — a thin wrapper around the LLM call. It measures latency,
   reads token usage, builds a structured event, redacts PII, and pushes it to the buffer. It
   never blocks the chat response.
3. **Event buffer** — a Valkey (open-source Redis) stream that absorbs bursts and lets the chat
   request return immediately while the log is processed asynchronously.
4. **Ingestion worker** — consumes events, validates them against a schema, extracts metadata,
   and writes them to durable storage.
5. **Storage** — a deliberate split: documents for conversational data, columnar for analytics.

## Why two databases

This is the most important tradeoff in the system, covered in full on
[Schema design & tradeoffs](/explanation/schema-design-and-tradeoffs/). In short:

- **PostgreSQL** stores conversations and messages. This OLTP data has clear relational
  boundaries and benefits from constraints, indexes, and joins.
- **ClickHouse** stores inference logs. The dashboards (latency / throughput / errors over
  time) are time-bucketed aggregations over a high-volume, append-only table — exactly the
  workload a columnar OLAP database is built for, and exactly where OLTP stores are slowest.

## Why an event in the middle

A naïve design writes the log inline, right after the LLM call returns. That couples three
failure domains: a slow or down database would add latency to — or break — the user's chat.

Putting a stream between the SDK and storage means the chat path only has to do one cheap thing
(append to the buffer) and can return. The worker drains the buffer at its own pace, retries on
failure, and can be scaled independently. This is the **event-based architecture** the brief
asks for, and it is the same pattern production observability tools (e.g. Langfuse) use:
*receive fast, persist later*.

## What this design intentionally is not

This is a **purpose-built, lean** logging system, not a re-deployment of an off-the-shelf
observability platform. We model our event schema on the OpenTelemetry GenAI semantic
conventions so it stays interoperable, but we own the ingestion path end to end — that is the
part worth demonstrating, and the part we can reason about for scaling and failure handling.
