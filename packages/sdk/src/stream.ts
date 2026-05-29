import { randomUUID } from "node:crypto";
import type { InferenceStatus } from "./event";
import {
  type CallMetadata,
  errorMessage,
  errorStatus,
  errorType,
  finalize,
  isAbortError,
  type LoggedContext,
  toCount,
} from "./logged";

interface StreamChunk {
  text?: string;
  type: string;
}

interface StreamStep {
  text?: string;
}

interface StreamFinishEvent {
  response?: { modelId?: string; model?: string };
  text?: string;
  totalUsage?: { inputTokens?: number; outputTokens?: number };
}

export interface StreamLogger {
  /** Reserved event id; also use it for the assistant message's inferenceEventId. */
  eventId: string;
  onAbort: (event: { steps?: StreamStep[] }) => void;
  onChunk: (event: { chunk: StreamChunk }) => void;
  onError: (event: { error: unknown }) => void;
  onFinish: (event: StreamFinishEvent) => void;
  /** Text accumulated from streamed deltas so far — the partial response to persist on cancel. */
  partialText: () => string;
}

/** Join the text of completed steps into the partial response captured at abort time. */
export function stepsText(steps: StreamStep[] | undefined): string {
  return (steps ?? []).map((step) => step.text ?? "").join("");
}

/**
 * Streaming counterpart to {@link logged}. Wire the returned callbacks into the AI SDK `streamText`
 * call so latency, time to first token, token usage, status, and redacted previews are captured and
 * emitted as one inference event when the stream finishes, is aborted, or errors. Exactly one event
 * is emitted regardless of which callbacks fire.
 */
export function streamLogger(context: LoggedContext): StreamLogger {
  const eventId = context.eventId ?? randomUUID();
  const startTime = new Date().toISOString();
  const startedAt = performance.now();
  const streamContext: LoggedContext = { ...context, stream: true };
  let ttftMs: number | undefined;
  let partial = "";
  let emitted = false;

  function emit(
    status: InferenceStatus,
    extra: {
      meta?: CallMetadata;
      errorType?: string;
      errorMessage?: string;
      errorStatus?: number;
    }
  ): void {
    if (emitted) {
      return;
    }
    emitted = true;
    finalize({
      context: streamContext,
      eventId,
      startTime,
      startedAt,
      status,
      ttftMs,
      meta: extra.meta,
      errorType: extra.errorType,
      errorMessage: extra.errorMessage,
      errorStatus: extra.errorStatus,
    });
  }

  return {
    eventId,
    partialText: () => partial,
    onChunk({ chunk }) {
      if (chunk.type === "text-delta") {
        if (ttftMs === undefined) {
          ttftMs = Math.round(performance.now() - startedAt);
        }
        partial += chunk.text ?? "";
      }
    },
    onFinish(event) {
      emit("success", {
        meta: {
          text: event.text ?? "",
          inputTokens: toCount(event.totalUsage?.inputTokens),
          outputTokens: toCount(event.totalUsage?.outputTokens),
          responseModel: event.response?.modelId ?? event.response?.model,
        },
      });
    },
    onAbort(event) {
      // Prefer text accumulated from deltas; fall back to completed steps. The in-flight step's
      // partial text is not in `steps`, so the delta buffer is what captures a mid-stream cancel.
      emit("cancelled", {
        meta: {
          text: partial || stepsText(event.steps),
          inputTokens: 0,
          outputTokens: 0,
        },
      });
    },
    onError({ error }) {
      const aborted = isAbortError(error);
      emit(aborted ? "cancelled" : "error", {
        errorType: errorType(error),
        errorMessage: aborted ? undefined : errorMessage(error),
        errorStatus: aborted ? undefined : errorStatus(error),
      });
    },
  };
}
