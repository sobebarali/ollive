import { db } from "@ollive/db";
import { conversations } from "@ollive/db/schema/conversation";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";

export const metricsRangeSchema = z
  .enum(["15m", "1h", "24h", "7d"])
  .default("24h");

type MetricsRange = z.infer<typeof metricsRangeSchema>;

interface ResolvedRange {
  bucketFn: string;
  intervalSql: string;
}

/**
 * Map a time range to a ClickHouse window interval and time-bucket function. The returned strings
 * are interpolated directly into SQL, which is safe only because they come from this closed map and
 * never from caller input. All caller-supplied values are passed via query_params instead.
 */
export function resolveRange(range: MetricsRange): ResolvedRange {
  switch (range) {
    case "15m":
      return { intervalSql: "INTERVAL 15 MINUTE", bucketFn: "toStartOfMinute" };
    case "1h":
      return { intervalSql: "INTERVAL 1 HOUR", bucketFn: "toStartOfMinute" };
    case "24h":
      return { intervalSql: "INTERVAL 24 HOUR", bucketFn: "toStartOfHour" };
    case "7d":
      return { intervalSql: "INTERVAL 7 DAY", bucketFn: "toStartOfDay" };
    default: {
      const _exhaustive: never = range;
      return _exhaustive;
    }
  }
}

function requireUserId(session: { user?: { id?: string } } | null): string {
  const userId = session?.user?.id;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return userId;
}

interface ThroughputRow {
  bucket: string;
  count: string;
}
interface LatencyRow {
  avg: number | null;
  p50: number | null;
  p95: number | null;
}
interface StatusRow {
  count: string;
  status: string;
}
interface ErrorTypeRow {
  count: string;
  error_type: string;
}

interface Overview {
  errors: {
    byStatus: { status: string; count: number }[];
    byType: { errorType: string; count: number }[];
  };
  latency: { avgMs: number | null; p50Ms: number | null; p95Ms: number | null };
  range: MetricsRange;
  throughput: { total: number; buckets: { bucket: string; count: number }[] };
}

function emptyOverview(range: MetricsRange): Overview {
  return {
    range,
    throughput: { total: 0, buckets: [] },
    latency: { avgMs: null, p50Ms: null, p95Ms: null },
    errors: { byStatus: [], byType: [] },
  };
}

/** ClickHouse may return aggregates as strings (JSONEachRow) or as numbers; normalize to number|null. */
function toNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function queryRows<T>(query: string, ids: string[]): Promise<T[]> {
  const result = await clickhouse.query({
    query,
    query_params: { ids },
    format: "JSONEachRow",
  });
  return await result.json<T>();
}

export const metricsRouter = {
  overview: protectedProcedure
    .input(z.object({ range: metricsRangeSchema }))
    .handler(async ({ context, input }): Promise<Overview> => {
      const userId = requireUserId(context.session);
      const range = input.range;

      const owned = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.userId, userId));
      const ids = owned.map((row) => row.id);
      if (ids.length === 0) {
        return emptyOverview(range);
      }

      const { intervalSql, bucketFn } = resolveRange(range);
      const where = `WHERE start_time >= now() - ${intervalSql} AND conversation_id IN {ids:Array(UUID)}`;

      const [throughputRows, latencyRows, statusRows, errorTypeRows] =
        await Promise.all([
          queryRows<ThroughputRow>(
            `SELECT ${bucketFn}(start_time) AS bucket, count() AS count
             FROM inference_logs ${where}
             GROUP BY bucket ORDER BY bucket`,
            ids
          ),
          queryRows<LatencyRow>(
            `SELECT avg(latency_ms) AS avg,
                    quantile(0.5)(latency_ms) AS p50,
                    quantile(0.95)(latency_ms) AS p95
             FROM inference_logs ${where} AND status = 'success'`,
            ids
          ),
          queryRows<StatusRow>(
            `SELECT status, count() AS count
             FROM inference_logs ${where}
             GROUP BY status`,
            ids
          ),
          queryRows<ErrorTypeRow>(
            `SELECT error_type, count() AS count
             FROM inference_logs ${where} AND status = 'error'
             GROUP BY error_type`,
            ids
          ),
        ]);

      const buckets = throughputRows.map((row) => ({
        bucket: row.bucket,
        count: toNumber(row.count) ?? 0,
      }));
      const latency = latencyRows[0] ?? { avg: null, p50: null, p95: null };

      return {
        range,
        throughput: {
          total: buckets.reduce((sum, b) => sum + b.count, 0),
          buckets,
        },
        latency: {
          avgMs: toNumber(latency.avg),
          p50Ms: toNumber(latency.p50),
          p95Ms: toNumber(latency.p95),
        },
        errors: {
          byStatus: statusRows.map((row) => ({
            status: row.status,
            count: toNumber(row.count) ?? 0,
          })),
          byType: errorTypeRows.map((row) => ({
            errorType: row.error_type || "unknown",
            count: toNumber(row.count) ?? 0,
          })),
        },
      };
    }),
};
