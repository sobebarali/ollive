import type { AppRouterClient } from "@ollive/api/routers/index";
import { Button } from "@ollive/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ollive/ui/components/card";
import { Input } from "@ollive/ui/components/input";
import { Label } from "@ollive/ui/components/label";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
    return { session };
  },
});

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function RouteComponent() {
  const settings = useQuery(orpc.byok.get.queryOptions());

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Bring your own OpenRouter key to chat without limits.
          </p>
        </div>
      </div>

      {settings.isLoading || !settings.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ApiKeyCard data={settings.data} />
      )}
    </div>
  );
}

type ByokSettings = Awaited<ReturnType<AppRouterClient["byok"]["get"]>>;

function ApiKeyCard({ data }: { data: ByokSettings }) {
  const [apiKey, setApiKey] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: orpc.byok.get.queryKey() });
  }

  const setKey = useMutation(
    orpc.byok.setKey.mutationOptions({
      onSuccess: () => {
        setApiKey("");
        invalidate();
        toast.success("API key saved. You're all set.");
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const removeKey = useMutation(
    orpc.byok.removeKey.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("API key removed.");
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const usedPct = Math.min(
    100,
    Math.round((data.sharedSpentUsd / data.sharedLimitUsd) * 100)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenRouter API key</CardTitle>
        <CardDescription>
          {data.hasOwnKey
            ? "Your calls bill to your own OpenRouter account."
            : "You're on the free tier"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data.hasOwnKey ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <span className="font-mono text-sm">
              ••••••••••••{data.keyLast4 ?? "????"}
            </span>
            <Button
              disabled={removeKey.isPending}
              onClick={() => removeKey.mutate({})}
              size="sm"
              variant="outline"
            >
              Remove key
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Free shared-key usage
                </span>
                <span className="font-medium tabular-nums">
                  {formatUsd(data.sharedSpentUsd)} /{" "}
                  {formatUsd(data.sharedLimitUsd)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    data.blocked ? "h-full bg-destructive" : "h-full bg-primary"
                  }
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              {data.blocked ? (
                <p className="text-destructive text-xs">
                  You've used your free ${data.sharedLimitUsd} limit. Add your
                  own OpenRouter key below to keep chatting.
                </p>
              ) : null}
            </div>

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const key = apiKey.trim();
                if (key) {
                  setKey.mutate({ apiKey: key });
                }
              }}
            >
              <Label htmlFor="api-key">Add your OpenRouter key</Label>
              <div className="flex gap-2">
                <Input
                  autoComplete="off"
                  id="api-key"
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-…"
                  type="password"
                  value={apiKey}
                />
                <Button
                  disabled={!apiKey.trim() || setKey.isPending}
                  type="submit"
                >
                  {setKey.isPending ? "Verifying…" : "Save"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Get a key at{" "}
                <a
                  className="underline"
                  href="https://openrouter.ai/keys"
                  rel="noreferrer"
                  target="_blank"
                >
                  openrouter.ai/keys
                </a>
                . It's encrypted at rest and never shown again.
              </p>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
