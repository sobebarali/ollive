import type { ModelMessage } from "ai";

/** Default number of trailing messages sent to the model as conversational context. */
export const CONTEXT_MESSAGES = 20;

const MODEL_ROLES = new Set(["system", "user", "assistant"]);

interface StoredMessage {
  content: string;
  role: string;
}

/**
 * Turn stored conversation rows (oldest-first) into the short context passed to the model. Only the
 * last `limit` messages are kept so threads can grow unbounded without ballooning the prompt. Rows
 * whose role the model does not accept (e.g. tool rows) are dropped.
 */
export function buildModelMessages(
  rows: StoredMessage[],
  limit: number = CONTEXT_MESSAGES
): ModelMessage[] {
  return rows
    .filter((row) => MODEL_ROLES.has(row.role))
    .slice(-limit)
    .map((row) => ({ role: row.role, content: row.content }) as ModelMessage);
}
