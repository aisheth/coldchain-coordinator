import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, PageHeader, TaskStatusPill, Initials } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { useStore, fmtDate, timeAgo } from "@/lib/store";
import { isActiveTask } from "@/lib/status";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/procurement/")({
  head: () => meta("Procurement", "All procurement tasks with status, worker and vendor."),
  component: Procurement,
});

const filters = { active: "Active", issue: "Issues", completed: "Completed", all: "All" } as const;

function Procurement() {
  const { state } = useStore();
  const [f, setF] = useState<keyof typeof filters>("active");
  const list = state.tasks.filter((t) => f === "all" || (f === "active" ? isActiveTask(t.status) : f === "issue" ? ["issue", "on_hold"].includes(t.status) : t.status === "completed"));
  return (
    <>
      <PageHeader title="Procurement" subtitle="Material collection tasks assigned to your workers." actions={<Button asChild><Link to="/procurement/new"><Plus className="h-4 w-4" />New task</Link></Button>} />
      <div className="mb-4 flex gap-1 rounded-lg bg-secondary p-1 w-fit">
        {Object.entries(filters).map(([k, v]) => <button key={k} onClick={() => setF(k as keyof typeof filters)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${f === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{v}</button>)}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Task</th><th className="px-5 py-3">Project</th><th className="px-5 py-3">Worker</th><th className="px-5 py-3">Vendor</th><th className="px-5 py-3">Due</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last update</th></tr></thead>
          <tbody className="divide-y">
            {list.map((t) => {
              const w = state.workers.find((x) => x.id === t.workerId);
              return (
                <tr key={t.id} className="hover:bg-muted/50">
                  <td className="px-5 py-3"><Link to="/tasks/$id" params={{ id: t.id }} className="font-semibold text-primary">{t.ref}</Link><p className="text-xs text-muted-foreground">{t.materials.length} items</p></td>
                  <td className="px-5 py-3">{state.projects.find((p) => p.id === t.projectId)?.name}</td>
                  <td className="px-5 py-3"><span className="flex items-center gap-2"><Initials name={w?.name ?? "?"} className="h-6 w-6 text-[10px]" />{w?.name}</span></td>
                  <td className="px-5 py-3 text-muted-foreground">{state.vendors.find((v) => v.id === t.vendorId)?.name ?? "—"}</td>
                  <td className="px-5 py-3">{fmtDate(t.dueDate)}</td>
                  <td className="px-5 py-3"><TaskStatusPill status={t.status} /></td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{timeAgo(t.events.at(-1)?.at ?? t.createdAt)}</td>
                </tr>);
            })}
            {list.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No tasks here.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
