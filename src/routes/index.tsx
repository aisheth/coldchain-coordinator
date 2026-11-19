import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ClipboardList, FolderKanban, Truck, Users, Plus } from "lucide-react";
import { Card, PageHeader, TaskStatusPill, Initials } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useStore, timeAgo, fmtDate } from "@/lib/store";
import { STATUS_LABEL, isActiveTask, isInProgress, progressPct } from "@/lib/status";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => meta("Dashboard", "Live overview of cold storage projects, procurement tasks and worker updates."),
  component: Dashboard,
});

function Dashboard() {
  const { state } = useStore();
  const { tasks, projects, workers } = state;
  const activeWorkers = new Set(tasks.filter((t) => isActiveTask(t.status)).map((t) => t.workerId));
  const stats = [
    { label: "Active projects", value: projects.filter((p) => p.status !== "completed").length, icon: FolderKanban, tone: "text-info bg-info-soft" },
    { label: "Pending tasks", value: tasks.filter((t) => t.status === "assigned").length, icon: ClipboardList, tone: "text-info bg-info-soft" },
    { label: "In progress", value: tasks.filter((t) => isInProgress(t.status)).length, icon: Truck, tone: "text-warning bg-warning-soft" },
    { label: "Awaiting delivery", value: tasks.filter((t) => isActiveTask(t.status) && !["delivered"].includes(t.status)).reduce((n, t) => n + t.materials.length, 0), icon: Truck, tone: "text-warning bg-warning-soft", hint: "material lines" },
    { label: "Completed", value: tasks.filter((t) => t.status === "completed").length, icon: CheckCircle2, tone: "text-success bg-success-soft" },
    { label: "Workers on duty", value: activeWorkers.size, icon: Users, tone: "text-foreground bg-secondary" },
  ];
  const events = tasks.flatMap((t) => t.events.filter((e) => e.by !== "Owner").map((e) => ({ ...e, task: t }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  const issues = tasks.filter((t) => t.status === "issue" || t.status === "on_hold");
  const live = tasks.filter((t) => isActiveTask(t.status));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Everything your team is doing, without a phone call."
        actions={<Button asChild><Link to="/procurement/new"><Plus className="h-4 w-4" />New procurement task</Link></Button>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${s.tone}`}><s.icon className="h-4 w-4" /></span>
            <p className="mt-3 font-display text-3xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}{s.hint ? ` · ${s.hint}` : ""}</p>
          </Card>
        ))}
      </div>

      {issues.length > 0 && (
        <Card className="mt-6 border-danger/30 bg-danger-soft p-4">
          <div className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4" />Needs your attention</div>
          <ul className="mt-2 space-y-1 text-sm">
            {issues.map((t) => (
              <li key={t.id}><Link to="/tasks/$id" params={{ id: t.id }} className="font-medium text-foreground underline-offset-2 hover:underline">{t.ref}</Link>
                <span className="text-muted-foreground"> — {t.events.at(-1)?.note ?? STATUS_LABEL[t.status]}</span></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="border-b px-5 py-4"><h2 className="font-semibold">Live procurement tasks</h2></div>
          <div className="divide-y">
            {live.length === 0 && <p className="p-5 text-sm text-muted-foreground">No active tasks.</p>}
            {live.map((t) => {
              const w = workers.find((x) => x.id === t.workerId); const p = projects.find((x) => x.id === t.projectId);
              return (
                <Link key={t.id} to="/tasks/$id" params={{ id: t.id }} className="block px-5 py-4 hover:bg-muted/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Initials name={w?.name ?? "?"} />
                      <div><p className="text-sm font-semibold">{t.ref} · {p?.name}</p><p className="text-xs text-muted-foreground">{w?.name} · due {fmtDate(t.dueDate)}</p></div>
                    </div>
                    <TaskStatusPill status={t.status} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progressPct(t.status)}%` }} /></div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-semibold">Recent worker updates</h2><Link to="/activity" className="text-xs font-medium text-primary">View all</Link></div>
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm"><span className="font-semibold">{e.by}</span> <span className="text-muted-foreground">on</span> <Link to="/tasks/$id" params={{ id: e.task.id }} className="font-medium text-primary">{e.task.ref}</Link></p><span className="text-xs text-muted-foreground">{timeAgo(e.at)}</span></div>
                <div className="mt-1">{e.status ? <TaskStatusPill status={e.status} /> : <span className="text-xs text-muted-foreground">{e.photo ? "Uploaded a photo" : "Added a remark"}</span>}</div>
                {e.note && <p className="mt-1 text-xs text-muted-foreground">“{e.note}”</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
