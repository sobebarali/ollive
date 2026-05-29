interface ModelPrice {
  input: number;
  output: number;
}

/**
 * Server-side token prices in USD per 1M tokens, keyed by OpenRouter model id. Cost is derived
 * here rather than in the SDK so pricing changes never require a client redeploy. Extend this table
 * when adding a model to the allow-list (see guides/add-an-llm-provider.md).
 */
const PRICING: Record<string, ModelPrice> = {
  "anthropic/claude-sonnet": { input: 3.0, output: 15.0 },
  "openai/gpt-4.1": { input: 2.0, output: 8.0 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
};

const PER_MILLION = 1_000_000;

/**
 * Derive the USD cost of a call from its token counts. Unknown or missing models fall back to 0
 * rather than throwing, so an un-priced model never breaks ingestion.
 */
export function deriveCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  if (!model) {
    return 0;
  }
  const price = PRICING[model];
  if (!price) {
    return 0;
  }
  return (
    (inputTokens * price.input + outputTokens * price.output) / PER_MILLION
  );
}
