import { describe, expect, it } from "bun:test";
import path from "node:path";
import { config } from "dotenv";

// normalizeLogRow/logsListInputSchema are pure, but importing ./logs pulls in the ClickHouse client
// module, which reads CLICKHOUSE_URL at load. Load the server env first so that validation passes.
config({ path: path.resolve(import.meta.dir, "../../../../apps/server/.env") });

const { normalizeLogRow, logsListInputSchema } = await import("./logs");

const rawRow = {
  eventId: "11111111-1111-1111-1111-111111111111",
  conversationId: "22222222-2222-2222-2222-222222222222",
  messageId: "33333333-3333-3333-3333-333333333333",
  system: "openai",
  requestModel: "gpt-4o-mini",
  responseModel: "gpt-4o-mini-2024",
  inputTokens: "120",
  outputTokens: "340",
  latencyMs: "2310",
  timeToFirstTokenMs: "540",
  stream: 1,
  status: "success",
  errorType: "",
  errorMessage: "",
  errorStatus: "0",
  inputPreview: "hello",
  outputPreview: "hi there",
  costUsd: "0.0012",
  startTime: "2026-05-27 18:04:11",
};

describe("normalizeLogRow", () => {
  it("coerces ClickHouse string numerics to numbers", () => {
    const row = normalizeLogRow(rawRow);
    expect(row.inputTokens).toBe(120);
    expect(row.outputTokens).toBe(340);
    expect(row.latencyMs).toBe(2310);
    expect(row.timeToFirstTokenMs).toBe(540);
    expect(row.costUsd).toBeCloseTo(0.0012);
  });

  it("normalizes the stream flag to a boolean", () => {
    expect(normalizeLogRow(rawRow).stream).toBe(true);
    expect(normalizeLogRow({ ...rawRow, stream: 0 }).stream).toBe(false);
  });

  it("maps a null time-to-first-token to null", () => {
    const row = normalizeLogRow({ ...rawRow, timeToFirstTokenMs: null });
    expect(row.timeToFirstTokenMs).toBeNull();
  });

  it("surfaces the error message and coerces the status code", () => {
    const row = normalizeLogRow({
      ...rawRow,
      status: "error",
      errorType: "rate_limit",
      errorMessage: "rate limit exceeded",
      errorStatus: "429",
    });
    expect(row.errorMessage).toBe("rate limit exceeded");
    expect(row.errorStatus).toBe(429);
  });

  it("passes string fields through unchanged", () => {
    const row = normalizeLogRow(rawRow);
    expect(row.system).toBe("openai");
    expect(row.status).toBe("success");
    expect(row.inputPreview).toBe("hello");
    expect(row.startTime).toBe("2026-05-27 18:04:11");
  });
});

describe("logsListInputSchema", () => {
  it("applies defaults for limit and offset", () => {
    const parsed = logsListInputSchema.parse({ range: "24h" });
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
  });

  it("rejects a limit above 100", () => {
    expect(() =>
      logsListInputSchema.parse({ range: "24h", limit: 500 })
    ).toThrow();
  });

  it("rejects an unsupported status", () => {
    expect(() =>
      logsListInputSchema.parse({ range: "24h", status: "weird" })
    ).toThrow();
  });

  it("accepts an optional conversation id and status", () => {
    const parsed = logsListInputSchema.parse({
      range: "1h",
      conversationId: "22222222-2222-4222-8222-222222222222",
      status: "error",
    });
    expect(parsed.conversationId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.status).toBe("error");
  });
});
