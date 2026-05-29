-- Inference log analytics storage.
-- Mounted into the ClickHouse container at /docker-entrypoint-initdb.d and run
-- automatically on first startup (empty data dir). Schema is the source of
-- truth alongside apps/docs/.../reference/inference-log-schema.md.
CREATE TABLE IF NOT EXISTS inference_logs (
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
ORDER BY (gen_ai_system, gen_ai_request_model, start_time);
