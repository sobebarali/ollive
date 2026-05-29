import { env } from "@ollive/env/web";
import { Button } from "@ollive/ui/components/button";
import { cn } from "@ollive/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Boxes,
  Gauge,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  // Signed-in users land on the dashboard; the marketing page is for visitors only.
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session.data) {
      redirect({ to: "/dashboard", throw: true });
    }
  },
});

const HERO_IMAGE = "https://picsum.photos/seed/ollive-olive-grove/1200/1500";

interface Feature {
  body: string;
  icon: LucideIcon;
  title: string;
}

const FEATURES: Feature[] = [
  {
    icon: Boxes,
    title: "Drop-in logging SDK",
    body: "Wrap any model call and capture latency, tokens, provider, and previews as one structured event.",
  },
  {
    icon: Activity,
    title: "Near-real-time ingestion",
    body: "Each event is validated, redacted, priced, and stored moments after the call.",
  },
  {
    icon: Gauge,
    title: "Live dashboards",
    body: "Throughput, latency percentiles, and error breakdowns — per conversation.",
  },
  {
    icon: ShieldCheck,
    title: "PII-safe by default",
    body: "Emails, tokens, and secrets are redacted before any preview ever leaves the process.",
  },
];

const DECOR_BARS = [40, 65, 38, 72, 55, 88, 60, 95, 70];

function apiStatusLabel(isLoading: boolean, connected: boolean): string {
  if (isLoading) {
    return "Connecting to API…";
  }
  return connected ? "API connected" : "API offline";
}

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());
  const connected = healthCheck.data === "OK";

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/login">
            <Button>Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-20">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-secondary px-3 py-1 font-medium text-secondary-foreground text-xs">
              <span
                className={cn(
                  "size-2 rounded-full",
                  connected ? "bg-primary" : "bg-destructive"
                )}
              />
              {apiStatusLabel(healthCheck.isLoading, connected)}
            </span>
            <h1 className="text-balance font-semibold text-4xl tracking-tight md:text-5xl">
              Observability for every LLM call.
            </h1>
            <p className="text-pretty text-lg text-muted-foreground">
              Ollive is a lightweight inference logging and ingestion system for
              LLM chat apps — multi-turn chat, a structured logging SDK, and
              real-time latency, throughput, and error dashboards.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/login">
                <Button className="gap-2" size="lg">
                  Get started free
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href={env.VITE_DOCS_URL} rel="noreferrer" target="_blank">
                <Button size="lg" variant="outline">
                  See how it works
                </Button>
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border shadow-xl">
              <img
                alt="Olive grove"
                className="h-full w-full object-cover"
                height={1500}
                src={HERO_IMAGE}
                width={1200}
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/70 via-primary/25 to-transparent mix-blend-multiply" />
            </div>
            <div className="absolute right-4 bottom-4 left-4 rounded-2xl border bg-card/90 p-4 shadow-lg backdrop-blur">
              <p className="text-muted-foreground text-xs">p95 latency</p>
              <p className="font-semibold text-2xl">812 ms</p>
              <div className="mt-2 flex items-end gap-1">
                {DECOR_BARS.map((h, i) => (
                  <span
                    className="flex-1 rounded-sm bg-primary/70"
                    // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
                    key={i}
                    style={{ height: `${h * 0.4}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
              key={title}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="font-medium">{title}</h3>
              <p className="text-muted-foreground text-sm">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-muted-foreground text-sm sm:flex-row">
          <span>© 2026 Ollive</span>
        </div>
      </footer>
    </div>
  );
}
