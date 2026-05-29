const MICRO = 1_000_000;

export interface SpendItem {
  /** True when the call used the user's own key — self-billed, excluded from the shared cap. */
  byok?: boolean;
  conversationId: string;
  costUsd: number;
}

/**
 * Sum shared-key spend per conversation, in micro-USD. BYOK and zero-cost calls are excluded since
 * they never count against the free-tier cap. Micro-USD keeps the running total integer so summing
 * many sub-cent costs does not drift.
 */
export function sumSharedSpendByConversation(
  items: SpendItem[]
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.byok || item.costUsd <= 0) {
      continue;
    }
    const micro = Math.round(item.costUsd * MICRO);
    if (micro <= 0) {
      continue;
    }
    totals.set(
      item.conversationId,
      (totals.get(item.conversationId) ?? 0) + micro
    );
  }
  return totals;
}
