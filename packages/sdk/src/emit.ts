import { env } from "@ollive/env/server";
import Redis from "ioredis";
import { type InferenceEvent, inferenceEventSchema, STREAM_KEY } from "./event";

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 2,
      // Stop retrying after a few attempts so a down Valkey fails fast instead of queueing forever.
      retryStrategy: (times) =>
        times > 3 ? null : Math.min(times * 200, 1000),
    });
    // Without a handler, ioredis connection errors surface as unhandled exceptions.
    client.on("error", (error) => {
      console.error("[ollive/sdk] valkey connection error", error);
    });
  }
  return client;
}

/**
 * Validate and append one inference event to the Valkey stream. Emission is best-effort: a stream
 * failure is logged and swallowed so logging never breaks the chat path. Schema violations DO throw,
 * since they indicate a programming error at the call site, not a transient outage.
 */
export async function emitEvent(event: InferenceEvent): Promise<string | null> {
  const parsed = inferenceEventSchema.parse(event);
  try {
    const id = await getClient().xadd(
      STREAM_KEY,
      "*",
      "data",
      JSON.stringify(parsed)
    );
    return id ?? null;
  } catch (error) {
    console.error("[ollive/sdk] failed to emit inference event", error);
    return null;
  }
}

/** Close the shared Valkey client. Intended for scripts and graceful shutdown. */
export async function closeEmitter(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
