/**
 * Models the chatbot may call, by OpenRouter id (`provider/model`). Each id must also have a price
 * in the worker pricing table (apps/server/src/worker/pricing.ts), or its cost_usd derives to 0.
 * See guides/add-an-llm-provider.md.
 */
export const MODELS = [
  "anthropic/claude-sonnet",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat",
] as const;

export type AllowedModel = (typeof MODELS)[number];

export function isAllowedModel(model: string): model is AllowedModel {
  return (MODELS as readonly string[]).includes(model);
}
