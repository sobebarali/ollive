import { describe, expect, it } from "bun:test";
import { isAllowedModel, MODELS } from "./models";

// Mirror of the worker pricing table keys (apps/server/src/worker/pricing.ts). If MODELS drifts from
// these, cost_usd silently derives to 0, so this guard fails loudly instead.
const PRICED_MODELS = [
  "anthropic/claude-sonnet",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat",
];

describe("MODELS allow-list", () => {
  it("contains only models that have server-side pricing", () => {
    expect([...MODELS].sort()).toEqual([...PRICED_MODELS].sort());
  });
});

describe("isAllowedModel", () => {
  it("accepts every allow-listed model", () => {
    for (const model of MODELS) {
      expect(isAllowedModel(model)).toBe(true);
    }
  });

  it("rejects an unknown model", () => {
    expect(isAllowedModel("anthropic/claude-opus-4")).toBe(false);
    expect(isAllowedModel("")).toBe(false);
  });
});
