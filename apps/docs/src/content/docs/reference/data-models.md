---
title: Data Models (PostgreSQL)
description: The conversation and message tables that back the chatbot.
---

Conversational data lives in PostgreSQL via Drizzle, in `packages/db`. Inference metrics live
separately in ClickHouse - see [Inference log schema](/reference/inference-log-schema/). The
reasoning for the split is on
[Schema design & tradeoffs](/explanation/schema-design-and-tradeoffs/).

## `conversations` table

One row per chat thread.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Conversation id (referenced by inference logs). |
| `userId` | text | Owner; foreign key to Better Auth `user.id`. |
| `title` | string | Display title, derived from the first message. |
| `status` | enum | `active` \| `cancelled` - drives the UI list/resume/cancel. |
| `model` | string | Default model for the thread. |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | Bumped on each new message; used to sort the list. |

```ts
import { user } from "./auth";

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New conversation"),
  status: text("status").notNull().default("active"),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

## `messages` table

One row per turn. Stored as its own table (linked by foreign key) so a thread can grow
unbounded while reads stay efficient through indexed `conversationId` lookups.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Message id (referenced by inference logs as `message_id`). |
| `conversationId` | UUID | Parent thread; indexed for thread reads. |
| `role` | enum | `user` \| `assistant` \| `system`. |
| `content` | string | Message text. |
| `inferenceEventId` | text | For assistant messages, links to the ClickHouse inference log `event_id`. |
| `createdAt` | timestamp | Orders the thread. |

```ts
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    inferenceEventId: text("inference_event_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversationId)]
);
```

## Relationships

```text
User 1---* Conversation 1---* Message
                               | inferenceEventId
                               v
                     ClickHouse inference_logs.event_id
```

::::note[Why keep messages in a separate table]
Keeping messages in a separate table avoids ever-growing row payloads on the conversation record
and keeps pagination/query plans predictable. A dedicated `messages` table indexed by
`conversationId` keeps thread reads fast and growth safe.
::::
