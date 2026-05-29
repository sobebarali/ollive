import { beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { appRouter } from "@ollive/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

// Full-stack integration tests. They drive the real HTTP surface end to end and therefore require
// the whole local stack to be up: `docker compose up` (PostgreSQL, ClickHouse, Valkey) and
// `bun run dev` (API + ingestion worker). They make a real OpenRouter call, so they are gated:
// when the server is not reachable the suite skips instead of failing.

const BASE = process.env.OLLIVE_SERVER_URL ?? "http://localhost:3000";
const CLICKHOUSE = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const MODEL = "openai/gpt-4.1";

type Client = RouterClient<typeof appRouter>;

const live = await fetch(`${BASE}/`)
  .then((r) => r.ok)
  .catch(() => false);

if (!live) {
  console.warn(
    `[integration] server not reachable at ${BASE} — skipping. Start it with \`docker compose up\` + \`bun run dev\`.`
  );
}

function cookieFrom(res: Response): string {
  return (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signUp(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Integration Test",
      email: `int-${randomUUID()}@example.com`,
      password: "password-123456",
    }),
  });
  expect(res.ok).toBe(true);
  return cookieFrom(res);
}

function clientFor(cookie: string): Client {
  return createORPCClient(
    new RPCLink({ url: `${BASE}/rpc`, headers: { cookie } })
  );
}

async function clickhouseRow(eventId: string) {
  const sql = `SELECT status, output_tokens, stream FROM inference_logs WHERE event_id = '${eventId}' FORMAT JSONEachRow`;
  const res = await fetch(`${CLICKHOUSE}/?query=${encodeURIComponent(sql)}`);
  const text = (await res.text()).trim();
  return text ? JSON.parse(text.split("\n")[0]) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const suite = live ? describe : describe.skip;

suite("chat (live stack)", () => {
  let cookie: string;
  let client: Client;

  beforeAll(async () => {
    cookie = await signUp();
    client = clientFor(cookie);
  });

  it("persists a streamed turn and logs a success inference row", async () => {
    const convo = await client.conversation.create({ model: MODEL });
    expect(convo.userId).toBeTruthy();

    const res = await fetch(`${BASE}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        conversationId: convo.id,
        model: MODEL,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Reply with exactly: hello world" }],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    await res.text();

    await sleep(2500);

    const { messages } = await client.conversation.get({ id: convo.id });
    const userMsg = messages.find((m) => m.role === "user");
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(userMsg?.content).toContain("hello world");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.content.length ?? 0).toBeGreaterThan(0);
    expect(assistantMsg?.inferenceEventId).toBeTruthy();

    const row = await clickhouseRow(assistantMsg?.inferenceEventId as string);
    expect(row?.status).toBe("success");
    expect(row?.stream).toBe(true);
  }, 30_000);

  it("marks a cancelled turn and keeps any partial text", async () => {
    const convo = await client.conversation.create({ model: MODEL });

    const controller = new AbortController();
    const pending = fetch(`${BASE}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      signal: controller.signal,
      body: JSON.stringify({
        conversationId: convo.id,
        model: MODEL,
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: "Write a detailed 600-word essay about the ocean.",
              },
            ],
          },
        ],
      }),
    });

    const res = await pending;
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const start = Date.now();
    // Read until the model has actually started emitting text, then abort mid-stream.
    while (reader && Date.now() - start < 15_000) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("text-delta") && buffer.length > 400) {
        break;
      }
    }
    controller.abort();
    await reader?.cancel().catch(() => undefined);

    await sleep(2500);

    const { messages } = await client.conversation.get({ id: convo.id });
    const assistantMsg = messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.inferenceEventId).toBeTruthy();

    const row = await clickhouseRow(assistantMsg?.inferenceEventId as string);
    expect(row?.status).toBe("cancelled");
  }, 30_000);

  it("rejects an unauthenticated chat request", async () => {
    const res = await fetch(`${BASE}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: randomUUID(),
        model: MODEL,
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
      }),
    });
    expect(res.status).toBe(401);
  });
});
