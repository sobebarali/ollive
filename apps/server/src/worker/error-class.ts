type ErrorClass =
  | "rate_limit"
  | "auth"
  | "timeout"
  | "context_length"
  | "cancelled"
  | "unknown";

/** Ordered keyword rules; first match wins. Patterns cover common provider error shapes. */
const RULES: { pattern: RegExp; type: ErrorClass }[] = [
  { pattern: /rate.?limit|too many requests|\b429\b/i, type: "rate_limit" },
  {
    pattern: /unauthor|forbidden|\b401\b|\b403\b|api key|authentication/i,
    type: "auth",
  },
  { pattern: /timed?.?out|etimedout|deadline/i, type: "timeout" },
  {
    pattern: /context.?length|maximum context|token limit|too long/i,
    type: "context_length",
  },
  { pattern: /abort|cancel/i, type: "cancelled" },
];

/**
 * Map a raw provider error name or message to a stable, low-cardinality `error_type`. Derived in the
 * worker so dashboards group errors consistently regardless of provider wording.
 */
export function classifyError(raw: string | undefined): ErrorClass {
  if (!raw) {
    return "unknown";
  }
  for (const rule of RULES) {
    if (rule.pattern.test(raw)) {
      return rule.type;
    }
  }
  return "unknown";
}
