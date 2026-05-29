/** Token prices in USD per token (as reported by OpenRouter's models API). */
interface ModelPrice {
  input: number;
  output: number;
}

/**
 * Derive the USD cost of a call from its token counts and the model's per-token price. The price is
 * resolved from OpenRouter in the worker (see packages/api/src/models.ts), so a model with no known
 * price falls back to 0 here rather than throwing — an un-priced model never breaks ingestion.
 */
export function deriveCost(
  price: ModelPrice | null | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  if (!price) {
    return 0;
  }
  return inputTokens * price.input + outputTokens * price.output;
}
