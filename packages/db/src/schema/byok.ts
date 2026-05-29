import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userKeys = pgTable("user_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // AES-256-GCM ciphertext of the user's OpenRouter key; null means they use the shared key.
  encryptedKey: text("encrypted_key"),
  // Last 4 plaintext chars for masked display in settings. Not a secret.
  keyLast4: text("key_last4"),
  // Cumulative shared-key spend in micro-USD (cost_usd * 1e6). Integer accumulation avoids the
  // float drift that summing many sub-cent costs would introduce, and the cap is integer math.
  sharedSpentMicroUsd: bigint("shared_spent_micro_usd", { mode: "number" })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
