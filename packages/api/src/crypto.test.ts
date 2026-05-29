import { describe, expect, it } from "bun:test";
import path from "node:path";
import { config } from "dotenv";

// ./crypto reads BYOK_ENCRYPTION_KEY (via @ollive/env/server) at load. Load the server env first so
// validation passes, mirroring logs.test.ts.
config({ path: path.resolve(import.meta.dir, "../../../apps/server/.env") });

const { decryptSecret, encryptSecret } = await import("./crypto");

describe("crypto", () => {
  it("round-trips a secret", () => {
    const secret = "sk-or-v1-0123456789abcdef";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("produces a different ciphertext each time (random iv)", () => {
    const secret = "sk-or-v1-same-input";
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it("throws when the ciphertext is tampered with", () => {
    const blob = encryptSecret("sk-or-v1-tamper");
    const bytes = Buffer.from(blob, "base64");
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] + 1) % 256;
    expect(() => decryptSecret(bytes.toString("base64"))).toThrow();
  });

  it("throws on malformed input", () => {
    expect(() => decryptSecret("not-valid")).toThrow();
  });
});
