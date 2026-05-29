import { describe, expect, it } from "bun:test";
import { deriveCost } from "./pricing";

// OpenRouter reports prices in USD per token (e.g. $3/1M tokens = 0.000003).
const PRICE = { input: 0.000_003, output: 0.000_015 };

describe("deriveCost", () => {
  it("derives cost from input and output tokens at the model price", () => {
    // 1_000_000 input + 1_000_000 output = 3.0 + 15.0 = 18.0
    expect(deriveCost(PRICE, 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
  });

  it("scales linearly with token counts", () => {
    // 500k input + 200k output = 0.5*3.0 + 0.2*15.0 = 1.5 + 3.0 = 4.5
    expect(deriveCost(PRICE, 500_000, 200_000)).toBeCloseTo(4.5, 6);
  });

  it("returns 0 for an unknown (null) price instead of throwing", () => {
    expect(deriveCost(null, 1000, 1000)).toBe(0);
  });

  it("returns 0 when token counts are zero", () => {
    expect(deriveCost(PRICE, 0, 0)).toBe(0);
  });

  it("returns 0 for a missing price", () => {
    expect(deriveCost(undefined, 1000, 1000)).toBe(0);
  });
});
