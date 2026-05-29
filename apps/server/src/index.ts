import { randomUUID } from "node:crypto";
import { createContext } from "@ollive/api/context";
import { decryptSecret } from "@ollive/api/crypto";
import { isAllowedModel } from "@ollive/api/models";
import { appRouter } from "@ollive/api/routers/index";
import { auth } from "@ollive/auth";
import { db } from "@ollive/db";
import { userKeys } from "@ollive/db/schema/byok";
import { conversations, messages } from "@ollive/db/schema/conversation";
import { env } from "@ollive/env/server";
import { streamLogger } from "@ollive/sdk";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { streamText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { initLogger } from "evlog";
import {
  type BetterAuthInstance,
  createAuthMiddleware,
} from "evlog/better-auth";
import { type EvlogVariables, evlog } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  buildModelMessages,
  CONTEXT_MESSAGES,
} from "./chat/build-model-messages";

initLogger({
  env: { service: "ollive-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const app = new Hono<EvlogVariables>();

app.use(evlog());
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      // Behind Railway's TLS-terminating proxy the request reaches us over http, so the
      // auto-derived server URL is http:// and the browser blocks every call as mixed content.
      // Pin it to the public base instead.
      specGenerateOptions: {
        servers: [{ url: `${env.BETTER_AUTH_URL}/api-reference` }],
      },
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

const chatRequestSchema = z.object({
  conversationId: z.uuid(),
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.string(),
      parts: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    })
  ),
});

type ChatUIMessage = z.infer<typeof chatRequestSchema>["messages"][number];

/** The text of the newest user turn; chat context is otherwise loaded from PostgreSQL. */
function latestUserText(uiMessages: ChatUIMessage[]): string {
  const last = uiMessages.findLast((message) => message.role === "user");
  return (last?.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

// Shared free-tier client built from the owner's key, reused across requests. Users who bring their
// own key get a per-request client instead (see resolveProvider).
const sharedOpenRouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
const SHARED_LIMIT_MICRO = Math.round(env.SHARED_KEY_LIMIT_USD * 1_000_000);

type ResolvedKey =
  | { byok: true; provider: ReturnType<typeof createOpenRouter> }
  | { byok: false; provider: ReturnType<typeof createOpenRouter> }
  | { blocked: true };

/** Pick the OpenRouter client for this user: their own key if set, else the shared key while they
 * remain under the free-tier cap. Returns `blocked` once a shared-key user has spent their $1. */
async function resolveKey(userId: string): Promise<ResolvedKey> {
  const [row] = await db
    .select()
    .from(userKeys)
    .where(eq(userKeys.userId, userId));

  if (row?.encryptedKey) {
    const apiKey = decryptSecret(row.encryptedKey);
    return { byok: true, provider: createOpenRouter({ apiKey }) };
  }

  const spent = row?.sharedSpentMicroUsd ?? 0;
  if (spent >= SHARED_LIMIT_MICRO) {
    return { blocked: true };
  }
  return { byok: false, provider: sharedOpenRouter };
}

app.post("/ai", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const userId = session.user.id;

  const parsed = chatRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid request" }, 400);
  }
  const { conversationId, model, messages: uiMessages } = parsed.data;
  if (!(await isAllowedModel(model))) {
    return c.json({ error: `Unknown model: ${model}` }, 400);
  }

  const resolved = await resolveKey(userId);
  if ("blocked" in resolved) {
    return c.json(
      {
        error: `Free $${env.SHARED_KEY_LIMIT_USD} limit reached — add your own OpenRouter key in Settings to keep chatting.`,
      },
      402
    );
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      )
    );
  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const userText = latestUserText(uiMessages);
  if (!userText) {
    return c.json({ error: "No user message" }, 400);
  }

  await db
    .insert(messages)
    .values({ conversationId, role: "user", content: userText });
  await db
    .update(conversations)
    .set({
      updatedAt: new Date(),
      // Derive the thread title from its first message.
      ...(conversation.title === "New conversation"
        ? { title: userText.slice(0, 80) }
        : {}),
    })
    .where(eq(conversations.id, conversationId));

  const recent = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(CONTEXT_MESSAGES);
  const modelMessages = buildModelMessages(recent.reverse());

  // Reserve the assistant message and event ids up front so the inference log can reference the
  // message before the stream completes.
  const assistantId = randomUUID();
  const eventId = randomUUID();
  const logger = streamLogger({
    conversationId,
    messageId: assistantId,
    eventId,
    model,
    input: userText,
    system: "openrouter",
    stream: true,
    byok: resolved.byok,
  });

  async function persistAssistant(content: string): Promise<void> {
    try {
      await db.insert(messages).values({
        id: assistantId,
        conversationId,
        role: "assistant",
        content,
        inferenceEventId: eventId,
      });
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    } catch (error) {
      console.error("[ollive] failed to persist assistant message", error);
    }
  }

  const result = streamText({
    model: resolved.provider(model),
    messages: modelMessages,
    abortSignal: c.req.raw.signal,
    onChunk: logger.onChunk,
    onError: logger.onError,
    onAbort: async (event) => {
      logger.onAbort(event);
      await persistAssistant(logger.partialText());
    },
    onFinish: async (event) => {
      logger.onFinish(event);
      await persistAssistant(event.text);
    },
  });

  return result.toUIMessageStreamResponse();
});

app.get("/", (c) => c.text("OK"));

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT) || 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
