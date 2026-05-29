import { afterEach, describe, expect, it, mock } from "bun:test";
import { isAllowedModel, listModels } from "./models";

const OPENROUTER_RESPONSE = {
  data: [
    { id: "openai/gpt-4o", name: "OpenAI: GPT-4o" },
    { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5" },
  ],
};

function mockFetchOnce(response: unknown, ok = true) {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 502,
      json: () => Promise.resolve(response),
    } as Response)
  );
}

afterEach(() => {
  mock.restore();
});

describe("listModels", () => {
  it("maps and sorts the OpenRouter model list by name", async () => {
    mockFetchOnce(OPENROUTER_RESPONSE);
    const models = await listModels();
    expect(models.map((m) => m.id)).toEqual([
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o",
    ]);
  });
});

describe("isAllowedModel", () => {
  it("accepts an id returned by OpenRouter", async () => {
    mockFetchOnce(OPENROUTER_RESPONSE);
    expect(await isAllowedModel("openai/gpt-4o")).toBe(true);
  });

  it("rejects an unknown or empty model", async () => {
    mockFetchOnce(OPENROUTER_RESPONSE);
    expect(await isAllowedModel("does/not-exist")).toBe(false);
    expect(await isAllowedModel("")).toBe(false);
  });
});
