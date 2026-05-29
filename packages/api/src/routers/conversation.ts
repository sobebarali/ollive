import { db } from "@ollive/db";
import { conversations, messages } from "@ollive/db/schema/conversation";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import z from "zod";
import { protectedProcedure } from "../index";
import { isAllowedModel } from "../models";

function requireUserId(session: { user?: { id?: string } } | null): string {
  const userId = session?.user?.id;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return userId;
}

export const conversationRouter = {
  create: protectedProcedure
    .input(
      z.object({
        model: z.string(),
        title: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      if (!isAllowedModel(input.model)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Unknown model: ${input.model}`,
        });
      }
      const userId = requireUserId(context.session);
      const [conversation] = await db
        .insert(conversations)
        .values({ userId, model: input.model, title: input.title })
        .returning();
      return conversation;
    }),

  list: protectedProcedure.handler(async ({ context }) => {
    const userId = requireUserId(context.session);
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const userId = requireUserId(context.session);
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.id, input.id), eq(conversations.userId, userId))
        );
      if (!conversation) {
        throw new ORPCError("NOT_FOUND");
      }
      const thread = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.createdAt));
      return { conversation, messages: thread };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .handler(async ({ context, input }) => {
      const userId = requireUserId(context.session);
      const [conversation] = await db
        .update(conversations)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(eq(conversations.id, input.id), eq(conversations.userId, userId))
        )
        .returning();
      if (!conversation) {
        throw new ORPCError("NOT_FOUND");
      }
      return conversation;
    }),
};
