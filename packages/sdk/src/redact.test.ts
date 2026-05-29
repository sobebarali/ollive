import { describe, expect, it } from "bun:test";
import { redactPreview } from "./redact";

const opts = { maxChars: 500, enabled: true };

describe("redactPreview masking", () => {
  it("redacts email addresses", () => {
    const out = redactPreview("reach me at ada@acme.com please", opts);
    expect(out).toContain("[EMAIL]");
    expect(out).not.toContain("ada@acme.com");
  });

  it("redacts phone numbers", () => {
    const out = redactPreview("call +1 415 555 0132 now", opts);
    expect(out).toContain("[PHONE]");
    expect(out).not.toContain("555 0132");
  });

  it("redacts bearer tokens", () => {
    const out = redactPreview(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      opts
    );
    expect(out).toContain("[BEARER_TOKEN]");
    expect(out).not.toContain("eyJhbGci");
  });

  it("redacts API keys", () => {
    const out = redactPreview(
      "key sk-abc123DEF456ghi789JKL012mno345pq and AKIAIOSFODNN7EXAMPLE",
      opts
    );
    expect(out).toContain("[API_KEY]");
    expect(out).not.toContain("sk-abc123DEF456ghi789JKL012mno345pq");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts prefixed API keys with internal hyphens/underscores", () => {
    const out = redactPreview(
      "rotate key sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX or sk-svcacct_0123456789abcdef",
      opts
    );
    expect(out).toContain("[API_KEY]");
    expect(out).not.toContain("sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(out).not.toContain("sk-svcacct_0123456789abcdef");
  });

  it("leaves clean text unchanged", () => {
    const clean = "The report covers three themes worth discussing.";
    expect(redactPreview(clean, opts)).toBe(clean);
  });
});

describe("redactPreview truncation", () => {
  it("truncates to maxChars", () => {
    const long = "a".repeat(1000);
    expect(redactPreview(long, { maxChars: 20, enabled: true }).length).toBe(
      20
    );
  });

  it("redacts before truncating so no raw PII survives a mid-value cut", () => {
    const text = `${"x".repeat(10)}ada@acme.com tail`;
    const out = redactPreview(text, { maxChars: 15, enabled: true });
    expect(out.length).toBeLessThanOrEqual(15);
    expect(out).not.toContain("ada");
  });
});

describe("redactPreview disabled", () => {
  it("skips masking but still truncates", () => {
    const out = redactPreview("email ada@acme.com here", {
      maxChars: 500,
      enabled: false,
    });
    expect(out).toContain("ada@acme.com");
    expect(out).not.toContain("[EMAIL]");
  });

  it("truncates even when disabled", () => {
    const long = "b".repeat(1000);
    expect(redactPreview(long, { maxChars: 30, enabled: false }).length).toBe(
      30
    );
  });
});
