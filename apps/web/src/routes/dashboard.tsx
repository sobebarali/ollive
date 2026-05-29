import type { AppRouterClient } from "@ollive/api/routers/index";
import { Button } from "@ollive/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ollive/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@ollive/ui/components/chart";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Clock,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

type OverviewData = Awaited<ReturnType<AppRouterClient["metrics"]["overview"]>>;

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    return { session };
  },
});

const RANGES = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
] as const;

type Range = (typeof RANGES)[number]["value"];

const throughputConfig = {
  count: { label: "Requests", color: "var(--chart-1)" },
} satisfies ChartConfig;

function formatBucket(bucket: string, range: Range): string {
  // ClickHouse returns `YYYY-MM-DD HH:MM:SS`; show the date for the 7d view, the time otherwise.
  const [date, time] = bucket.split(" ");
  if (range === "7d") {
    return date?.slice(5) ?? bucket;
  }
  return time?.slice(0, 5) ?? bucket;
}

function formatMs(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function RouteComponent() {
  const [range, setRange] = useState<Range>("24h");
  const metrics = useQuery(
    orpc.metrics.overview.queryOptions({ input: { range } })
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="size-5" />
          </span>
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">
              Inference metrics
            </h1>
            <p className="text-muted-foreground text-sm">
              Throughput, latency, and errors for your conversations.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              onClick={() => setRange(r.value)}
              size="sm"
              variant={range === r.value ? "default" : "ghost"}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <DashboardBody
        data={metrics.data}
        error={metrics.error}
        isError={metrics.isError}
        isLoading={metrics.isLoading}
        range={range}
      />
    </div>
  );
}

function DashboardBody({
  isLoading,
  isError,
  error,
  data,
  range,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  data: OverviewData | undefined;
  range: Range;
}) {
  if (isLoading) {
    return <DashboardSkeleton />;
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-xs">
          Could not load metrics. {error?.message}
        </CardContent>
      </Card>
    );
  }
  if (!data) {
    return null;
  }
  return <DashboardContent data={data} range={range} />;
}

function DashboardContent({
  data,
  range,
}: {
  data: OverviewData;
  range: Range;
}) {
  const { throughput, latency, errors } = data;
  const chartData = throughput.buckets.map((b) => ({
    bucket: formatBucket(b.bucket, range),
    count: b.count,
  }));

  if (throughput.total === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-xs">
          No inference logs in this window yet. Send a chat message, then check
          back once the ingestion worker has processed it.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Throughput</CardTitle>
          <CardDescription>
            {throughput.total} request{throughput.total === 1 ? "" : "s"} in
            this window
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="h-[200px] w-full"
            config={throughputConfig}
          >
            <BarChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="bucket"
                minTickGap={24}
                tickLine={false}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
              <Bar dataKey="count" fill="var(--color-count)" radius={2} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Clock}
          label="Avg latency"
          value={formatMs(latency.avgMs)}
        />
        <StatCard
          icon={Gauge}
          label="p50 latency"
          value={formatMs(latency.p50Ms)}
        />
        <StatCard
          icon={Activity}
          label="p95 latency"
          value={formatMs(latency.p95Ms)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
          </CardHeader>
          <CardContent>
            <CountList
              empty="No calls in this window."
              rows={errors.byStatus.map((s) => ({
                key: s.status,
                count: s.count,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Errors by type</CardTitle>
          </CardHeader>
          <CardContent>
            <CountList
              empty="No errors in this window."
              rows={errors.byType.map((e) => ({
                key: e.errorType,
                count: e.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        </CardAction>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function CountList({
  rows,
  empty,
}: {
  rows: { key: string; count: number }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-xs">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li className="flex items-center justify-between text-xs" key={row.key}>
          <span className="text-muted-foreground">{row.key}</span>
          <span className="font-medium font-mono tabular-nums">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[260px] w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
