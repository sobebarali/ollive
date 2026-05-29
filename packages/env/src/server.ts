import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const redisUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "redis:" || url.protocol === "rediss:";
  } catch {
    return false;
  }
}, "REDIS_URL must be a redis:// or rediss:// URL");

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CLICKHOUSE_URL: z.url(),
    REDIS_URL: redisUrlSchema,
    OPENROUTER_API_KEY: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    PII_REDACTION: z.enum(["on", "off"]).default("on"),
    LOG_PREVIEW_CHARS: z.coerce.number().int().positive().default(200),
    INGESTION_BATCH_SIZE: z.coerce.number().int().positive().default(500),
    INGESTION_FLUSH_MS: z.coerce.number().int().positive().default(5000),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
