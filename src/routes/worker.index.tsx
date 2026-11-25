import { createFileRoute } from "@tanstack/react-router";
import { WorkerTaskCard } from "@/components/app/WorkerTaskCard";
import { useStore } from "@/lib/store";
import { isActiveTask } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/")({
  head: () => meta("My tasks", "Your assigned material collection tasks."),
  component: MyTasks,
});

function MyTasks() {
  const { state, user, refresh } = useStore();
  const tasks = state.tasks.filter(
    (t) => t.workerId === state.currentWorkerId && isActiveTask(t.status),
  );
  const fresh = tasks.filter((t) => t.status === "assigned");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{user?.name}</p>
          <h1 className="text-xl font-semibold">My tasks</h1>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh my tasks"
          onClick={() => void refresh()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-y py-4 text-center">
        <div>
          <p className="text-xl font-semibold">{tasks.length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-info">{fresh.length}</p>
          <p className="text-xs text-muted-foreground">New</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-danger">
            {tasks.filter((t) => t.isOverdue).length}
          </p>
          <p className="text-xs text-muted-foreground">Overdue</p>
        </div>
      </div>
      {fresh.length > 0 && (
        <p className="rounded-lg bg-info-soft p-3 text-sm font-medium text-info">
          {fresh.length} new task{fresh.length > 1 ? "s" : ""} waiting for you to accept
        </p>
      )}
      {tasks.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No active tasks. You're all caught up.
        </p>
      )}
      {tasks.map((t) => (
        <WorkerTaskCard key={t.id} t={t} />
      ))}
    </div>
  );
}
