import { createClient } from "@clickhouse/client";
import { getModelPrice } from "@ollive/api/models";
import { db } from "@ollive/db";
import { messages } from "@ollive/db/schema/conversation";
import { env } from "@ollive/env/server";
import {
  type InferenceEvent,
  inferenceEventSchema,
  STREAM_KEY,
} from "@ollive/sdk";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import { classifyError } from "./worker/error-class";
import { deriveCost } from "./worker/pricing";

const GROUP = "ingestion";
const CONSUMER = "worker-1";
const DEAD_STREAM = "inference:events:dead";
const WRITE_DEAD_STREAM = "inference:events:dead:write";
const INSERT_MAX_ATTEMPTS = 5;
const INSERT_BACKOFF_MS = 200;

type StreamEntry = [id: string, fields: string[]];
type StreamRead = [stream: string, entries: StreamEntry[]][];

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const clickhouse = createClient({ url: env.CLICKHOUSE_URL });

let running = true;

/** ClickHouse expects DateTime64 as `YYYY-MM-DD HH:MM:SS.sss`, not ISO with `T`/`Z`. */
function toClickHouseTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", "");
}

async function toRow(event: InferenceEvent) {
  const requestModel = event["gen_ai.request.model"];
  const responseModel = event["gen_ai.response.model"] ?? "";
  const price = await getModelPrice(requestModel);
  return {
    event_id: event.event_id,
    conversation_id: event.conversation_id,
    message_id: event.message_id,
    session_id: event.session_id ?? "",
    gen_ai_system: event["gen_ai.system"],
    gen_ai_request_model: requestModel,
    gen_ai_response_model: responseModel,
    input_tokens: event["gen_ai.usage.input_tokens"],
    output_tokens: event["gen_ai.usage.output_tokens"],
    latency_ms: event.latency_ms,
    time_to_first_token_ms: event.time_to_first_token_ms ?? null,
    stream: event.stream,
    status: event.status,
    error_type:
      event.status === "error"
        ? classifyError(
            event["error.type"],
            event["error.status_code"],
            event["error.message"]
          )
        : "",
    error_message:
      event.status === "error" ? (event["error.message"] ?? "") : "",
    error_status:
      event.status === "error" ? (event["error.status_code"] ?? 0) : 0,
    input_preview: event.input_preview,
    output_preview: event.output_preview,
    // Price by the requested model id; OpenRouter keys its pricing on that id, while the
    // provider-resolved response model carries version suffixes that rarely match.
    cost_usd: deriveCost(
      price,
      event["gen_ai.usage.input_tokens"],
      event["gen_ai.usage.output_tokens"]
    ),
    start_time: toClickHouseTime(event.start_time),
  };
}

// Mirrors infra/clickhouse/001_inference_logs.sql (run by docker-compose locally). Applied on boot
// so managed ClickHouse instances without the init-mount get the table too. Keep the two in sync.
const INFERENCE_LOGS_DDL = `CREATE TABLE IF NOT EXISTS inference_logs (
  event_id              UUID,
  conversation_id       UUID,
  message_id            UUID,
  session_id            String,
  gen_ai_system         LowCardinality(String),
  gen_ai_request_model  LowCardinality(String),
  gen_ai_response_model LowCardinality(String),
  input_tokens          UInt32,
  output_tokens         UInt32,
  latency_ms            UInt32,
  time_to_first_token_ms Nullable(UInt32),
  stream                Bool,
  status                LowCardinality(String),
  error_type            String DEFAULT '',
  error_message         String DEFAULT '',
  error_status          UInt16 DEFAULT 0,
  input_preview         String,
  output_preview        String,
  cost_usd              Float64 DEFAULT 0,
  start_time            DateTime64(3, 'UTC'),
  created_at            DateTime64(3, 'UTC') DEFAULT now64()
)
ENGINE = MergeTree
PARTITION BY toDate(start_time)
ORDER BY (gen_ai_system, gen_ai_request_model, start_time)`;

// Idempotent migrations for tables created before a column existed. CREATE TABLE IF NOT EXISTS does
// not add columns to an existing table, so back-fill them here on boot.
const INFERENCE_LOGS_MIGRATIONS = [
  "ALTER TABLE inference_logs ADD COLUMN IF NOT EXISTS error_message String DEFAULT '' AFTER error_type",
  "ALTER TABLE inference_logs ADD COLUMN IF NOT EXISTS error_status UInt16 DEFAULT 0 AFTER error_message",
];

