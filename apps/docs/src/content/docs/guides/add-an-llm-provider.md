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

## Bring your own key (BYOK)

By default every chat call uses the shared `OPENROUTER_API_KEY` (the deployment owner's key). To
keep that from being an open tab, each user is capped at a **lifetime `SHARED_KEY_LIMIT_USD`** (default
`$1`) of spend on the shared key. Once they cross it, `/ai` returns `402` and the chat UI prompts them
to add their own key in **Settings**.

How it works:

- **Storage** — a user's own OpenRouter key is encrypted (AES-256-GCM, keyed by `BYOK_ENCRYPTION_KEY`)
  and stored in `user_keys.encrypted_key`; only the last 4 chars are ever shown back. See
  [Data models](/reference/data-models/).
- **Validation** — saving a key checks it starts with `sk-or-` and live-verifies it against
  OpenRouter's `/api/v1/key` endpoint, so a bad key fails at save time, not mid-chat.
- **Accounting** — the chat handler reads `user_keys.shared_spent_micro_usd` from PostgreSQL before
  each call (never ClickHouse, so the cap survives an analytics outage). Each event carries a `byok`
  flag; the worker accrues `cost_usd` into that counter **only for shared-key calls**. Calls made with
  a user's own key are self-billed and unmetered.
- **Soft cap** — the check is before-the-call and the debit is after, so a user right at the limit can
  overshoot slightly on their final call(s). Lower `SHARED_KEY_LIMIT_USD` to test the block quickly.

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
