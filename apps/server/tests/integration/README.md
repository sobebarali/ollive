# Integration tests

Full-stack tests that exercise the real HTTP surface end to end: sign-up → protected oRPC
conversation procedures → the streaming `/ai` chat route → PostgreSQL persistence → the ingestion
worker → ClickHouse inference rows.

Unlike the colocated `*.test.ts` files (unit tests and single-package DB tests under `src/`), these
require the **entire local stack** to be running and make a **real OpenRouter call**.

## Prerequisites

```bash
docker compose up        # PostgreSQL, ClickHouse, Valkey
bun run dev              # API (:3000) + ingestion worker (+ web, docs)
```

`apps/server/.env` must have a valid `OPENROUTER_API_KEY`.

## Run

```bash
bun run test:integration            # from the repo root (turbo -F server)
# or, from apps/server:
bun run test:integration
```

If the server is not reachable at `http://localhost:3000` (override with `OLLIVE_SERVER_URL`), the
suite **skips** rather than fails, so it never breaks the default `bun run test` unit run.
