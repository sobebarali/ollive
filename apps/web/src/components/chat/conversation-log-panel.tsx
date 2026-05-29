import type { AppRouterClient } from "@ollive/api/routers/index";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { useState } from "react";

import { formatCost, formatMs, StatusBadge } from "@/components/log-shared";
import { orpc } from "@/utils/orpc";

type LogsData = Awaited<ReturnType<AppRouterClient["logs"]["list"]>>;
type LogRow = LogsData["rows"][number];

const REFETCH_MS = 2000;

export function ConversationLogPanel({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const logs = useQuery(
    orpc.logs.list.queryOptions({
      input: { range: "24h", conversationId: conversationId ?? undefined },
      enabled: conversationId !== null,
      refetchInterval: REFETCH_MS,
      placeholderData: keepPreviousData,
    })
  );

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l bg-card/40 lg:flex">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Activity className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">Activity</p>
          <p className="truncate text-muted-foreground text-xs">Updated live</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <PanelBody
          conversationId={conversationId}
          isLoading={logs.isLoading}
          rows={logs.data?.rows}
        />
      </div>
    </aside>
  );
}

function PanelBody({
  conversationId,
  isLoading,
  rows,
}: {
  conversationId: string | null;
  isLoading: boolean;
  rows: LogRow[] | undefined;
}) {
  if (conversationId === null) {
    return (
      <p className="px-1 py-6 text-center text-muted-foreground text-xs">
        Send a message to see its activity here.
      </p>
    );
  }
  if (isLoading && !rows) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-muted-foreground text-xs">
        Nothing yet. Activity appears a few seconds after each reply.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <LogCard key={row.eventId} row={row} />
      ))}
    </ul>
  );
}

function LogCard({ row }: { row: LogRow }) {
  const [open, setOpen] = useState(false);
  const isError = row.status === "error";
  return (
    <li className="rounded-lg border bg-background">
      <button
        className="flex w-full flex-col gap-1.5 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-xs">
            {row.requestModel}
          </span>
          <StatusBadge status={row.status} />
        </div>
        <div className="flex flex-wrap gap-x-2 text-muted-foreground text-xs tabular-nums">
          <span>{formatMs(row.latencyMs)}</span>
          <span>·</span>
          <span>
            {row.inputTokens}/{row.outputTokens} tok
          </span>
          <span>·</span>
          <span>{formatCost(row.costUsd)}</span>
        </div>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t px-3 py-2 text-xs">
          <Stat
            label="Time to first token"
            value={formatMs(row.timeToFirstTokenMs)}
          />
          <Stat label="Started" value={row.startTime} />
          {isError ? (
            <Snippet label="Error" value={row.errorMessage || row.errorType} />
          ) : null}
          <Snippet label="Input" value={row.inputPreview} />
          <Snippet label="Output" value={row.outputPreview} />
        </div>
      ) : null}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Snippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <pre className="whitespace-pre-wrap break-words rounded bg-muted/50 p-1.5">
        {value || "—"}
      </pre>
    </div>
  );
}
