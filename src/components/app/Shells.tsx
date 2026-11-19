import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, Boxes, ClipboardList, FolderKanban, History, LayoutDashboard, ListChecks, Settings, Snowflake, Store, User, Users, Smartphone, Monitor } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const ownerNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/procurement", label: "Procurement", icon: ClipboardList },
  { to: "/workers", label: "Workers", icon: Users },
  { to: "/vendors", label: "Vendors", icon: Store },
  { to: "/catalogue", label: "Item Catalogue", icon: Boxes },
  { to: "/activity", label: "Activity Log", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Snowflake className="h-4 w-4" /></span>
      <span className={cn("font-display text-lg font-semibold", light ? "text-sidebar-accent-foreground" : "text-foreground")}>ColdTrack</span>
    </div>
  );
}

export function OwnerShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to) || (to === "/procurement" && path.startsWith("/tasks")));
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar p-4 md:flex">
        <Brand light />
        <nav className="mt-8 flex-1 space-y-1">
          {ownerNav.map((n) => (
            <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", active(n.to) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
              <n.icon className="h-4 w-4" />{n.label}
            </Link>
          ))}
        </nav>
        <Link to="/worker" className="flex items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent">
          <Smartphone className="h-4 w-4" />Switch to worker app
        </Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <Brand />
          <Link to="/worker" className="text-sm font-medium text-primary">Worker app</Link>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {ownerNav.map((n) => (
            <Link key={n.to} to={n.to} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground", active(n.to) && "bg-secondary text-foreground")}>{n.label}</Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

const workerNav = [
  { to: "/worker", label: "My Tasks", icon: ListChecks },
  { to: "/worker/history", label: "History", icon: History },
  { to: "/worker/profile", label: "Profile", icon: User },
] as const;

export function WorkerShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useStore();
  const me = state.workers.find((w) => w.id === state.currentWorkerId);
  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background shadow-[var(--shadow-card)]">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
          <Brand />
          <Link to="/" className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Monitor className="h-3.5 w-3.5" />Owner view</Link>
        </header>
        {me && <div className="bg-sidebar px-4 py-2 text-xs text-sidebar-foreground">Signed in as <span className="font-semibold text-sidebar-accent-foreground">{me.name}</span></div>}
        <main className="flex-1 p-4 pb-24">{children}</main>
        <nav className="fixed bottom-0 left-1/2 grid w-full max-w-md -translate-x-1/2 grid-cols-3 border-t bg-card">
          {workerNav.map((n) => {
            const on = n.to === "/worker" ? path === "/worker" || path.startsWith("/worker/task") : path.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-1 py-3 text-xs font-medium text-muted-foreground", on && "text-primary")}>
                <n.icon className="h-5 w-5" />{n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
