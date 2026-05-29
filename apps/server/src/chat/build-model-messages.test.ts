import { describe, expect, it } from "bun:test";
import { buildModelMessages } from "./build-model-messages";

describe("buildModelMessages", () => {
  it("maps role and content preserving order", () => {
    const out = buildModelMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "how are you" },
    ]);

    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "how are you" },
    ]);
  });

  it("keeps only the last N messages as context", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
    }));

    const out = buildModelMessages(rows, 20);

    expect(out).toHaveLength(20);
    expect(out[0].content).toBe("m5");
    expect(out.at(-1)?.content).toBe("m24");
  });

  it("passes system messages through", () => {
    const out = buildModelMessages([
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
    ]);

    expect(out[0]).toEqual({ role: "system", content: "be terse" });
  });

  it("drops rows with unknown roles", () => {
    const out = buildModelMessages([
      { role: "tool", content: "ignored" },
      { role: "user", content: "kept" },
    ]);

    expect(out).toEqual([{ role: "user", content: "kept" }]);
  });
});
