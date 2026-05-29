import { describe, expect, it } from "bun:test";
import { sumSharedSpendByConversation } from "./spend";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("sumSharedSpendByConversation", () => {
  it("sums shared-key costs per conversation in micro-USD", () => {
    const totals = sumSharedSpendByConversation([
      { conversationId: A, costUsd: 0.0012 },
      { conversationId: A, costUsd: 0.0003 },
      { conversationId: B, costUsd: 0.01 },
    ]);
    expect(totals.get(A)).toBe(1500);
    expect(totals.get(B)).toBe(10_000);
  });

  it("excludes BYOK calls", () => {
    const totals = sumSharedSpendByConversation([
      { conversationId: A, costUsd: 0.5, byok: true },
      { conversationId: A, costUsd: 0.0001 },
    ]);
    expect(totals.get(A)).toBe(100);
  });

  it("excludes zero and sub-rounding costs", () => {
    const totals = sumSharedSpendByConversation([
      { conversationId: A, costUsd: 0 },
      { conversationId: A, costUsd: 0.000_000_4 },
    ]);
    expect(totals.has(A)).toBe(false);
  });
});
