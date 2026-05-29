import { describe, expect, it } from "bun:test";
import path from "node:path";
import { config } from "dotenv";

// resolveRange/metricsRangeSchema are pure, but importing ./metrics pulls in the ClickHouse client
// module, which reads CLICKHOUSE_URL at load. Load the server env first so that validation passes.
config({ path: path.resolve(import.meta.dir, "../../../../apps/server/.env") });

const { resolveRange, metricsRangeSchema } = await import("./metrics");

describe("resolveRange", () => {
  it("maps 15m to a 15-minute window bucketed by minute", () => {
    expect(resolveRange("15m")).toEqual({
      intervalSql: "INTERVAL 15 MINUTE",
      bucketFn: "toStartOfMinute",
    });
  });

  it("maps 1h to a 1-hour window bucketed by minute", () => {
    expect(resolveRange("1h")).toEqual({
      intervalSql: "INTERVAL 1 HOUR",
      bucketFn: "toStartOfMinute",
    });
  });

  it("maps 24h to a 24-hour window bucketed by hour", () => {
    expect(resolveRange("24h")).toEqual({
      intervalSql: "INTERVAL 24 HOUR",
      bucketFn: "toStartOfHour",
    });
  });

  it("maps 7d to a 7-day window bucketed by day", () => {
    expect(resolveRange("7d")).toEqual({
      intervalSql: "INTERVAL 7 DAY",
      bucketFn: "toStartOfDay",
    });
  });
});

describe("metricsRangeSchema", () => {
  it("defaults to 24h when no value is provided", () => {
    expect(metricsRangeSchema.parse(undefined)).toBe("24h");
  });

  it("accepts each supported range", () => {
    for (const range of ["15m", "1h", "24h", "7d"]) {
      expect(metricsRangeSchema.parse(range)).toBe(range);
    }
  });

  it("rejects an unsupported range", () => {
    expect(() => metricsRangeSchema.parse("30m")).toThrow();
  });
});
