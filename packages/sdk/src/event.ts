import { z } from "zod";

/** Valkey stream that buffers inference events between the SDK and the worker. */
export const STREAM_KEY = "inference:events";

const uint32 = z.number().int().nonnegative();

/**
 * The single structured event emitted for every LLM call. Field names follow the OpenTelemetry
 * GenAI semantic conventions on the wire; the worker maps the dotted keys to ClickHouse columns.
 * `cost_usd` and `created_at` are derived by the worker and are intentionally absent here.
 */
export const inferenceEventSchema = z.object({
  event_id: z.uuid(),
  conversation_id: z.uuid(),
  message_id: z.uuid(),
  session_id: z.string().optional(),
  "gen_ai.system": z.string().min(1),
  "gen_ai.request.model": z.string().min(1),
  "gen_ai.response.model": z.string().optional(),
  "gen_ai.usage.input_tokens": uint32,
  "gen_ai.usage.output_tokens": uint32,
  latency_ms: uint32,
  time_to_first_token_ms: uint32.optional(),
  stream: z.boolean(),
  status: z.enum(["success", "error", "cancelled"]),
  "error.type": z.string().optional(),
  "error.message": z.string().optional(),
  "error.status_code": uint32.optional(),
  input_preview: z.string(),
  output_preview: z.string(),
  start_time: z.iso.datetime(),
  /** True when the call used the user's own API key. Such calls are self-billed and the worker does
   * not count them against the shared free-tier cap. Optional so older queued events still parse. */
  byok: z.boolean().optional(),
});

export type InferenceEvent = z.infer<typeof inferenceEventSchema>;
export type InferenceStatus = InferenceEvent["status"];
