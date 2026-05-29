/**
 * Models the chatbot may call, fetched live from OpenRouter (`provider/model` ids). The list is
 * cached in-process; pricing the worker cannot resolve derives `cost_usd` to 0 (see
 * apps/server/src/worker/pricing.ts). See guides/add-an-llm-provider.md.
 */
/** Token prices in USD per token, as reported by OpenRouter. */
export interface ModelPrice {
  input: number;
  output: number;
}

export interface ModelOption {
  id: string;
  name: string;
  pricing: ModelPrice;
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: { models: ModelOption[]; fetchedAt: number } | null = null;

function toPrice(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listModels(): Promise<ModelOption[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  // OpenRouter's model list is public; send the key only if present for account-scoped results.
  const apiKey = process.env.OPENROUTER_API_KEY;
  const response = await fetch(MODELS_URL, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!response.ok) {
    if (cache) {
      return cache.models;
    }
    throw new Error(
      `Failed to load models from OpenRouter (${response.status})`
    );
  }
  const body = (await response.json()) as {
    data?: {
      id: string;
      name?: string;
      pricing?: { prompt?: string; completion?: string };
    }[];
  };
  const models = (body.data ?? [])
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      pricing: {
        input: toPrice(model.pricing?.prompt),
        output: toPrice(model.pricing?.completion),
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache = { models, fetchedAt: Date.now() };
  return models;
}

export async function getModelPrice(model: string): Promise<ModelPrice | null> {
  if (!model) {
    return null;
  }
  const models = await listModels();
  return models.find((option) => option.id === model)?.pricing ?? null;
}

export async function isAllowedModel(model: string): Promise<boolean> {
  if (!model) {
    return false;
  }
  const models = await listModels();
  return models.some((option) => option.id === model);
}
