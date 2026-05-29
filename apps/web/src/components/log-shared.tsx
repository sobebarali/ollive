import { cn } from "@ollive/ui/lib/utils";

export function formatMs(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

export function formatCost(value: number): string {
  if (value === 0) {
    return "$0";
  }
  return `$${value < 0.01 ? value.toFixed(5) : value.toFixed(4)}`;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-primary/15 text-primary",
  error: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-medium text-xs",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}
