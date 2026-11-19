import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, MapPin, Phone, Store, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { Card, TaskStatusPill, selectCls } from "@/components/app/ui";
import { Timeline } from "@/components/app/Timeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore, fmtDate } from "@/lib/store";
import { describeLine } from "@/lib/procurement";
import { FLOW, EXCEPTIONS, STATUS_LABEL, progressPct } from "@/lib/status";
import type { TaskStatus } from "@/lib/types";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/tasks/$id")({
  head: () => meta("Task details", "Procurement task materials, vendor, worker and activity timeline."),
  component: TaskPage,
});

function TaskPage() {
  const { id } = Route.useParams();
  const { state, addEvent } = useStore();
  const [note, setNote] = useState("");
  const [st, setSt] = useState<TaskStatus | "">("");
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return <p className="text-muted-foreground">Task not found. <Link to="/procurement" className="text-primary">Back</Link></p>;
  const p = state.projects.find((x) => x.id === t.projectId);
  const w = state.workers.find((x) => x.id === t.workerId);
  const v = state.vendors.find((x) => x.id === t.vendorId);
  const photos = t.events.filter((e) => e.photo);
  const step = FLOW.indexOf(t.status);

  return (
    <>
      <Link to="/procurement" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Procurement</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-semibold text-muted-foreground">{t.ref}</p><h1 className="text-2xl font-semibold">{p?.name}</h1><p className="text-sm text-muted-foreground">{p?.customer}</p></div>
        <TaskStatusPill status={t.status} className="text-sm" />
      </div>

      <Card className="mb-6 p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Progress</span><span>{progressPct(t.status)}%</span></div>
        <div className="mt-3 grid grid-cols-9 gap-1">
          {FLOW.map((s, i) => <div key={s} title={STATUS_LABEL[s]} className={`h-2 rounded-full ${step >= i ? (t.status === "completed" ? "bg-success" : "bg-primary") : "bg-muted"}`} />)}
        </div>
        <div className="mt-2 hidden grid-cols-9 gap-1 text-[10px] leading-tight text-muted-foreground lg:grid">{FLOW.map((s) => <span key={s}>{STATUS_LABEL[s]}</span>)}</div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="border-b px-5 py-4"><h2 className="font-semibold">Materials ({t.materials.length})</h2></div>
            <table className="w-full text-sm"><tbody className="divide-y">
              {t.materials.map((m) => { const d = describeLine(state.catalogue, m); return (
                <tr key={m.itemId + m.variantId}><td className="px-5 py-2.5 font-medium">{d.name}</td><td className="px-5 py-2.5">{d.spec}</td><td className="px-5 py-2.5">{m.qty} {d.unit}</td><td className="px-5 py-2.5 text-muted-foreground">{m.remarks}</td></tr>); })}
            </tbody></table>
          </Card>
          <Card className="p-5">
            <h2 className="mb-5 font-semibold">Activity timeline</h2>
            <Timeline events={t.events} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-2.5 p-5 text-sm">
            <h2 className="font-semibold">Worker</h2>
            <p className="flex gap-2"><User className="h-4 w-4 text-muted-foreground" />{w?.name}</p>
            <a href={`tel:${w?.phone}`} className="flex gap-2 text-primary"><Phone className="h-4 w-4" />{w?.phone}</a>
            <h2 className="pt-3 font-semibold">Vendor</h2>
            <p className="flex gap-2"><Store className="h-4 w-4 text-muted-foreground" />{v?.name ?? "—"}</p>
            {v && <p className="flex gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{v.address} · {v.phone}</p>}
            <h2 className="pt-3 font-semibold">Delivery</h2>
            <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />{t.deliverySite}</p>
            <p className="flex gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />Due {fmtDate(t.dueDate)}</p>
            {t.instructions && <p className="rounded-md bg-muted p-3 text-muted-foreground">{t.instructions}</p>}
          </Card>
          {photos.length > 0 && <Card className="p-5"><h2 className="mb-3 font-semibold">Proof photos</h2><div className="grid grid-cols-2 gap-2">{photos.map((e) => <img key={e.id} src={e.photo} alt="Proof" className="aspect-square rounded-md border object-cover" />)}</div></Card>}
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Owner action</h2>
            <select className={selectCls} value={st} onChange={(e) => setSt(e.target.value as TaskStatus)}>
              <option value="">Keep status</option>{[...FLOW, ...EXCEPTIONS].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <Textarea rows={2} placeholder="Note to worker" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button className="w-full" disabled={!st && !note} onClick={() => { addEvent(t.id, { by: "Owner", status: st || undefined, note: note || undefined }); setNote(""); setSt(""); toast.success("Update posted"); }}>Post update</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