async function ensureSchema(): Promise<void> {
  await clickhouse.command({ query: INFERENCE_LOGS_DDL });
  for (const query of INFERENCE_LOGS_MIGRATIONS) {
    await clickhouse.command({ query });
  }
}

async function ensureGroup(): Promise<void> {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, GROUP, "$", "MKSTREAM");
  } catch (error) {
    // BUSYGROUP means the group already exists; any other error is fatal.
    if (!(error instanceof Error && error.message.includes("BUSYGROUP"))) {
      throw error;
    }
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function insertWithRetry(
  rows: Awaited<ReturnType<typeof toRow>>[]
): Promise<boolean> {
  for (let attempt = 1; attempt <= INSERT_MAX_ATTEMPTS; attempt++) {
    try {
      await clickhouse.insert({
        table: "inference_logs",
        values: rows,
        format: "JSONEachRow",
      });
      return true;
    } catch (error) {
      console.error(
        `[ollive/worker] clickhouse insert attempt ${attempt} failed`,
        error
      );
      if (attempt < INSERT_MAX_ATTEMPTS) {
        await sleep(INSERT_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }
  return false;
}

/** Link each stored event back to its PostgreSQL message. Best-effort; never blocks the ack. */
async function linkMessages(events: InferenceEvent[]): Promise<void> {
  await Promise.all(
    events.map(async (event) => {
      try {
        await db
          .update(messages)
          .set({ inferenceEventId: event.event_id })
          .where(eq(messages.id, event.message_id));
      } catch (error) {
        console.error(
          `[ollive/worker] failed to link message ${event.message_id}`,
          error
        );
      }
    })
  );
}

async function processBatch(entries: StreamEntry[]): Promise<void> {
  const ackIds: string[] = [];
  const valid: { id: string; event: InferenceEvent }[] = [];

  for (const [id, fields] of entries) {
    const dataIndex = fields.indexOf("data");
    const raw = dataIndex >= 0 ? fields[dataIndex + 1] : undefined;
    const parsed = safeParse(raw);
    if (parsed.ok) {
      valid.push({ id, event: parsed.event });
    } else {
      await redis.xadd(
        DEAD_STREAM,
        "*",
        "data",
        raw ?? "",
        "error",
        parsed.error
      );
      ackIds.push(id);
    }
  }

  if (valid.length > 0) {
    const rows = await Promise.all(valid.map(({ event }) => toRow(event)));
    const inserted = await insertWithRetry(rows);
    if (inserted) {
      await linkMessages(valid.map(({ event }) => event));
    } else {
      // Retries exhausted: park the batch in the write DLQ so the main stream is not blocked.
      for (const { event } of valid) {
        await redis.xadd(WRITE_DEAD_STREAM, "*", "data", JSON.stringify(event));
      }
    }
    for (const { id } of valid) {
      ackIds.push(id);
    }
  }

  if (ackIds.length > 0) {
    await redis.xack(STREAM_KEY, GROUP, ...ackIds);
  }
}

function safeParse(
  raw: string | undefined
): { ok: true; event: InferenceEvent } | { ok: false; error: string } {
  if (!raw) {
    return { ok: false, error: "missing data field" };
  }
  try {
    const event = inferenceEventSchema.parse(JSON.parse(raw));
    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "invalid",
    };
  }
}

async function run(): Promise<void> {
  await ensureSchema();
  await ensureGroup();
  console.log(
    `[ollive/worker] consuming ${STREAM_KEY} as ${GROUP}/${CONSUMER} (batch ${env.INGESTION_BATCH_SIZE}, flush ${env.INGESTION_FLUSH_MS}ms)`
  );
  while (running) {
    const result = (await redis.xreadgroup(
      "GROUP",
      GROUP,
      CONSUMER,
      "COUNT",
      env.INGESTION_BATCH_SIZE,
      "BLOCK",
      env.INGESTION_FLUSH_MS,
      "STREAMS",
      STREAM_KEY,
      ">"
    )) as StreamRead | null;
    if (!result) {
      continue;
    }
    for (const [, entries] of result) {
      await processBatch(entries);
    }
  }
}

async function shutdown(): Promise<void> {
  running = false;
  await redis.quit();
  await clickhouse.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown()
      .catch((error) => console.error("[ollive/worker] shutdown error", error))
      .finally(() => process.exit(0));
  });
}

run().catch((error) => {
  console.error("[ollive/worker] fatal", error);
  process.exit(1);
});
