import { db } from "@ollive/db";
import { userKeys } from "@ollive/db/schema/byok";
import { env } from "@ollive/env/server";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { encryptSecret } from "../crypto";
import { protectedProcedure } from "../index";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
const MICRO = 1_000_000;

function requireUserId(session: { user?: { id?: string } } | null): string {
  const userId = session?.user?.id;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return userId;
}

/** Read the user's row, creating a default (shared-key, zero-spend) row on first access. */
async function loadOrCreate(userId: string) {
  const [existing] = await db
    .select()
    .from(userKeys)
    .where(eq(userKeys.userId, userId));
  if (existing) {
    return existing;
  }
  const [created] = await db
    .insert(userKeys)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  // A concurrent insert may have won the race; re-read in that case.
  if (created) {
    return created;
  }
  const [row] = await db
    .select()
    .from(userKeys)
    .where(eq(userKeys.userId, userId));
  if (!row) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Failed to initialize user settings.",
    });
  }
  return row;
}

/** Confirm the key works before storing it, so a typo surfaces here rather than at chat time. */
async function assertKeyWorks(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_KEY_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message: "Could not reach OpenRouter to verify the key. Try again.",
    });
  }
  if (!response.ok) {
    throw new ORPCError("BAD_REQUEST", {
      message: "OpenRouter rejected this API key.",
    });
  }
}

export const byokRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    const userId = requireUserId(context.session);
    const row = await loadOrCreate(userId);
    const hasOwnKey = Boolean(row.encryptedKey);
    const limitMicro = Math.round(env.SHARED_KEY_LIMIT_USD * MICRO);
    return {
      hasOwnKey,
      keyLast4: row.keyLast4,
      sharedSpentUsd: row.sharedSpentMicroUsd / MICRO,
      sharedLimitUsd: env.SHARED_KEY_LIMIT_USD,
      blocked: !hasOwnKey && row.sharedSpentMicroUsd >= limitMicro,
    };
  }),

  setKey: protectedProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const userId = requireUserId(context.session);
      const apiKey = input.apiKey.trim();
      if (!apiKey.startsWith("sk-or-")) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Expected an OpenRouter key starting with 'sk-or-'.",
        });
      }
      await assertKeyWorks(apiKey);
      const values = {
        userId,
        encryptedKey: encryptSecret(apiKey),
        keyLast4: apiKey.slice(-4),
      };
      await db
        .insert(userKeys)
        .values(values)
        .onConflictDoUpdate({
          target: userKeys.userId,
          set: {
            encryptedKey: values.encryptedKey,
            keyLast4: values.keyLast4,
          },
        });
      return { hasOwnKey: true, keyLast4: values.keyLast4 };
    }),

  removeKey: protectedProcedure.handler(async ({ context }) => {
    const userId = requireUserId(context.session);
    await db
      .insert(userKeys)
      .values({ userId })
      .onConflictDoUpdate({
        target: userKeys.userId,
        set: { encryptedKey: null, keyLast4: null },
      });
    return { hasOwnKey: false };
  }),
};
