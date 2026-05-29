import { db } from "@ollive/db";
import { conversations } from "@ollive/db/schema/conversation";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import { metricsRangeSchema, resolveRange } from "./metrics";

export const logStatusSchema = z.enum(["success", "error", "cancelled"]);

export const logsListInputSchema = z.object({
  range: metricsRangeSchema,
  conversationId: z.string().uuid().optional(),
  status: logStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

/** One inference call as stored in ClickHouse, with every persisted column surfaced to the UI. */
export interface LogRow {
  conversationId: string;
  costUsd: number;
  errorMessage: string;
  errorStatus: number;
  errorType: string;
  eventId: string;
  inputPreview: string;
  inputTokens: number;
  latencyMs: number;
  messageId: string;
  outputPreview: string;
  outputTokens: number;
  requestModel: string;
  responseModel: string;
  startTime: string;
  status: string;
  stream: boolean;
  system: string;
  timeToFirstTokenMs: number | null;
}

/** Shape of a row as returned by ClickHouse JSONEachRow: numerics may arrive as strings. */
interface RawLogRow {
  conversationId: string;
  costUsd: string | number;
  errorMessage: string;
  errorStatus: string | number;
  errorType: string;
  eventId: string;
  inputPreview: string;
  inputTokens: string | number;
  latencyMs: string | number;
  messageId: string;
  outputPreview: string;
  outputTokens: string | number;
  requestModel: string;
  responseModel: string;
  startTime: string;
  status: string;
  stream: boolean | number;
  system: string;
  timeToFirstTokenMs: string | number | null;
}

function toNumber(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize a raw ClickHouse row into typed numbers/booleans for the client. Pure; unit-tested. */
export function normalizeLogRow(raw: RawLogRow): LogRow {
  return {
    eventId: raw.eventId,
    conversationId: raw.conversationId,
    messageId: raw.messageId,
    system: raw.system,
    requestModel: raw.requestModel,
    responseModel: raw.responseModel,
    inputTokens: toNumber(raw.inputTokens),
    outputTokens: toNumber(raw.outputTokens),
    latencyMs: toNumber(raw.latencyMs),
    timeToFirstTokenMs:
      raw.timeToFirstTokenMs === null ? null : toNumber(raw.timeToFirstTokenMs),
    stream: raw.stream === true || raw.stream === 1,
    status: raw.status,
    errorType: raw.errorType,
    errorMessage: raw.errorMessage,
    errorStatus: toNumber(raw.errorStatus),
    inputPreview: raw.inputPreview,
    outputPreview: raw.outputPreview,
    costUsd: toNumber(raw.costUsd),
    startTime: raw.startTime,
  };
}

function requireUserId(session: { user?: { id?: string } } | null): string {
  const userId = session?.user?.id;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return userId;
}

interface LogsList {
  hasMore: boolean;
  rows: LogRow[];
  total: number;
}

const SELECT_COLUMNS = `
  toString(event_id) AS eventId,
  toString(conversation_id) AS conversationId,
  toString(message_id) AS messageId,
  gen_ai_system AS system,
  gen_ai_request_model AS requestModel,
  gen_ai_response_model AS responseModel,
  input_tokens AS inputTokens,
  output_tokens AS outputTokens,
  latency_ms AS latencyMs,
  time_to_first_token_ms AS timeToFirstTokenMs,
  stream,
  status,
  error_type AS errorType,
  error_message AS errorMessage,
  error_status AS errorStatus,
  input_preview AS inputPreview,
  output_preview AS outputPreview,
  cost_usd AS costUsd,
  formatDateTime(start_time, '%Y-%m-%d %H:%M:%S') AS startTime`;

export const logsRouter = {
  list: protectedProcedure
    .input(logsListInputSchema)
    .handler(async ({ context, input }): Promise<LogsList> => {
      const userId = requireUserId(context.session);

      const owned = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.userId, userId));
      const ids = owned.map((row) => row.id);
      if (ids.length === 0) {
        return { rows: [], total: 0, hasMore: false };
      }

      const { intervalSql } = resolveRange(input.range);
      // Caller input flows through query_params; only the closed-map interval is interpolated.
      const filters = [
        `start_time >= now() - ${intervalSql}`,
        "conversation_id IN {ids:Array(UUID)}",
      ];
      if (input.conversationId) {
        filters.push("conversation_id = {conversationId:UUID}");
      }
      if (input.status) {
        filters.push("status = {status:String}");
      }
      const where = `WHERE ${filters.join(" AND ")}`;
      const params: Record<string, unknown> = {
        ids,
        conversationId: input.conversationId,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      };

      const [rowsResult, countResult] = await Promise.all([
        clickhouse.query({
          query: `SELECT ${SELECT_COLUMNS}
                  FROM inference_logs ${where}
                  ORDER BY start_time DESC
                  LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
          query_params: params,
          format: "JSONEachRow",
        }),
        clickhouse.query({
          query: `SELECT count() AS total FROM inference_logs ${where}`,
          query_params: params,
          format: "JSONEachRow",
        }),
      ]);

      const rawRows = await rowsResult.json<RawLogRow>();
      const countRows = await countResult.json<{ total: string | number }>();
      const rows = rawRows.map(normalizeLogRow);
      const total = toNumber(countRows[0]?.total ?? 0);

      return {
        rows,
        total,
        hasMore: input.offset + rows.length < total,
      };
    }),
};
