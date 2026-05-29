import { randomUUID } from "node:crypto";
import { closeEmitter, emitEvent, type InferenceEvent } from "../src/index";

/**
 * Smoke check for Step 4: emit one valid inference event to Valkey and print the stream id.
 * Run with `bun run packages/sdk/scripts/emit-sample.ts` against a local Valkey (docker compose).
 */
const event: InferenceEvent = {
  event_id: randomUUID(),
  conversation_id: randomUUID(),
  message_id: randomUUID(),
  session_id: "smoke-session",
  "gen_ai.system": "openrouter",
  "gen_ai.request.model": "anthropic/claude-sonnet",
  "gen_ai.response.model": "claude-3-5-sonnet",
  "gen_ai.usage.input_tokens": 412,
  "gen_ai.usage.output_tokens": 188,
  latency_ms: 2310,
  time_to_first_token_ms: 540,
  stream: true,
  status: "success",
  input_preview: "Summarise the attached report",
  output_preview: "The report covers three themes",
  start_time: new Date().toISOString(),
};

const id = await emitEvent(event);
if (id) {
  console.log(`emitted inference event ${event.event_id} to stream id ${id}`);
} else {
  console.error("emit failed (is Valkey running on REDIS_URL?)");
  process.exitCode = 1;
}
await closeEmitter();
