import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";

// These are integration tests against the local PostgreSQL from docker-compose. Load the server env
// so @ollive/db can validate and connect before it is imported.
config({ path: path.resolve(import.meta.dir, "../../../../apps/server/.env") });

// Stub the model allow-list so these tests exercise conversation CRUD/ownership without depending on
// OpenRouter's live, account-scoped catalog. `TEST_MODEL` is allowed; anything else is rejected.
const TEST_MODEL = "openai/gpt-4.1";
mock.module("../models", () => ({
  isAllowedModel: (model: string) => Promise.resolve(model === TEST_MODEL),
  getModelPrice: () => Promise.resolve(null),
  listModels: () => Promise.resolve([]),
}));

const { db } = await import("@ollive/db");
const { user } = await import("@ollive/db/schema/auth");
const { conversations, messages } = await import(
  "@ollive/db/schema/conversation"
);
const { call } = await import("@orpc/server");
const { conversationRouter } = await import("./conversation");
const { eq } = await import("drizzle-orm");

const userId = `test-${randomUUID()}`;
const otherUserId = `test-${randomUUID()}`;

function ctx(id: string) {
  return { auth: null, session: { user: { id } } };
}

function defined<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}

function createFor(id: string) {
  return call(
    conversationRouter.create,
    { model: TEST_MODEL },
    { context: ctx(id) }
  ).then(defined);
}

async function seedUser(id: string) {
  await db
    .insert(user)
    .values({ id, name: "Test", email: `${id}@example.com` });
}

beforeAll(async () => {
  await seedUser(userId);
  await seedUser(otherUserId);
});

afterAll(async () => {
  // Cascade removes the users' conversations and their messages.
  await db.delete(user).where(eq(user.id, userId));
  await db.delete(user).where(eq(user.id, otherUserId));
});

describe("conversation.create", () => {
  it("persists a conversation owned by the caller", async () => {
    const created = await createFor(userId);

    expect(created.userId).toBe(userId);
    expect(created.model).toBe("openai/gpt-4.1");
    expect(created.status).toBe("active");

    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, created.id));
    expect(row.userId).toBe(userId);
  });

  it("rejects a model that is not on the allow-list", async () => {
    await expect(
      call(
        conversationRouter.create,
        { model: "anthropic/claude-opus-4" },
        { context: ctx(userId) }
      )
    ).rejects.toThrow();
  });
});

describe("conversation.list", () => {
  it("returns only the caller's conversations", async () => {
    await createFor(otherUserId);

    const mine = await call(conversationRouter.list, undefined, {
      context: ctx(userId),
    });

    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.userId === userId)).toBe(true);
  });
});

describe("conversation.get", () => {
  it("returns the conversation with its messages in order", async () => {
    const created = await createFor(userId);
    await db.insert(messages).values([
      { conversationId: created.id, role: "user", content: "first" },
      { conversationId: created.id, role: "assistant", content: "second" },
    ]);

    const result = await call(
      conversationRouter.get,
      { id: created.id },
      { context: ctx(userId) }
    );

    expect(result.conversation.id).toBe(created.id);
    expect(result.messages.map((m) => m.content)).toEqual(["first", "second"]);
  });

  it("does not expose another user's conversation", async () => {
    const created = await createFor(otherUserId);

    await expect(
      call(conversationRouter.get, { id: created.id }, { context: ctx(userId) })
    ).rejects.toThrow();
  });
});

describe("conversation.cancel", () => {
  it("sets the conversation status to cancelled", async () => {
    const created = await createFor(userId);

    const cancelled = await call(
      conversationRouter.cancel,
      { id: created.id },
      { context: ctx(userId) }
    );

    expect(cancelled?.status).toBe("cancelled");
  });

  it("does not cancel another user's conversation", async () => {
    const created = await createFor(otherUserId);

    await expect(
      call(
        conversationRouter.cancel,
        { id: created.id },
        { context: ctx(userId) }
      )
    ).rejects.toThrow();
  });
});
