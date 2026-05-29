/**
 * PII redaction for inference previews. Runs inside the SDK so raw personal data never reaches the
 * Valkey stream or storage. Redactors run first, then the result is truncated — truncating first
 * could split a value (e.g. an email) and leave an unmatched fragment in the stored preview.
 */

const DEFAULT_PREVIEW_CHARS = 200;

// Defined once at module scope; rebuilding these per call would be wasteful on the chat hot path.
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
// `sk-` keys may carry internal hyphens/underscores (e.g. sk-proj-…, sk-svcacct_…); match the whole
// run, anchored on alphanumerics, with a 16-char floor so ordinary "sk-" words are not caught.
const API_KEY =
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{14,}[A-Za-z0-9]|\bAKIA[0-9A-Z]{16}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CREDIT_CARD = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const LONG_DIGITS = /\b\d{6,}\b/g;

export type Redactor = (text: string) => string;

/** Applied in order: token/key/email/card before the generic phone and digit-run rules. */
export const defaultRedactors: Redactor[] = [
  (text) => text.replace(BEARER_TOKEN, "[BEARER_TOKEN]"),
  (text) => text.replace(API_KEY, "[API_KEY]"),
  (text) => text.replace(EMAIL, "[EMAIL]"),
  (text) => text.replace(CREDIT_CARD, "[CARD]"),
  (text) => text.replace(PHONE, "[PHONE]"),
  (text) => text.replace(LONG_DIGITS, "[NUMBER]"),
];

export function redact(text: string, redactors: Redactor[] = defaultRedactors) {
  return redactors.reduce((acc, redactor) => redactor(acc), text);
}

export interface RedactPreviewOptions {
  enabled?: boolean;
  maxChars?: number;
  redactors?: Redactor[];
}

export function redactPreview(
  text: string,
  options: RedactPreviewOptions = {}
) {
  const enabled = options.enabled ?? true;
  const maxChars = options.maxChars ?? DEFAULT_PREVIEW_CHARS;
  const masked = enabled ? redact(text, options.redactors) : text;
  return masked.slice(0, maxChars);
}
