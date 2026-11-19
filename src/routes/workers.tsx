import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, TaskStatusPill, Initials, Field } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, timeAgo } from "@/lib/store";
import { isActiveTask } from "@/lib/status";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/workers")({ head: () => meta("Workers", "Field workers and their current assignments."), component: Workers });

function Workers() {
  const { state, addWorker } = useStore();
  const [d, setD] = useState({ name: "", phone: "", area: "" });
  return (
    <>
      <PageHeader title="Workers" subtitle="See who is doing what, right now." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.workers.map((w) => {
          const tasks = state.tasks.filter((t) => t.workerId === w.id);
          const active = tasks.filter((t) => isActiveTask(t.status));
          const last = tasks.flatMap((t) => t.events).filter((e) => e.by === w.name).sort((a, b) => b.at.localeCompare(a.at))[0];
          return (
            <Card key={w.id} className="p-5">
              <div className="flex items-center gap-3"><Initials name={w.name} className="h-10 w-10" /><div><p className="font-semibold">{w.name}</p><p className="text-xs text-muted-foreground">{w.area}</p></div></div>
              <a href={`tel:${w.phone}`} className="mt-3 flex items-center gap-2 text-sm text-primary"><Phone className="h-3.5 w-3.5" />{w.phone}</a>
              <div className="mt-4 space-y-2 border-t pt-3">
                {active.length === 0 ? <p className="text-sm text-muted-foreground">Available — no active task</p> : active.map((t) => <div key={t.id} className="flex items-center justify-between text-sm"><span className="font-medium">{t.ref}</span><TaskStatusPill status={t.status} /></div>)}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Last update: {last ? timeAgo(last.at) : "—"} · {tasks.filter((t) => t.status === "completed").length} completed</p>
            </Card>
          );
        })}
        <Card className="space-y-3 border-dashed p-5">
          <p className="font-semibold">Add worker</p>
          <Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Phone"><Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
          <Field label="Area"><Input value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })} /></Field>
          <Button disabled={!d.name} onClick={() => { addWorker(d); setD({ name: "", phone: "", area: "" }); toast.success("Worker added"); }}><Plus className="h-4 w-4" />Add</Button>
        </Card>
      </div>
    </>
  );
}
