import type { AppRouterClient } from "@ollive/api/routers/index";
import { Button } from "@ollive/ui/components/button";
import { Card, CardContent } from "@ollive/ui/components/card";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { cn } from "@ollive/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { useState } from "react";

import { formatCost, formatMs, StatusBadge } from "@/components/log-shared";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

type LogsData = Awaited<ReturnType<AppRouterClient["logs"]["list"]>>;
type LogRow = LogsData["rows"][number];

export const Route = createFileRoute("/logs")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
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

const STATUSES = [
  { value: undefined, label: "All" },
  { value: "success", label: "Success" },
  { value: "error", label: "Error" },
  { value: "cancelled", label: "Cancelled" },
] as const;

type StatusFilter = (typeof STATUSES)[number]["value"];

const PAGE_SIZE = 50;
const REFETCH_MS = 5000;

function RouteComponent() {
  const [range, setRange] = useState<Range>("24h");
  const [status, setStatus] = useState<StatusFilter>(undefined);
  const [offset, setOffset] = useState(0);

  const logs = useQuery(
    orpc.logs.list.queryOptions({
      input: { range, status, limit: PAGE_SIZE, offset },
      refetchInterval: REFETCH_MS,
      placeholderData: keepPreviousData,
    })
  );

  function changeRange(next: Range) {
    setRange(next);
    setOffset(0);
  }

  function changeStatus(next: StatusFilter) {
    setStatus(next);
    setOffset(0);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScrollText className="size-5" />
          </span>
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">
              Inference logs
            </h1>
            <p className="text-muted-foreground text-sm">
              Every model call, newest first.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              onClick={() => changeRange(r.value)}
              size="sm"
              variant={range === r.value ? "default" : "ghost"}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s.label}
            onClick={() => changeStatus(s.value)}
            size="sm"
            variant={status === s.value ? "secondary" : "ghost"}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <LogsBody
        data={logs.data}
        error={logs.error}
        isError={logs.isError}
        isLoading={logs.isLoading}
      />

      {logs.data && logs.data.total > 0 ? (
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>
            Showing {offset + 1}–{offset + logs.data.rows.length} of{" "}
            {logs.data.total}
          </span>
          <div className="flex gap-1">
            <Button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={!logs.data.hasMore}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LogsBody({
  isLoading,
  isError,
  error,
  data,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  data: LogsData | undefined;
}) {
  if (isLoading) {
    return <Skeleton className="h-[420px] w-full" />;
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-xs">
          Could not load logs. {error?.message}
        </CardContent>
      </Card>
    );
  }
  if (!data || data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-xs">
          No data in this window yet. Send a chat message, then check back in a
          few seconds.
        </CardContent>
      </Card>
    );
  }
  return <LogsTable rows={data.rows} />;
}

function LogsTable({ rows }: { rows: LogRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs">
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Latency</th>
              <th className="px-4 py-2.5 text-right font-medium">TTFT</th>
              <th className="px-4 py-2.5 text-right font-medium">Tokens</th>
              <th className="px-4 py-2.5 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <LogTableRow
                isExpanded={expanded === row.eventId}
                key={row.eventId}
                onToggle={() =>
                  setExpanded(expanded === row.eventId ? null : row.eventId)
                }
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LogTableRow({
  row,
  isExpanded,
  onToggle,
}: {
  row: LogRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40"
        onClick={onToggle}
      >
        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-muted-foreground text-xs tabular-nums">
          {row.startTime}
        </td>
        <td className="px-4 py-2.5">
          <span className="font-medium">{row.requestModel}</span>
          <span className="ml-1.5 text-muted-foreground text-xs">
            {row.system}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          {formatMs(row.latencyMs)}
        </td>
        <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
          {formatMs(row.timeToFirstTokenMs)}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          {row.inputTokens}
          <span className="text-muted-foreground"> / </span>
          {row.outputTokens}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">
          {formatCost(row.costUsd)}
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b bg-muted/20 last:border-0">
          <td className="px-4 py-3" colSpan={7}>
            <LogDetail row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LogDetail({ row }: { row: LogRow }) {
  const isError = row.status === "error";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <Field label="Response model" value={row.responseModel} />
        <Field label="Streamed" value={row.stream ? "yes" : "no"} />
        <Field label="Error type" value={row.errorType || "—"} />
        {isError ? (
          <Field
            label="HTTP status"
            value={row.errorStatus ? String(row.errorStatus) : "—"}
          />
        ) : null}
        <Field label="Event id" mono value={row.eventId} />
        <Field label="Conversation" mono value={row.conversationId} />
        <Field label="Message" mono value={row.messageId} />
      </div>
      {isError && row.errorMessage ? (
        <Preview label="Error" value={row.errorMessage} />
      ) : null}
      <Preview label="Input" value={row.inputPreview} />
      <Preview label="Output" value={row.outputPreview} />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("truncate", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label} preview</span>
      <pre className="whitespace-pre-wrap break-words rounded-md bg-background p-2.5 text-xs">
        {value || "—"}
      </pre>
    </div>
  );
}
