import { createFileRoute } from "@tanstack/react-router";
import { WorkerTaskCard } from "@/components/app/WorkerTaskCard";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/history")({ head: () => meta("Task history", "Your completed and cancelled tasks."), component: History });

function History() {
  const { state } = useStore();
  const tasks = state.tasks.filter((t) => t.workerId === state.currentWorkerId && ["completed", "cancelled"].includes(t.status));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Task history</h1>
      {tasks.length === 0 && <p className="py-12 text-center text-muted-foreground">No finished tasks yet.</p>}
      {tasks.map((t) => <WorkerTaskCard key={t.id} t={t} />)}
    </div>
  );
}
