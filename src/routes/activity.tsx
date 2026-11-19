import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageHeader, TaskStatusPill } from "@/components/app/ui";
import { useStore, fmtDateTime } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/activity")({ head: () => meta("Activity log", "Every status update, remark and photo, with timestamps."), component: ActivityLog });

function ActivityLog() {
  const { state } = useStore();
  const events = state.tasks.flatMap((t) => t.events.map((e) => ({ ...e, t }))).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHeader title="Activity log" subtitle="All updates across tasks, newest first." />
      <Card className="divide-y">
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <time className="w-32 text-xs text-muted-foreground">{fmtDateTime(e.at)}</time>
            <span className="w-32 font-medium">{e.by}</span>
            <Link to="/tasks/$id" params={{ id: e.t.id }} className="w-20 font-semibold text-primary">{e.t.ref}</Link>
            {e.status ? <TaskStatusPill status={e.status} /> : <span className="text-xs text-muted-foreground">{e.photo ? "Photo" : "Remark"}</span>}
            {e.note && <span className="flex-1 text-muted-foreground">{e.note}</span>}
          </div>
        ))}
      </Card>
    </>
  );
}
