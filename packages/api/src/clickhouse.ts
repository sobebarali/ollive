import { createClient } from "@clickhouse/client";
import { env } from "@ollive/env/server";

export const clickhouse = createClient({ url: env.CLICKHOUSE_URL });
