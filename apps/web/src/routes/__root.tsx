import { Toaster } from "@ollive/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Ollive — LLM inference logging",
      },
      {
        name: "description",
        content:
          "Multi-turn chat, a structured logging SDK, and real-time latency, throughput, and error dashboards for LLM apps.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.svg",
        type: "image/svg+xml",
      },
    ],
  }),
});

// Routes that render full-bleed without the app sidebar shell.
const BARE_ROUTES = new Set(["/", "/login"]);

function RootComponent() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const bare = BARE_ROUTES.has(pathname);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {bare ? (
          <Outlet />
        ) : (
          <div className="flex h-svh overflow-hidden">
            <AppSidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        )}
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
    </>
  );
}
