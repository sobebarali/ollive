---
title: Add an LLM provider
description: Make a new model or provider available to the chatbot.
---

This guide shows how to add support for another model or provider. Because we route through
OpenRouter behind the Vercel AI SDK, "adding a provider" is usually just exposing another model
id — no per-provider plumbing.

## Goal

Let users pick a new model in the chat UI and have its calls logged like any other.

## The common case: a new model via OpenRouter

**There is nothing to do.** The model picker is populated live from OpenRouter's public
[`/api/v1/models`](https://openrouter.ai/docs/api-reference/list-available-models) endpoint
(`packages/api/src/models.ts`, fetched and cached in-process), so any model OpenRouter offers is
already selectable by its `provider/model` id.

Validation is dynamic too: `isAllowedModel` checks the requested id against the live list, so the
chat API and `conversation.create` accept exactly the models OpenRouter currently serves.

### Pricing is automatic

`cost_usd` is derived in the worker from the per-token `pricing` (`prompt`/`completion`) that
OpenRouter reports for each model — there is no hand-maintained pricing table. A model OpenRouter
prices at `0` (or one it stops listing) derives to `cost_usd = 0` rather than failing ingestion.
Cost is derived in the worker, not the SDK — see the
[schema reference](/reference/inference-log-schema/).

That's it. The model appears in the picker, calls route through the existing wrapper, and events
carry `gen_ai.system = "openrouter"` with the selected `gen_ai.request.model`.

## The rarer case: a provider not behind OpenRouter

If you need to call a provider directly (e.g. a self-hosted model), add it as a Vercel AI SDK
provider and tag the event's `gen_ai.system` accordingly:

1. Install the provider package and configure its API key in `packages/env`
   (see [Configuration](/reference/configuration/)).
2. Register it in the chat handler's provider map.
3. Ensure the wrapper sets `gen_ai.system` to the provider name so dashboards can group by it.

## Verify

Select the new model in the UI, send a message, then confirm it logged:

```sql
SELECT gen_ai_system, gen_ai_request_model, count()
FROM inference_logs
WHERE gen_ai_request_model = 'deepseek/deepseek-chat'
GROUP BY gen_ai_system, gen_ai_request_model;
```
