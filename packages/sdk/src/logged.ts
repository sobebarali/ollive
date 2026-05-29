import { randomUUID } from "node:crypto";
import { env } from "@ollive/env/server";
import { emitEvent } from "./emit";
import type { InferenceEvent, InferenceStatus } from "./event";
import { redactPreview } from "./redact";

export interface LoggedContext {
  conversationId: string;
  /** Override the generated event id (e.g. to reuse a reserved id). */
  eventId?: string;
  /** Raw prompt text used to build the redacted input preview. */
  input?: string;
  messageId: string;
  /** Requested model id, e.g. "anthropic/claude-sonnet". */
  model: string;
  sessionId?: string;
  stream?: boolean;
  /** Provider for gen_ai.system, e.g. "openrouter". Defaults to "openrouter". */
  system?: string;
}

interface Usage {
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
}

export interface CallMetadata {
  inputTokens: number;
  outputTokens: number;
  responseModel?: string;
  text: string;
}

async function resolveMaybe<T>(value: T | Promise<T> | undefined) {
  return value === undefined ? undefined : await value;
}

export function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Best-effort metadata extraction from a provider response. Handles the Vercel AI SDK result shape
 * (text/usage/response, each value-or-promise). Step 6 wires the precise streaming hooks; here we
 * read whatever the call returned and fall back to zeros so logging never throws.
 */
async function readMetadata(result: unknown): Promise<CallMetadata> {
  if (!result || typeof result !== "object") {
    return { text: "", inputTokens: 0, outputTokens: 0 };
  }
  const record = result as Record<string, unknown>;
  const text =
    (await resolveMaybe(record.text as string | Promise<string>)) ?? "";
  const usage =
    ((await resolveMaybe(record.usage as Usage | Promise<Usage>)) as Usage) ??
    {};
  const response =
    ((await resolveMaybe(
      record.response as
        | Record<string, unknown>
        | Promise<Record<string, unknown>>
    )) as Record<string, unknown>) ?? {};
  return {
    text: String(text),
    responseModel: (response.modelId ?? response.model) as string | undefined,
    inputTokens: toCount(usage.inputTokens ?? usage.promptTokens),
    outputTokens: toCount(usage.outputTokens ?? usage.completionTokens),
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

export function errorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "Error" ? error.message : error.name;
  }
  return "unknown";
}

export interface FinalizeArgs {
  context: LoggedContext;
  errorType?: string;
  eventId: string;
  meta?: CallMetadata;
  startedAt: number;
  startTime: string;
  status: InferenceStatus;
  ttftMs?: number;
}

export function finalize(args: FinalizeArgs): void {
  const enabled = env.PII_REDACTION === "on";
  const maxChars = env.LOG_PREVIEW_CHARS;
  const event: InferenceEvent = {
    event_id: args.eventId,
    conversation_id: args.context.conversationId,
    message_id: args.context.messageId,
    session_id: args.context.sessionId,
    "gen_ai.system": args.context.system ?? "openrouter",
    "gen_ai.request.model": args.context.model,
    "gen_ai.response.model": args.meta?.responseModel,
    "gen_ai.usage.input_tokens": args.meta?.inputTokens ?? 0,
    "gen_ai.usage.output_tokens": args.meta?.outputTokens ?? 0,
    latency_ms: Math.round(performance.now() - args.startedAt),
    time_to_first_token_ms: args.ttftMs,
    stream: args.context.stream ?? false,
    status: args.status,
    "error.type": args.errorType,
    input_preview: redactPreview(args.context.input ?? "", {
      maxChars,
      enabled,
    }),
    output_preview: redactPreview(args.meta?.text ?? "", { maxChars, enabled }),
    start_time: args.startTime,
  };
  // Fire-and-forget: emit after the caller has its result so the call site is not slowed.
  emitEvent(event).catch((error) => {
    console.error("[ollive/sdk] failed to finalize inference event", error);
  });
}

/**
 * Wrap an LLM call so latency, token usage, status, and redacted previews are captured and emitted
 * to the Valkey stream — without logging code at the call site. The wrapper returns whatever `fn`
 * returns; the event is emitted after the result is ready (on success) or on error/cancellation.
 */
export async function logged<T>(
  context: LoggedContext,
  fn: () => T | Promise<T>
): Promise<T> {
  const eventId = context.eventId ?? randomUUID();
  const startTime = new Date().toISOString();
  const startedAt = performance.now();
  try {
    const result = await fn();
    const ttftMs = context.stream
      ? Math.round(performance.now() - startedAt)
      : undefined;
    const meta = await readMetadata(result);
    finalize({
      context,
      eventId,
      startTime,
      startedAt,
      status: "success",
      meta,
      ttftMs,
    });
    return result;
  } catch (error) {
    finalize({
      context,
      eventId,
      startTime,
      startedAt,
      status: isAbortError(error) ? "cancelled" : "error",
      errorType: errorType(error),
    });
    throw error;
  }
}
