import { describe, expect, it } from "bun:test";
import { inferenceEventSchema } from "./event";

const validEvent = {
  event_id: "0e3b1f2c-1111-4abc-8def-0123456789ab",
  conversation_id: "a91c2d3e-2222-4abc-8def-0123456789ab",
  message_id: "77f23a4b-3333-4abc-8def-0123456789ab",
  session_id: "sess-1",
  "gen_ai.system": "openrouter",
  "gen_ai.request.model": "anthropic/claude-sonnet",
  "gen_ai.response.model": "claude-3-5-sonnet",
  "gen_ai.usage.input_tokens": 412,
  "gen_ai.usage.output_tokens": 188,
  latency_ms: 2310,
  time_to_first_token_ms: 540,
  stream: true,
  status: "success" as const,
  input_preview: "Summarise the attached report",
  output_preview: "The report covers three themes",
  start_time: "2026-05-27T18:04:11.220Z",
};

describe("inferenceEventSchema", () => {
  it("accepts a fully-populated event", () => {
    expect(inferenceEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejects an event missing a required field", () => {
    const { conversation_id, ...withoutConversation } = validEvent;
    expect(inferenceEventSchema.safeParse(withoutConversation).success).toBe(
      false
    );
  });

  it("rejects an unknown status", () => {
    const bad = { ...validEvent, status: "weird" };
    expect(inferenceEventSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts success, error, and cancelled statuses", () => {
    for (const status of ["success", "error", "cancelled"] as const) {
      const event = { ...validEvent, status };
      expect(inferenceEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("accepts a minimal event without optional fields", () => {
    const minimal = {
      event_id: validEvent.event_id,
      conversation_id: validEvent.conversation_id,
      message_id: validEvent.message_id,
      "gen_ai.system": "openrouter",
      "gen_ai.request.model": "anthropic/claude-sonnet",
      "gen_ai.usage.input_tokens": 1,
      "gen_ai.usage.output_tokens": 1,
      latency_ms: 100,
      stream: false,
      status: "error" as const,
      "error.type": "rate_limit",
      input_preview: "hi",
      output_preview: "",
      start_time: "2026-05-27T18:04:11.220Z",
    };
    expect(inferenceEventSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects a negative token count", () => {
    const bad = { ...validEvent, "gen_ai.usage.input_tokens": -1 };
    expect(inferenceEventSchema.safeParse(bad).success).toBe(false);
  });
});
