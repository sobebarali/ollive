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

/** HTTP status codes that map directly to a stable class, regardless of provider wording. */
const STATUS_CLASS: Record<number, ErrorClass> = {
  401: "auth",
  403: "auth",
  408: "timeout",
  429: "rate_limit",
  504: "timeout",
};

/**
 * Map a provider error to a stable, low-cardinality `error_type` so dashboards group errors
 * consistently. The HTTP status from an AI SDK APICallError is the most reliable signal and wins;
 * otherwise fall back to keyword rules over the error type name and message.
 */
export function classifyError(
  type: string | undefined,
  statusCode?: number,
  message?: string
): ErrorClass {
  if (statusCode && STATUS_CLASS[statusCode]) {
    return STATUS_CLASS[statusCode];
  }
  const text = [type, message].filter(Boolean).join(" ");
  if (!text) {
    return "unknown";
  }
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return rule.type;
    }
  }
  return "unknown";
}
