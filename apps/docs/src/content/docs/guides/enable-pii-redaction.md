---
title: Enable PII redaction
description: Strip personal data from input/output previews before they are stored.
---

This guide shows how to configure PII redaction so prompt and completion previews never persist
raw personal data. Redaction runs inside the SDK, **before** an event leaves the process — so
raw PII never touches the stream or storage.

## Goal

Ensure `input_preview` and `output_preview` in every
[inference event](/reference/inference-log-schema/) have emails, phone numbers, and similar
identifiers masked.

## Steps

### 1. Confirm redaction is on

It is on by default. The toggle lives in [configuration](/reference/configuration/):

```bash
PII_REDACTION=on        # default; set to "off" only for local debugging
LOG_PREVIEW_CHARS=200   # previews are truncated to this length after redaction
```

### 2. Understand what is redacted

The default redactor masks common patterns before truncation:

| Pattern | Example in → stored |
|---|---|
| Email | `ada@acme.com` → `[EMAIL]` |
| Phone | `+1 415 555 0132` → `[PHONE]` |
| Credit-card-like | `4111 1111 1111 1111` → `[CARD]` |
| Long digit runs | account/SSN-like → `[NUMBER]` |
| Bearer token | `Bearer eyJhbGci...` → `[BEARER_TOKEN]` |
| API key | `sk-...`, `AKIA...` → `[API_KEY]` |

The same redactor and `LOG_PREVIEW_CHARS` truncation also run over the stored `error.message`
(the provider's error body from an AI SDK `APICallError`), since failure responses can echo the
prompt, request URLs, or key fragments. Error messages get the same protection as previews.

### 3. Add a custom rule

Redaction rules are plain functions, applied in order. To add one, register it where the
redactor is configured in `packages/sdk`:

```ts
const redactors = [
  ...defaultRedactors,
  (text: string) => text.replace(/\bEMP-\d{6}\b/g, "[EMPLOYEE_ID]"),
];
```

:::caution
Define regexes once at module scope, not inside the redaction function — building them per call
is wasteful on a hot path.
:::

## Verify

Send a message containing an email, then check the stored preview is masked:

```sql
SELECT input_preview
FROM inference_logs
ORDER BY start_time DESC
LIMIT 1;
-- expect: "... contact me at [EMAIL] ..."
```

## Why redact in the SDK, not the worker

Redacting at the source means raw PII is never written to the Valkey stream and never leaves the
application process. If we redacted in the worker instead, unmasked data would sit in the buffer
in the meantime — a needless exposure window. This is the
[logging strategy](/explanation/logging-and-ingestion-flow/) applied to privacy.
