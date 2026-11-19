import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, MapPin, Phone, Store, AlertTriangle, PauseCircle, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card, TaskStatusPill } from "@/components/app/ui";
import { Timeline } from "@/components/app/Timeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore, fmtDate } from "@/lib/store";
import { describeLine } from "@/lib/procurement";
import { STATUS_LABEL, nextStatus, progressPct } from "@/lib/status";
import type { TaskStatus } from "@/lib/types";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/task/$id")({ head: () => meta("Task", "Update progress on your procurement task."), component: WorkerTask });

function shrink(file: File): Promise<string> {
  return new Promise((res) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, 640 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.7)); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

function WorkerTask() {
  const { id } = Route.useParams();
  const { state, addEvent } = useStore();
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<null | "issue" | "on_hold">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return <p>Task not found.</p>;
  const me = state.workers.find((w) => w.id === t.workerId)!;
  const p = state.projects.find((x) => x.id === t.projectId);
  const v = state.vendors.find((x) => x.id === t.vendorId);
  const lastFlow = [...t.events].reverse().find((e) => e.status && !["issue", "on_hold"].includes(e.status))?.status ?? "assigned";
  const base: TaskStatus = ["issue", "on_hold"].includes(t.status) ? lastFlow : t.status;
  const next = ["completed", "cancelled"].includes(t.status) ? null : nextStatus(base);
  const post = (status?: TaskStatus, n?: string) => { addEvent(t.id, { by: me.name, status, note: n || undefined }); toast.success(status ? `Owner notified: ${STATUS_LABEL[status]}` : "Remark sent to owner"); };

  return (
    <div className="space-y-4">
      <Link to="/worker" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />My tasks</Link>
      <div>
        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{t.ref}</span><TaskStatusPill status={t.status} /></div>
        <h1 className="mt-1 text-xl font-semibold">{p?.name}</h1>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct(t.status)}%` }} /></div>
      </div>

      {next && (
        <Button size="lg" className="h-16 w-full text-base" onClick={() => post(next, note)}>
          <CheckCircle2 className="h-5 w-5" />{t.status === "assigned" ? "Accept task" : `Mark: ${STATUS_LABEL[next]}`}
        </Button>
      )}
      {["issue", "on_hold"].includes(t.status) && <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Task is {STATUS_LABEL[t.status].toLowerCase()}. Tap the button above to resume.</p>}

      {next && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-14 flex-col gap-1 text-xs" onClick={() => setMode(mode === "issue" ? null : "issue")}><AlertTriangle className="h-5 w-5 text-danger" />Report issue</Button>
          <Button variant="outline" className="h-14 flex-col gap-1 text-xs" onClick={() => setMode(mode === "on_hold" ? null : "on_hold")}><PauseCircle className="h-5 w-5" />On hold</Button>
          <Button variant="outline" className="h-14 flex-col gap-1 text-xs" onClick={() => fileRef.current?.click()}><Camera className="h-5 w-5 text-primary" />Add photo</Button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const photo = await shrink(f); addEvent(t.id, { by: me.name, photo, note: note || undefined }); setNote(""); toast.success("Photo sent to owner"); e.target.value = ""; }} />
        </div>
      )}

      <Card className="space-y-2 p-4">
        <Textarea rows={3} className="text-base" placeholder={mode === "issue" ? "Describe the issue (required)" : "Add a remark (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
        {mode ? (
          <Button className="h-12 w-full" variant={mode === "issue" ? "destructive" : "secondary"} disabled={mode === "issue" && !note} onClick={() => { post(mode, note); setNote(""); setMode(null); }}>
            {mode === "issue" ? "Send issue report" : "Put task on hold"}
          </Button>
        ) : (
          <Button variant="secondary" className="h-12 w-full" disabled={!note} onClick={() => { post(undefined, note); setNote(""); }}><Send className="h-4 w-4" />Send remark</Button>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Materials to collect</h2>
        <ul className="divide-y">{t.materials.map((m) => { const d = describeLine(state.catalogue, m); return (
          <li key={m.itemId + m.variantId} className="flex justify-between gap-2 py-2.5 text-sm"><div><p className="font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{d.spec}{m.remarks ? ` · ${m.remarks}` : ""}</p></div><span className="font-semibold">{m.qty} {d.unit}</span></li>); })}</ul>
      </Card>

      <Card className="space-y-3 p-4 text-sm">
        <div><p className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4" />Vendor</p><p className="mt-1">{v?.name}</p><p className="text-muted-foreground">{v?.address}</p>
          {v?.phone && <a href={`tel:${v.phone}`} className="mt-2 inline-flex items-center gap-1 font-medium text-primary"><Phone className="h-4 w-4" />Call vendor</a>}</div>
        <div className="border-t pt-3"><p className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" />Deliver to</p><p className="mt-1">{t.deliverySite}</p><p className="text-muted-foreground">By {fmtDate(t.dueDate)}</p>
          <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(t.deliverySite)}`} className="mt-2 inline-flex font-medium text-primary">Open in Maps</a></div>
        {t.instructions && <p className="rounded-md bg-muted p-3">{t.instructions}</p>}
      </Card>

      <Card className="p-4"><h2 className="mb-4 font-semibold">Timeline</h2><Timeline events={t.events} /></Card>
    </div>
  );
}
