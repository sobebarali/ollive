import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "@ollive/env/server";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Derive a fixed 32-byte key from the configured secret so any 32+ char value (hex, base64, or
// passphrase) works without forcing a specific encoding.
const KEY = createHash("sha256").update(env.BYOK_ENCRYPTION_KEY).digest();

/** Encrypt a secret to a base64 blob laid out as iv | authTag | ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a blob produced by {@link encryptSecret}. Throws if it is malformed or tampered with. */
export function decryptSecret(blob: string): string {
  const bytes = Buffer.from(blob, "base64");
  if (bytes.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("invalid ciphertext");
  }
  const iv = bytes.subarray(0, IV_BYTES);
  const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = bytes.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
