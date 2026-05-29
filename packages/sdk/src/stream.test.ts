import { beforeEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";
import { APICallError } from "ai";
import { config } from "dotenv";
import type { InferenceEvent } from "./event";

// Capture emitted events instead of writing to Valkey. Load the real server env (only PII_REDACTION
// and LOG_PREVIEW_CHARS are read here) rather than mocking it, so this file does not override the
// env module for other test files when the whole suite runs in one process.
const emitted: InferenceEvent[] = [];

mock.module("./emit", () => ({
  emitEvent: (event: InferenceEvent) => {
    emitted.push(event);
    return Promise.resolve("1-0");
  },
  closeEmitter: () => Promise.resolve(),
}));

config({ path: path.resolve(import.meta.dir, "../../../apps/server/.env") });

const { streamLogger } = await import("./stream");

const baseContext = {
  conversationId: "11111111-1111-4111-8111-111111111111",
  messageId: "22222222-2222-4222-8222-222222222222",
  eventId: "33333333-3333-4333-8333-333333333333",
  model: "openai/gpt-4.1",
  input: "hello there",
};

beforeEach(() => {
  emitted.length = 0;
});

describe("streamLogger", () => {
  it("emits a success event with usage, response model, and previews", () => {
    const logger = streamLogger(baseContext);
    logger.onFinish({
      text: "the answer",
      totalUsage: { inputTokens: 12, outputTokens: 34 },
      response: { modelId: "openai/gpt-4.1-2025" },
    });

    expect(emitted).toHaveLength(1);
    const event = emitted[0];
    expect(event.status).toBe("success");
    expect(event.stream).toBe(true);
    expect(event.event_id).toBe(baseContext.eventId);
    expect(event["gen_ai.usage.input_tokens"]).toBe(12);
    expect(event["gen_ai.usage.output_tokens"]).toBe(34);
    expect(event["gen_ai.response.model"]).toBe("openai/gpt-4.1-2025");
    expect(event.output_preview).toContain("the answer");
    expect(event.input_preview).toContain("hello there");
  });

  it("records time to first token on the first text-delta only", () => {
    const logger = streamLogger(baseContext);
    logger.onChunk({ chunk: { type: "text-delta", text: "a" } });
    logger.onChunk({ chunk: { type: "text-delta", text: "b" } });
    logger.onFinish({ text: "ab" });

    expect(emitted[0].time_to_first_token_ms).toBeGreaterThanOrEqual(0);
  });

  it("coalesces missing token usage to zero", () => {
    const logger = streamLogger(baseContext);
    logger.onFinish({ text: "" });

    expect(emitted[0]["gen_ai.usage.input_tokens"]).toBe(0);
    expect(emitted[0]["gen_ai.usage.output_tokens"]).toBe(0);
  });

  it("accumulates streamed deltas and persists them as partial text on abort", () => {
    const logger = streamLogger(baseContext);
    logger.onChunk({ chunk: { type: "text-delta", text: "partial " } });
    logger.onChunk({ chunk: { type: "text-delta", text: "answer" } });
    expect(logger.partialText()).toBe("partial answer");

    logger.onAbort({ steps: [] });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].status).toBe("cancelled");
    expect(emitted[0].output_preview).toContain("partial answer");
  });

  it("falls back to completed step text on abort when no deltas streamed", () => {
    const logger = streamLogger(baseContext);
    logger.onAbort({ steps: [{ text: "step text" }] });

    expect(emitted[0].status).toBe("cancelled");
    expect(emitted[0].output_preview).toContain("step text");
  });

  it("classifies a thrown error as error with an error type", () => {
    const logger = streamLogger(baseContext);
    logger.onError({ error: new RangeError("context length exceeded") });

    expect(emitted[0].status).toBe("error");
    expect(emitted[0]["error.type"]).toBe("RangeError");
  });

  it("captures the raw error message on error", () => {
    const logger = streamLogger(baseContext);
    logger.onError({ error: new RangeError("context length exceeded") });

    expect(emitted[0].status).toBe("error");
    expect(emitted[0]["error.message"]).toContain("context length exceeded");
  });

  it("omits the error message on success", () => {
    const logger = streamLogger(baseContext);
    logger.onFinish({ text: "done" });

    expect(emitted[0]["error.message"]).toBeUndefined();
  });

  it("extracts status code and response body from an AI SDK APICallError", () => {
    const logger = streamLogger(baseContext);
    const error = new APICallError({
      message: "Rate limited",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: '{"error":{"message":"rate limit exceeded"}}',
    });
    logger.onError({ error });

    expect(emitted[0].status).toBe("error");
    expect(emitted[0]["error.type"]).toBe("AI_APICallError");
    expect(emitted[0]["error.status_code"]).toBe(429);
    expect(emitted[0]["error.message"]).toContain("rate limit exceeded");
  });

  it("classifies an abort error as cancelled", () => {
    const logger = streamLogger(baseContext);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    logger.onError({ error: abort });

    expect(emitted[0].status).toBe("cancelled");
  });

  it("emits exactly once even if finish and error both fire", () => {
    const logger = streamLogger(baseContext);
    logger.onFinish({ text: "done" });
    logger.onError({ error: new Error("late") });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].status).toBe("success");
  });
});
