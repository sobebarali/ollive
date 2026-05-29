import { cn } from "@ollive/ui/lib/utils";

export function OlliveMark({ className }: { className?: string }) {
  return (
    <svg
      aria-label="Ollive"
      className={cn("size-8", className)}
      role="img"
      viewBox="0 0 32 32"
    >
      <rect className="fill-primary" height="32" rx="9" width="32" />
      <path
        className="fill-primary-foreground"
        d="M16 6.5c5 3 7.5 7 7.5 11.2a7.5 7.5 0 0 1-15 0C8.5 13.5 11 9.5 16 6.5Z"
        opacity="0.92"
      />
      <circle className="fill-primary" cx="16" cy="18.6" r="2.8" />
      <path
        className="stroke-primary-foreground"
        d="M16 6.5C16 4.5 17.6 3 20 3"
        fill="none"
        opacity="0.92"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Logo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <OlliveMark />
      {collapsed ? null : (
        <span className="font-semibold text-lg tracking-tight">Ollive</span>
      )}
    </div>
  );
}
