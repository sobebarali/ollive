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

### 1. Add the model id to the allow-list

Models are referenced by their OpenRouter id (`provider/model`). Add it to the list the API
exposes to the UI:

```ts
export const MODELS = [
  "anthropic/claude-sonnet",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat", // ← new
] as const;
```

### 2. (Optional) add pricing for cost derivation

If you want `cost_usd` populated for the new model, add its token prices to the worker's pricing
table:

```ts
const PRICING = {
  "deepseek/deepseek-chat": { input: 0.27, output: 1.1 }, // USD per 1M tokens
};
```

Cost is derived in the worker, not the SDK — see the
[schema reference](/reference/inference-log-schema/).

That's it. The model appears in the picker, calls route through the existing wrapper, and events
carry `gen_ai.system = "openrouter"` with the new `gen_ai.request.model`.

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
