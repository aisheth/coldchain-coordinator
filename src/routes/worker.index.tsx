import { createFileRoute } from "@tanstack/react-router";
import { WorkerTaskCard } from "@/components/app/WorkerTaskCard";
import { useStore } from "@/lib/store";
import { isActiveTask } from "@/lib/status";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/")({ head: () => meta("My tasks", "Your assigned material collection tasks."), component: MyTasks });

function MyTasks() {
  const { state } = useStore();
  const tasks = state.tasks.filter((t) => t.workerId === state.currentWorkerId && isActiveTask(t.status));
  const fresh = tasks.filter((t) => t.status === "assigned");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My tasks</h1>
      {fresh.length > 0 && <p className="rounded-lg bg-info-soft p-3 text-sm font-medium text-info">{fresh.length} new task{fresh.length > 1 ? "s" : ""} waiting for you to accept</p>}
      {tasks.length === 0 && <p className="py-12 text-center text-muted-foreground">No active tasks. You're all caught up.</p>}
      {tasks.map((t) => <WorkerTaskCard key={t.id} t={t} />)}
    </div>
  );
}
