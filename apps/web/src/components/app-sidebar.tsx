import { Button } from "@ollive/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ollive/ui/components/dropdown-menu";
import { Skeleton } from "@ollive/ui/components/skeleton";
import { cn } from "@ollive/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LogOut,
  type LucideIcon,
  MessageSquare,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { useTheme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth-client";

interface NavItem {
  icon: LucideIcon;
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/ai", label: "Chat", icon: MessageSquare },
];

export function AppSidebar() {
  return (
    <aside className="flex h-svh w-16 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground md:w-60">
      <div className="flex h-16 items-center px-3 md:px-5">
        <Link
          aria-label="Dashboard"
          className="flex items-center gap-2.5 outline-none"
          to="/dashboard"
        >
          <Logo className="hidden md:flex" />
          <Logo className="md:hidden" collapsed />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 md:px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            activeProps={{
              className:
                "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/80 text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              "justify-center md:justify-start"
            )}
            key={to}
            to={to}
          >
            <Icon className="size-5 shrink-0" />
            <span className="hidden md:inline">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="border-sidebar-border border-t p-2 md:p-3">
        <SidebarUser />
      </div>
    </aside>
  );
}

const WHITESPACE = /\s+/;

function initials(name: string): string {
  const parts = name.trim().split(WHITESPACE);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function SidebarUser() {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button
          className="w-full justify-center md:justify-start"
          variant="outline"
        >
          Sign in
        </Button>
      </Link>
    );
  }

  const { name, email } = session.user;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-auto w-full justify-center gap-2.5 px-2 py-2 md:justify-start"
            variant="ghost"
          />
        }
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs uppercase">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 flex-col items-start md:flex">
          <span className="w-full truncate text-sm leading-tight">{name}</span>
          <span className="w-full truncate text-muted-foreground text-xs leading-tight">
            {email}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate">{name}</span>
            <span className="block truncate text-muted-foreground text-xs">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Theme
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="size-4" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="size-4" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor className="size-4" />
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            authClient.signOut({
              fetchOptions: {
                onSuccess: () => navigate({ to: "/" }),
              },
            })
          }
          variant="destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
