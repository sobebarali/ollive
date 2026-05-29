import { describe, expect, it } from "bun:test";
import { classifyError } from "./error-class";

describe("classifyError", () => {
  it("classifies rate-limit errors", () => {
    expect(classifyError("Rate limit exceeded")).toBe("rate_limit");
    expect(classifyError("429 Too Many Requests")).toBe("rate_limit");
  });

  it("classifies auth errors", () => {
    expect(classifyError("Invalid API key")).toBe("auth");
    expect(classifyError("401 Unauthorized")).toBe("auth");
    expect(classifyError("AuthenticationError")).toBe("auth");
  });

  it("classifies timeout errors", () => {
    expect(classifyError("Request timed out")).toBe("timeout");
    expect(classifyError("ETIMEDOUT")).toBe("timeout");
  });

  it("classifies context-length errors", () => {
    expect(classifyError("This model's maximum context length is 8192")).toBe(
      "context_length"
    );
    expect(classifyError("context_length_exceeded")).toBe("context_length");
  });

  it("classifies cancellation", () => {
    expect(classifyError("AbortError")).toBe("cancelled");
  });

  it("falls back to unknown for unrecognised errors", () => {
    expect(classifyError("Something exploded")).toBe("unknown");
  });

  it("returns unknown for a missing error string", () => {
    expect(classifyError(undefined)).toBe("unknown");
    expect(classifyError("")).toBe("unknown");
  });

  it("classifies by HTTP status code when present", () => {
    expect(classifyError("AI_APICallError", 429)).toBe("rate_limit");
    expect(classifyError("AI_APICallError", 401)).toBe("auth");
    expect(classifyError("AI_APICallError", 403)).toBe("auth");
    expect(classifyError("AI_APICallError", 408)).toBe("timeout");
    expect(classifyError("AI_APICallError", 504)).toBe("timeout");
  });

  it("prefers the status code over message wording", () => {
    // A 429 stays rate_limit even if the body mentions a timeout.
    expect(classifyError("AI_APICallError", 429, "upstream timed out")).toBe(
      "rate_limit"
    );
  });

  it("falls back to message wording when the status code is unmapped", () => {
    expect(
      classifyError("AI_APICallError", 400, "maximum context length is 8192")
    ).toBe("context_length");
  });
});
