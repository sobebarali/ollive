import { describe, expect, it } from "bun:test";
import { deriveCost } from "./pricing";

describe("deriveCost", () => {
  it("derives cost for a known model from input and output tokens", () => {
    // anthropic/claude-sonnet: input 3.0, output 15.0 USD per 1M tokens.
    // 1_000_000 input + 1_000_000 output = 3.0 + 15.0 = 18.0
    expect(deriveCost("anthropic/claude-sonnet", 1_000_000, 1_000_000)).toBe(
      18
    );
  });

  it("scales linearly with token counts", () => {
    // 500k input + 200k output = 0.5*3.0 + 0.2*15.0 = 1.5 + 3.0 = 4.5
    expect(deriveCost("anthropic/claude-sonnet", 500_000, 200_000)).toBe(4.5);
  });

  it("returns 0 for an unknown model instead of throwing", () => {
    expect(deriveCost("acme/does-not-exist", 1000, 1000)).toBe(0);
  });

  it("returns 0 when token counts are zero", () => {
    expect(deriveCost("anthropic/claude-sonnet", 0, 0)).toBe(0);
  });

  it("returns 0 for a missing model id", () => {
    expect(deriveCost(undefined, 1000, 1000)).toBe(0);
  });
});
