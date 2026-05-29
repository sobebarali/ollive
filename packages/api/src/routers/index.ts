import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { conversationRouter } from "./conversation";
import { logsRouter } from "./logs";
import { metricsRouter } from "./metrics";
import { modelRouter } from "./model";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  conversation: conversationRouter,
  model: modelRouter,
  metrics: metricsRouter,
  logs: logsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
